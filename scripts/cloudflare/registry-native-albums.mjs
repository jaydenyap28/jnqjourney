// Continues the same immutable request budget after the complete gate.
import assert from 'node:assert/strict'
import {readFile,writeFile,rename} from 'node:fs/promises'
import {createHash,randomUUID} from 'node:crypto'
import {inflateSync} from 'node:zlib'
import {ISOLATED_REF,ISOLATED_ORIGIN,isolatedKeys,isolatedRequest} from './isolated-supabase.mjs'
import {ACCOUNT,BUCKET,privateWranglerToken} from './candidate-cloudflare.mjs'
const root='artifacts/cloudflare-registry-native/',file=root+'native-acceptance.json'
const report=JSON.parse(await readFile(file))
const fixtures=JSON.parse(await readFile(root+'fixtures.json'))
const etagResume=process.argv.includes('--resume-after-http-etag-review')
const resume=process.argv.includes('--resume-after-json-order-review')||etagResume
if(resume){
  assert.ok(report.completeGatePassed&&report.error===(etagResume?'IMPORT_RECEIPT_VERIFICATION_FAILED':'PUBLIC_ALBUM_MISMATCH')&&report.checks.length===7&&report.checks.at(-1).name==='public_1_read')
  assert.ok(report.checks.every(check=>Number.isFinite(check.cpuTimeMs)&&check.cpuTimeMs<=10&&check.status===check.expected))
  const proof=JSON.parse(await readFile(root+'json-order-review.json'))
  assert.ok(proof.imageReferencesMatch&&proof.metadataValuesMatch&&proof.savedVersionPresent&&proof.noNativeRequestRepeated)
  await writeFile(root+(etagResume?'native-before-etag-correction.json':'native-before-json-order-correction.json'),JSON.stringify(report,null,2),{flag:'wx'})
  if(etagResume)report.importerCorrection={originalError:report.error,reason:'R2 HTTP JSON response uses a weak representation ETag. Native identities still come exclusively from fresh successful PUT results, with exact byte readback',orphanPreserved:true,originalRequestsPreserved:7}
  else report.toolCorrection={originalError:report.error,reason:'JSONB object property order differs, equal field values independently confirmed by read-only SQL',originalRequestsPreserved:7,newPhase:'Unexecuted 5/17/30 cases only'}
  delete report.error
}else assert.ok(report.completeGatePassed&&!report.error&&!report.albumStageStarted&&report.checks.length===3)
assert.equal(fixtures.projectRef,ISOLATED_REF)
report.albumStageStarted=true
const persist=async()=>{await writeFile(file+'.tmp',JSON.stringify(report,null,2));await rename(file+'.tmp',file)}
await persist()
const ensure=(value,code)=>{if(!value)throw Error(code)}
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=','base64')
for(let p=8;p<png.length;){const n=png.readUInt32BE(p);let crc=0xffffffff;for(const v of png.subarray(p+4,p+8+n)){crc^=v;for(let bit=0;bit<8;bit++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1}ensure(((crc^0xffffffff)>>>0)===png.readUInt32BE(p+8+n),'PNG_CRC_INVALID');if(png.subarray(p+4,p+8).toString()==='IDAT')inflateSync(png.subarray(p+8,p+8+n));p+=n+12}
const sha=value=>createHash('sha256').update(value).digest('hex')
let token,keys,cfToken
const counts={put:0,get:0,register:0,lookup:0}
const setupFile=root+'media-setup.json'
const setup=resume?JSON.parse(await readFile(setupFile)):{projectRef:ISOLATED_REF,bucket:BUCKET,sourceSha256:sha(png),media:[],counts}
if(resume){
  assert.ok(etagResume?setup.media.length===1&&!setup.media[0].registered&&setup.counts.put===2&&setup.counts.get===2&&setup.counts.register===0:setup.media.length===0&&Object.values(setup.counts).every(value=>value===0))
  Object.assign(counts,setup.counts)
  if(etagResume)await writeFile(root+'media-setup-before-etag-correction.json',JSON.stringify(setup,null,2),{flag:'wx'})
}
else await writeFile(setupFile,JSON.stringify(setup,null,2),{flag:'wx'})
setup.counts=counts
async function saveSetup(){await writeFile(setupFile,JSON.stringify(setup,null,2))}
async function r2(key,{bytes,type}={}){
  ensure(/^(?:media\/candidate|_candidate-validation)\/920(?:05|17|30)\/[a-f0-9-]+\.png(?:\.json)?$/.test(key),'IMPORT_PREFIX_REFUSED')
  counts[bytes?'put':'get']++
  const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects/${key}`,{
    method:bytes?'PUT':'GET',headers:{Authorization:`Bearer ${cfToken}`,...(bytes?{'Content-Type':type}:{})},...(bytes?{body:bytes}:{}),redirect:'manual',signal:AbortSignal.timeout(15000)})
  ensure(response.ok,'R2_IMPORT_FAILED')
  if(bytes){const data=await response.json();ensure(data.success,'R2_IMPORT_FAILED');return data.result}
  // HTTP validators may be weak for JSON representations. PUT metadata remains
  // the sole source of Registry etag/version, with independent exact byte checks.
  return {bytes:Buffer.from(await response.arrayBuffer()),type:response.headers.get('content-type'),etag:response.headers.get('etag')?.replace(/^W\//,'').replaceAll('"','')}
}
async function prepareMedia(id,count){
  ensure([92005,92017,92030].includes(id),'IMPORT_FIXTURE_REFUSED')
  const paths=[]
  for(let i=0;i<count;i++){
    const key=`media/candidate/${id}/${randomUUID()}.png`,receipt=`_candidate-validation/${id}/${key.split('/').at(-1)}.json`
    const item={spot:id,key,receipt,registered:false};setup.media.push(item);await saveSetup()
    const object=await r2(key,{bytes:png,type:'image/png'})
    const actual=await r2(key)
    ensure(object.key===key&&Number(object.size)===png.length&&typeof object.version==='string'&&object.version&&object.etag&&actual.etag===object.etag&&actual.type==='image/png'&&sha(actual.bytes)===sha(png),'IMPORT_OBJECT_VERIFICATION_FAILED')
    const proof={schemaVersion:1,key,fixtureId:String(id),size:png.length,etag:object.etag,version:object.version,contentType:'image/png',signatureChecked:true}
    const receiptBytes=Buffer.from(JSON.stringify(proof))
    const identity=await r2(receipt,{bytes:receiptBytes,type:'application/json'})
    const receiptRead=await r2(receipt)
    ensure(identity.key===receipt&&Number(identity.size)===receiptBytes.length&&identity.etag===receiptRead.etag&&typeof identity.version==='string'&&identity.version&&receiptRead.type==='application/json'&&receiptBytes.equals(receiptRead.bytes),'IMPORT_RECEIPT_VERIFICATION_FAILED')
    const args={p_spot:id,p_key:key,p_size:png.length,p_mime:'image/png',p_etag:object.etag,p_version:object.version,p_receipt_size:receiptBytes.length,p_receipt_etag:identity.etag,p_receipt_version:identity.version,p_can_insert:true}
    counts.register++
    const registered=await isolatedRequest(keys,'/rest/v1/rpc/jnq_media_register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)})
    ensure(registered.ok&&await registered.json()===true,'IMPORT_REGISTRATION_FAILED')
    counts.lookup++
    const lookup=await isolatedRequest(keys,'/rest/v1/rpc/jnq_media_lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_spot:id,p_key:key})})
    ensure(lookup.ok,'IMPORT_LOOKUP_FAILED')
    const registeredIdentity=await lookup.json()
    ensure(registeredIdentity?.publiclyReferenced===false&&registeredIdentity.key===key&&registeredIdentity.size===png.length&&registeredIdentity.mime==='image/png'&&registeredIdentity.etag===object.etag&&registeredIdentity.version===object.version&&registeredIdentity.receiptSize===receiptBytes.length&&registeredIdentity.receiptEtag===identity.etag&&registeredIdentity.receiptVersion===identity.version,'IMPORT_IDENTITY_MISMATCH')
    Object.assign(item,{registered:true,size:png.length,etag:object.etag,version:object.version,receiptSize:receiptBytes.length,receiptEtag:identity.etag,receiptVersion:identity.version,bytesReadBackMatched:true})
    paths.push('/'+key);await saveSetup()
  }
  return paths
}
async function call(name,path,{body,expected=200,method=body===undefined?'GET':'PATCH',auth=true,albumCount,first}={}){
  ensure(report.checks.length<40,'REQUEST_BUDGET_EXHAUSTED')
  const acceptanceId=`${Date.now()}-${report.checks.length}`
  const entry={name,path,method,acceptanceId,deploymentId:report.deploymentId,expected,issuedAt:new Date().toISOString(),...(albumCount?{albumCount,first}:{}),requestBytes:body?Buffer.byteLength(JSON.stringify(body)):0}
  report.checks.push(entry);await persist()
  const response=await fetch(report.origin+path,{method,headers:{'X-JnQ-Acceptance':acceptanceId,Origin:report.origin,'Content-Type':'application/json',...(auth?{Cookie:`__Host-jnq-candidate=${token}`}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual',signal:AbortSignal.timeout(30000)})
  entry.status=response.status
  const bytes=Buffer.from(await response.arrayBuffer());entry.responseBytes=bytes.length
  let trace
  const end=Date.now()+25000
  while(Date.now()<end){
    let tail;try{tail=JSON.parse(await readFile(root+'runtime-events.json'))}catch{}
    ensure(!tail?.diagnostics?.parseErrors&&!tail?.diagnostics?.truncatedEvents,'TAIL_INTEGRITY_FAILED')
    if(tail?.deploymentId===report.deploymentId)trace=tail.events.find(e=>e.acceptanceId===acceptanceId)
    if(trace||tail?.diagnostics?.closed)break
    await new Promise(resolve=>setTimeout(resolve,50))
  }
  if(trace)Object.assign(entry,{cpuTimeMs:trace.cpuTime,runtimeWallTimeMs:trace.wallTime,outcome:trace.outcome,operations:trace.operations})
  await persist()
  ensure(Number.isFinite(trace?.cpuTime),'NATIVE_CPU_NOT_OBSERVED')
  const redacted=path.replace(/^(\/media\/candidate\/\d+\/)[a-f0-9-]+(\.[a-z]+)$/,'$1REDACTED$2')
  ensure((trace.path===path||trace.path===redacted)&&trace.method===method&&trace.status===response.status,'NATIVE_TRACE_MISMATCH')
  ensure(trace.cpuTime<=10&&trace.outcome==='ok','NATIVE_CPU_LIMIT_EXCEEDED')
  ensure(trace.operations,'NATIVE_OPERATION_COUNTS_MISSING')
  if(trace.cpuTime===10)entry.critical=true
  ensure(response.status===expected,'UNEXPECTED_HTTP_STATUS')
  await persist()
  return {json:()=>JSON.parse(bytes.toString()),bytes}
}
const state=new Map(),pathsById=new Map()
async function save(id,patch,name,albumCount,first){
  const data={expectedUpdatedAt:state.get(id)?.updated_at??null,data:patch}
  const result=await call(name,`/api/candidate/spots/${id}`,{body:data,albumCount,first})
  const row=result.json().spot
  ensure(row.id===id&&typeof row.updated_at==='string','SAVED_STATE_INVALID')
  state.set(id,row)
  return row
}
try{
  keys=await isolatedKeys();cfToken=await privateWranglerToken()
  const c=JSON.parse(await readFile('cloudflare/spot-loop/.dev.vars.spot-loop-session'))
  ensure(c.projectRef===ISOLATED_REF,'AUTH_FIXTURE_MISMATCH')
  const login=await fetch(ISOLATED_ORIGIN+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:keys.anon,'Content-Type':'application/json'},body:JSON.stringify({email:c.email,password:c.password}),redirect:'manual'})
  const session=await login.json();token=session.access_token
  ensure(login.ok&&session.user?.id===c.userId&&typeof token==='string','AUTH_FAILED')
  if(!resume)await call('verified_unreferenced_media_denied',report.firstMedia.path,{auth:false,expected:401})
  for(const n of resume?[5,17,30]:[1,5,17,30]){
    const id=92000+n,paths=n===1?[report.firstMedia.path]:await prepareMedia(id,n)
    pathsById.set(id,paths)
    const patch={image_url:paths[0],images:paths,image_metadata:Object.fromEntries(paths.map(path=>[path,{alt_zh:'合成隔离照片',alt_en:'Synthetic isolated photo',caption:'Registry native acceptance'}]))}
    const row=await save(id,patch,`save_${n}_first`,n,true)
    ensure(JSON.stringify(row.images)===JSON.stringify(paths),'ALBUM_DATA_MISMATCH')
    await save(id,patch,`save_${n}_unchanged`,n,false)
    const actual=(await call(`public_${n}_read`,`/api/candidate/public/spots/${id}`,{auth:false})).json().spot
    ensure(JSON.stringify(actual.images)===JSON.stringify(paths),'PUBLIC_ALBUM_MISMATCH')
    assert.deepEqual(actual.image_metadata,patch.image_metadata,'PUBLIC_ALBUM_METADATA_MISMATCH')
  }
  const id=92030,paths=pathsById.get(id)
  await call('revoke_registered_media',`/api/candidate/spots/${id}/image/revoke`,{body:{key:paths[0].slice(1)},method:'POST'})
  await call('revoked_media_denied',paths[0],{auth:false,expected:404})
  const reread=(await call('load_revoked_version',`/api/candidate/spots/${id}`)).json().spot
  state.set(id,reread)
  await save(id,{image_url:paths[1],images:paths.slice(1),publication_status:'published'},'republish_without_revoked')
  const pixels=await call('published_media_bytes',paths[1],{auth:false})
  ensure(sha(pixels.bytes)===sha(png),'PUBLIC_IMAGE_HASH_MISMATCH')
  await save(id,{publication_status:'hidden'},'withdraw')
  await call('withdrawn_image_denied',paths[1],{auth:false,expected:401})
  report.albumsPassed=true
  report.verdict='ALBUMS_PASSED_LEGACY_CHECKS_PENDING'
}catch(error){
  report.error=/^[A-Z_]+$/.test(error.message)?error.message:'REGISTRY_NATIVE_FAILED'
  report.verdict='FREE_REGISTRY_CPU_NO_GO';process.exitCode=1
}finally{
  if(token&&keys)try{const logout=await fetch(ISOLATED_ORIGIN+'/auth/v1/logout',{method:'POST',headers:{apikey:keys.anon,Authorization:`Bearer ${token}`},redirect:'manual'});await logout.body?.cancel();report.authSessionClosed=logout.ok}catch{report.authSessionClosed=false}
  await saveSetup();report.finishedAt=new Date().toISOString();await persist()
  console.log(JSON.stringify({verdict:report.verdict,error:report.error,workerRequests:report.checks.length,
    checks:report.checks.map(({name,status,cpuTimeMs,operations})=>({name,status,cpuTimeMs,operations})),setup:counts},null,2))
}
