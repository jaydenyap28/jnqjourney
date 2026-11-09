// Synthetic fixtures only; never access a formal project or bucket.
import {readFile,writeFile} from 'node:fs/promises'
import {randomUUID,createHash} from 'node:crypto'
import {inflateSync} from 'node:zlib'
import {isolatedKeys,isolatedRequest,ISOLATED_REF} from './isolated-supabase.mjs'
import {ACCOUNT,BUCKET,privateWranglerToken} from './candidate-cloudflare.mjs'
const root='artifacts/cloudflare-compatibility-native/'
const preflight=JSON.parse(await readFile(root+'preflight.json'))
if(preflight.verdict!=='READY_FOR_ISOLATED_FIXTURE_SETUP'||!preflight.boundariesPassed||!preflight.schemaCompatible)throw Error('PREFLIGHT_REQUIRED')
const file=root+'fixtures.json'
const repairing=process.argv.includes('--repair-synthetic-png')
const report=repairing?JSON.parse(await readFile(file)):{projectRef:ISOLATED_REF,bucket:BUCKET,startedAt:new Date().toISOString(),fixtures:[],media:[],operations:{r2Put:0,r2Get:0,dbInsert:0,dbPatch:0},complete:false}
if(repairing&&(report.complete||report.projectRef!==ISOLATED_REF||report.bucket!==BUCKET||report.fixtures.length!==6))throw Error('REPAIR_CHECKPOINT_REFUSED')
if(!repairing)await writeFile(file,JSON.stringify(report,null,2),{flag:'wx'})
const save=()=>writeFile(file,JSON.stringify(report,null,2))
try {
  const keys=await isolatedKeys(),token=await privateWranglerToken()
  for(const role of repairing?[]:['editor','gallery','redirect','hidden','delete','cycle']) {
    const response=await isolatedRequest(keys,'/rest/v1/locations',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({name:`Isolated compatibility ${role}`,name_cn:`合成兼容 ${role}`,latitude:1.3,longitude:103.8,status:'active',publication_status:role==='hidden'?'hidden':'published',updated_at:null,images:[],tags:[]})})
    if(!response.ok)throw Error('FIXTURE_INSERT_FAILED')
    const [row]=await response.json()
    if(!Number.isSafeInteger(row.id)||[1,91001,91002].includes(row.id))throw Error('FIXTURE_ID_INVALID')
    report.fixtures.push({role,id:row.id,slug:`cloudflare-loop-compat-${role}-${row.id}`,updatedAt:row.updated_at});report.operations.dbInsert++;await save()
  }
  const gallery=report.fixtures.find(f=>f.role==='gallery')
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=','base64')
  // Validate CRC for every chunk and inflate IDAT before any further uploads.
  for(let p=8;p<png.length;){const n=png.readUInt32BE(p);let crc=0xffffffff;for(const v of png.subarray(p+4,p+8+n)){crc^=v;for(let bit=0;bit<8;bit++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1}if(((crc^0xffffffff)>>>0)!==png.readUInt32BE(p+8+n))throw Error('SYNTHETIC_PNG_CRC_INVALID');if(png.subarray(p+4,p+8).toString()==='IDAT')inflateSync(png.subarray(p+8,p+8+n));p+=n+12}
  const previous=repairing?[...report.media]:[]
  if(repairing){report.syntheticRepair={reason:'Original 68-byte synthetic PNG IDAT CRC invalid; no Worker tests or deployment occurred',priorMediaCount:previous.length,startedAt:new Date().toISOString()};report.media=[]}
  report.imageSha256=createHash('sha256').update(png).digest('hex')
  async function put(key,bytes,type) {
    if(!key.startsWith(`media/candidate/${gallery.id}/`)&&!key.startsWith(`_candidate-validation/${gallery.id}/`))throw Error('R2_PREFIX_REFUSED')
    const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects/${key}`,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':type},body:bytes,redirect:'error',signal:AbortSignal.timeout(15000)})
    report.operations.r2Put++;await save()
    const payload=await response.json()
    if(!response.ok||!payload.success)throw Error('SYNTHETIC_R2_PUT_FAILED')
    return payload.result
  }
  for(let i=0;i<30;i++) {
    const name=previous[i]?.path.split('/').at(-1)||randomUUID()+'.png',key=`media/candidate/${gallery.id}/${name}`
    const object=await put(key,png,'image/png')
    if(typeof object.version!=='string'||!object.version||typeof object.etag!=='string'||Number(object.size)!==png.length)throw Error('R2_NATIVE_METADATA_UNAVAILABLE')
    const proof={schemaVersion:1,key,fixtureId:String(gallery.id),size:png.length,etag:object.etag.replaceAll('"',''),version:object.version,contentType:'image/png',signatureChecked:true}
    await put(`_candidate-validation/${gallery.id}/${name}.json`,JSON.stringify(proof),'application/json')
    report.media.push({path:'/'+key,receiptKey:`_candidate-validation/${gallery.id}/${name}.json`,size:png.length,etag:proof.etag,version:object.version});await save()
  }
  const cycle=report.fixtures.find(f=>f.role==='cycle')
  const response=await isolatedRequest(keys,`/rest/v1/locations?id=eq.${cycle.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({redirect_url:`/spot/${cycle.slug}`,redirect_type:301})})
  if(!response.ok)throw Error('CYCLE_FIXTURE_FAILED');await response.body?.cancel();report.operations.dbPatch++
  const config=JSON.parse(await readFile('artifacts/cloudflare-spot-loop/wrangler.jsonc'))
  config.vars.CANDIDATE_SPOTS=JSON.stringify(Object.fromEntries(report.fixtures.map(f=>[f.id,f.slug])))
  config.vars.CANDIDATE_NOTE_PATHS=JSON.stringify(['/notes/cloudflare-loop-compat-note'])
  await writeFile('artifacts/cloudflare-spot-loop/wrangler.jsonc',JSON.stringify(config,null,2))
  report.complete=true
}catch(error){report.error=/^[A-Z_]+$/.test(error.message)?error.message:'FIXTURE_SETUP_FAILED';process.exitCode=1}
await save();console.log(JSON.stringify({complete:report.complete,fixtures:report.fixtures,mediaCount:report.media.length,operations:report.operations,error:report.error},null,2))
