// Prepare only fresh synthetic rows/objects, after local regression + preflight.
import {readFile,writeFile} from 'node:fs/promises'
import {randomUUID,createHash} from 'node:crypto'
import {inflateSync} from 'node:zlib'
import {isolatedKeys,isolatedRequest,ISOLATED_REF} from './isolated-supabase.mjs'
import {privateWranglerToken,ACCOUNT,BUCKET} from './candidate-cloudflare.mjs'
const root='artifacts/cloudflare-gallery-cpu/'
const gate=JSON.parse(await readFile(root+'preflight.json'))
if(gate.verdict!=='READY_FOR_ISOLATED_FIXTURE_SETUP')throw Error('PREFLIGHT_REQUIRED')
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=','base64')
for(let p=8;p<png.length;){const n=png.readUInt32BE(p);let crc=0xffffffff;for(const v of png.subarray(p+4,p+8+n)){crc^=v;for(let bit=0;bit<8;bit++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1}if(((crc^0xffffffff)>>>0)!==png.readUInt32BE(p+8+n))throw Error('PNG_CRC_INVALID');if(png.subarray(p+4,p+8).toString()==='IDAT')inflateSync(png.subarray(p+8,p+8+n));p+=n+12}
const report={projectRef:ISOLATED_REF,bucket:BUCKET,fixtures:[],r2PutAttempts:0,imageSha256:createHash('sha256').update(png).digest('hex'),complete:false}
const file=root+'fixtures.json';await writeFile(file,JSON.stringify(report,null,2),{flag:'wx'})
const save=()=>writeFile(file,JSON.stringify(report,null,2))
try{
  const keys=await isolatedKeys(),token=await privateWranglerToken()
  for(const [role,count]of [['small',5],['gallery',30]]){
    const response=await isolatedRequest(keys,'/rest/v1/locations',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({name:`Synthetic CPU ${role}`,name_cn:'合成相册 CPU',latitude:1.3,longitude:103.8,status:'active',publication_status:'published',updated_at:null,images:[],tags:[]})})
    if(!response.ok)throw Error('FIXTURE_INSERT_FAILED')
    const [row]=await response.json();if(!Number.isSafeInteger(row.id)||row.id<=7||row.id>=91000)throw Error('FRESH_FIXTURE_REQUIRED')
    const f={id:row.id,role,slug:`cloudflare-loop-cpu-${role}-${row.id}`,updatedAt:row.updated_at,media:[]};report.fixtures.push(f);await save()
    async function put(key,bytes,type){
      if(!key.startsWith(`media/candidate/${row.id}/`)&&!key.startsWith(`_candidate-validation/${row.id}/`))throw Error('R2_PREFIX_REFUSED')
      report.r2PutAttempts++;await save()
      const result=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects/${key}`,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':type},body:bytes,redirect:'error',signal:AbortSignal.timeout(15000)})
      const data=await result.json();if(!result.ok||!data.success)throw Error('R2_FIXTURE_PUT_FAILED');return data.result
    }
    for(let index=0;index<count;index++){
      const name=randomUUID()+'.png',key=`media/candidate/${row.id}/${name}`
      const object=await put(key,png,'image/png')
      if(!object.etag||!object.version||Number(object.size)!==png.length)throw Error('R2_METADATA_REQUIRED')
      const proof={schemaVersion:1,key,fixtureId:String(row.id),size:png.length,etag:object.etag,version:object.version,contentType:'image/png',signatureChecked:true}
      await put(`_candidate-validation/${row.id}/${name}.json`,JSON.stringify(proof),'application/json')
      f.media.push({path:'/'+key,size:png.length,etag:object.etag,version:object.version});await save()
    }
  }
  const config=JSON.parse(await readFile('artifacts/cloudflare-spot-loop/wrangler.jsonc'))
  config.vars.CANDIDATE_SPOTS=JSON.stringify(Object.fromEntries(report.fixtures.map(f=>[f.id,f.slug])))
  await writeFile('artifacts/cloudflare-spot-loop/wrangler.jsonc',JSON.stringify(config,null,2));report.complete=true
}catch(error){report.error=/^[A-Z_]+$/.test(error.message)?error.message:'ISOLATED_SETUP_FAILED';process.exitCode=1}
await save();console.log(JSON.stringify({complete:report.complete,fixtures:report.fixtures.map(f=>({id:f.id,role:f.role,mediaCount:f.media.length})),r2PutAttempts:report.r2PutAttempts,error:report.error},null,2))
