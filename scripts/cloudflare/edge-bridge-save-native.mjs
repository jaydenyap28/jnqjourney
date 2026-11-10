// Single 24-request journal. Never reset it after a failed native request.
import assert from 'node:assert/strict'
import {readFile,writeFile,rename,unlink} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {isDeepStrictEqual} from 'node:util'
import path from 'node:path'
import {ISOLATED_REF,ISOLATED_ORIGIN,isolatedKeys,isolatedRequest} from './isolated-supabase.mjs'
import {privateWranglerToken} from './candidate-cloudflare.mjs'
import {createMediaPreparer} from './edge-bridge-media.mjs'
import {signBridge,BRIDGE_PATH} from '../../cloudflare/spot-loop/identity-bridge/auth.mjs'
const root='artifacts/cloudflare-edge-bridge-save/',file=root+'native-acceptance.json'
const resume=process.argv.includes('--resume-preseed')
const d=JSON.parse(await readFile(root+'deployment.json'))
assert.ok(d.success&&d.saveTrial&&d.edge.verifyJwt)
const browser='https://codex-cloudflare-free-migrat.jnqjourney-spot-loop-migration-candidate.pages.dev'
const bridgeUrl='https://codex-r2-identity-bridge.jnqjourney-spot-loop-migration-candidate.pages.dev'+BRIDGE_PATH
const privateFile=path.resolve('cloudflare/spot-loop/.dev.vars.identity-bridge-save')
const secret=(await readFile(privateFile,'utf8')).trim().split('=')[1]
assert.match(secret,/^[A-Za-z0-9_-]{43}$/)
const report=resume?JSON.parse(await readFile(file)):{startedAt:new Date().toISOString(),deploymentId:d.deploymentId,edgeVersion:d.edge.version,expiresAt:d.expiresAt,
  cloudflareBudget:24,cloudflareRequests:0,edgeRequests:0,checks:[],albums:[],assertions:[],verdict:'EDGE_BRIDGE_SAVE_NO_GO',hold:true}
if(resume){
  const tail=JSON.parse(await readFile(root+'runtime-events.json'))
  const expected=['save_5_first','save_5_unchanged','save_17_first','save_17_unchanged']
  assert.ok(report.deploymentId===d.deploymentId&&report.edgeVersion===d.edge.version&&report.expiresAt===d.expiresAt)
  assert.ok(!report.finishedAt&&!report.error&&!report.resume&&report.cloudflareRequests===4&&report.edgeRequests===4)
  assert.deepEqual(report.checks.map(check=>check.name),expected)
  assert.ok(report.albums.length===2&&report.albums.every(album=>album.first&&album.repeated))
  assert.ok(tail.deploymentId===d.deploymentId&&tail.count===4&&tail.events.length===4&&tail.diagnostics.resumedAt&&!tail.diagnostics.closed&&!tail.diagnostics.parseErrors&&!tail.diagnostics.truncatedEvents)
  assert.ok(report.checks.every((check,i)=>check.httpStatus===200&&Number.isFinite(check.nativeCpuMs)&&check.nativeCpuMs<8&&tail.events[i].acceptanceId===check.acceptanceId&&tail.events[i].cpuTime===check.nativeCpuMs))
}else await writeFile(file,JSON.stringify(report,null,2),{flag:'wx'})
const persist=async()=>{await writeFile(file+'.tmp',JSON.stringify(report,null,2));await rename(file+'.tmp',file)}
const ensure=(condition,code)=>{if(!condition)throw Error(code)}
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value
const sha=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
let keys,token,preparer,originalHash
const state=new Map(),albums=new Map()
async function readRow(id){
  const response=await isolatedRequest(keys,'/rest/v1/locations?id=eq.'+id+'&select=*')
  ensure(response.ok,'ISOLATED_ROW_READ_FAILED')
  const rows=await response.json();ensure(rows.length===1&&rows[0].id===id,'ISOLATED_FIXTURE_MISSING')
  return rows[0]
}
async function unrelatedSnapshot(){
  const response=await isolatedRequest(keys,'/rest/v1/locations?id=not.in.(92005,92017,92030)&select=*&order=id.asc')
  ensure(response.ok,'UNRELATED_FIXTURE_READ_FAILED')
  return sha(await response.json())
}
async function native(entry,expected){
  let trace
  const end=Date.now()+25000
  while(Date.now()<end){
    let tail;try{tail=JSON.parse(await readFile(root+'runtime-events.json'))}catch{}
    ensure(!tail?.diagnostics?.parseErrors&&!tail?.diagnostics?.truncatedEvents,'TAIL_INTEGRITY_FAILED')
    if(tail?.deploymentId===d.deploymentId)trace=tail.events.find(e=>e.acceptanceId===entry.acceptanceId)
    if(trace||tail?.diagnostics?.closed)break
    await new Promise(resolve=>setTimeout(resolve,50))
  }
  if(trace)Object.assign(entry,{nativeCpuMs:trace.cpuTime,nativeWallMs:trace.wallTime,nativeStatus:trace.status,outcome:trace.outcome})
  await persist()
  ensure(Number.isFinite(trace?.cpuTime),'NATIVE_CPU_NOT_OBSERVED')
  ensure(trace.path===BRIDGE_PATH&&trace.method==='POST'&&trace.status===expected,'NATIVE_TRACE_MISMATCH')
  ensure(trace.cpuTime<=10&&trace.outcome==='ok','NATIVE_CPU_LIMIT_EXCEEDED')
  if(trace.cpuTime>=8)entry.cpuMargin=trace.cpuTime===10?'CRITICAL_10MS':'LOW_8_9MS'
  await persist()
}
async function edge(name,body,{expected=200,bridge=true,bridgeStatus=200,auth=true,origin=browser}={}){
  ensure(!bridge||report.cloudflareRequests<24,'REQUEST_BUDGET_EXHAUSTED')
  const acceptanceId=`${Date.now()}-${report.checks.length}`
  const entry={name,acceptanceId,expected,expectedBridge:bridge,action:body.action,id:body.id,edgeVersion:d.edge.version,deploymentId:d.deploymentId,requestBytes:Buffer.byteLength(JSON.stringify(body)),issuedAt:new Date().toISOString()}
  report.edgeRequests++;if(bridge)report.cloudflareRequests++
  report.checks.push(entry);await persist()
  const started=performance.now()
  const response=await fetch(ISOLATED_ORIGIN+'/functions/v1/'+d.edge.name,{method:'POST',headers:{apikey:keys.anon,Authorization:'Bearer '+(auth?token:keys.anon),Origin:origin,'X-JnQ-Acceptance':acceptanceId,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(45000)})
  entry.httpStatus=response.status;entry.clientElapsedMs=Math.round(performance.now()-started)
  const result=await response.json()
  if(result.counts)entry.counts=result.counts
  if(result.bridgeOperations)entry.r2Operations=result.bridgeOperations
  if(typeof result.serverElapsedMs==='number')entry.edgeElapsedMs=result.serverElapsedMs
  if(result.sqlstate)entry.sqlstate=result.sqlstate
  if(/^[A-Z_0-9]+$/.test(result.error||''))entry.error=result.error
  await persist()
  if(bridge)await native(entry,bridgeStatus)
  ensure(response.status===expected,'EDGE_HTTP_STATUS_FAILED')
  ensure(result.counts?.bridge===(bridge?1:0),'BRIDGE_COUNT_MISMATCH')
  if(bridge&&bridgeStatus===200)ensure(result.bridgeOperations?.list===2&&result.bridgeOperations?.head<=8&&result.bridgeOperations?.get===0,'R2_OPERATION_SHAPE_CHANGED')
  return result
}
const save=(name,id,data,opts={})=>edge(name,{action:'save',id,expectedUpdatedAt:state.get(id).updated_at,data},opts)
async function assertSame(id,before,label){
  const after=await readRow(id)
  ensure(isDeepStrictEqual(before,after),'FAILED_TRANSACTION_CHANGED_STATE')
  report.assertions.push(label);await persist()
}
try{
  ensure(Date.now()<d.expiresAt*1000,'CREDENTIAL_EXPIRED')
  keys=await isolatedKeys()
  const credentials=JSON.parse(await readFile('cloudflare/spot-loop/.dev.vars.spot-loop-session'))
  ensure(credentials.projectRef===ISOLATED_REF,'ISOLATED_AUTH_REQUIRED')
  const login=await fetch(ISOLATED_ORIGIN+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:keys.anon,'Content-Type':'application/json'},body:JSON.stringify({email:credentials.email,password:credentials.password}),redirect:'manual'})
  const session=await login.json();token=session.access_token
  ensure(login.ok&&session.user?.id===credentials.userId&&typeof token==='string','AUTH_FAILED')
  originalHash=await unrelatedSnapshot()
  if(resume)ensure(originalHash===report.unrelatedRowsBeforeSha256,'UNRELATED_ISOLATED_DATA_CHANGED')
  report.unrelatedRowsBeforeSha256=originalHash
  for(const id of [92005,92017,92030])state.set(id,await readRow(id))
  if(!resume)report.fixtureStart=[...state.values()].map(row=>({id:row.id,updatedAt:row.updated_at,imageCount:row.images?.length??0}))
  await persist()
  preparer=await createMediaPreparer({root,keys,token:await privateWranglerToken(),resume})
  let completedThirty=[]
  if(resume){
    const records=preparer.report.media
    for(const album of report.albums){
      const paths=records.filter(media=>media.id===album.id&&media.registered&&media.bytesVerified).map(media=>'/'+media.key)
      const row=state.get(album.id)
      ensure(paths.length===album.count&&row.updated_at===album.savedVersion&&isDeepStrictEqual(row.images,paths),'COMPLETED_ALBUM_STATE_CHANGED')
      albums.set(album.id,paths)
    }
    const thirty=records.filter(media=>media.id===92030)
    completedThirty=thirty.filter(media=>media.registered&&media.bytesVerified).map(media=>'/'+media.key)
    const previous=report.fixtureStart.find(fixture=>fixture.id===92030),row=state.get(92030)
    ensure(previous&&row.updated_at===previous.updatedAt&&(row.images?.length??0)===previous.imageCount&&completedThirty.length===18&&thirty.length===19,'UNSAFE_PRESEED_CHECKPOINT')
    report.resume={at:new Date().toISOString(),priorCloudflareRequests:4,confirmedThirty:18,unconfirmedPairRetained:true,previousAuthSessionClosed:'UNKNOWN'}
    await persist()
  }
  for(const count of resume?[30]:[5,17,30]){
    const id=92000+count,paths=[...completedThirty,...await preparer.prepare(id,count-completedThirty.length)]
    albums.set(id,paths)
    const data={name:`Synthetic Edge Bridge ${count}`,image_url:paths[0],images:paths,
      image_metadata:Object.fromEntries(paths.map(path=>[path,{alt_zh:'隔离合成图',alt_en:'Synthetic isolated image',caption:'Edge bridge native acceptance'}])),review_qing:null,is_visited:false,opening_hours:'09:00–18:00'}
    const album={id,count,first:false,repeated:false};report.albums.push(album);await persist()
    const first=await save(`save_${count}_first`,id,data)
    ensure(first.spot?.images?.length===count&&isDeepStrictEqual(first.spot.image_metadata,data.image_metadata),'FIRST_SAVE_STATE_MISMATCH')
    state.set(id,first.spot);album.first=true;await persist()
    const repeated=await save(`save_${count}_unchanged`,id,data)
    state.set(id,repeated.spot)
    const actual=await readRow(id)
    ensure(isDeepStrictEqual(actual.images,paths)&&isDeepStrictEqual(actual.image_metadata,data.image_metadata)&&actual.is_visited===false&&actual.review_qing===null&&actual.opening_hours===data.opening_hours,'SAVED_PUBLIC_SOURCE_MISMATCH')
    album.repeated=true;album.savedVersion=actual.updated_at;await persist()
  }
  const id=92005,paths=albums.get(id)
  const before=await readRow(id)
  await edge('forged_identity_payload_rejected',{action:'save',id,expectedUpdatedAt:before.updated_at,data:{name:'Rejected'},p_observed:[],verified:true},{expected:400,bridge:false})
  await edge('anon_write_rejected',{action:'save',id,expectedUpdatedAt:before.updated_at,data:{name:'Rejected'}},{expected:401,bridge:false,auth:false})
  await edge('cross_origin_write_rejected',{action:'save',id,expectedUpdatedAt:before.updated_at,data:{name:'Rejected'}},{expected:403,bridge:false,origin:'https://untrusted.invalid'})
  await assertSame(id,before,'forged identity, anon and cross-origin writes leave the row unchanged')
  ensure(report.cloudflareRequests<24,'REQUEST_BUDGET_EXHAUSTED')
  const acceptanceId=`${Date.now()}-${report.checks.length}`,raw=JSON.stringify({spotId:id,keys:[paths[0].slice(1)]})
  const expired={name:'expired_hmac_rejected',acceptanceId,expected:401,issuedAt:new Date().toISOString()}
  report.cloudflareRequests++;report.checks.push(expired);await persist()
  const expiredResponse=await fetch(bridgeUrl,{method:'POST',headers:await signBridge(secret,bridgeUrl,raw,acceptanceId,{timestamp:String(Math.floor(Date.now()/1000)-90)}),body:raw,redirect:'manual'})
  expired.httpStatus=expiredResponse.status
  const expiredData=await expiredResponse.json()
  ensure(!expiredData.identities,'EXPIRED_SIGNATURE_LEAKED_IDENTITIES')
  await native(expired,401);ensure(expiredResponse.status===401,'EXPIRED_SIGNATURE_ACCEPTED')
  expired.r2Operations={list:0,head:0,get:0};await persist()
  const region=await isolatedRequest(keys,'/rest/v1/regions?id=eq.9007199254740990&select=id')
  ensure(region.ok&&(await region.json()).length===0,'FAILURE_TEST_REGION_EXISTS')
  const rollback=await save('foreign_key_failure_rolls_back',id,{name:'Must roll back',region_id:9007199254740990},{expected:409})
  ensure(rollback.sqlstate==='23503','EXPECTED_TRANSACTION_FAILURE_NOT_OBSERVED')
  await assertSame(id,before,'real 23503 save transaction preserved all fields and version')
  await edge('stale_duplicate_submission_rejected',{action:'save',id,expectedUpdatedAt:null,data:{name:'Must not overwrite'}},{expected:409})
  await assertSame(id,before,'duplicate old-version submission preserved all fields')
  const [unregistered]=await preparer.prepare(id,1,{register:false})
  await save('unregistered_real_object_rejected',id,{image_url:unregistered,images:[unregistered]},{expected:409})
  await assertSame(id,before,'real R2 object and receipt without Registry cannot publish')
  await preparer.replaceWithSameBytes(paths[0])
  await save('same_bytes_new_version_rejected',id,{image_url:paths[0],images:paths},{expected:409})
  await assertSame(id,before,'same etag and bytes with changed native version cannot be saved')
  await edge('changed_public_media_denied',{action:'media',id,key:paths[0].slice(1)},{expected:404,auth:false})
  await edge('revoke_reference_hides_spot',{action:'revoke',id,key:paths[1].slice(1)},{bridge:false})
  const revoked=await readRow(id)
  ensure(revoked.publication_status==='hidden'&&revoked.updated_at!==before.updated_at,'REVOKE_DID_NOT_HIDE')
  state.set(id,revoked)
  await save('revoked_reference_republish_rejected',id,{publication_status:'published',image_url:paths[1],images:paths.slice(1)},{expected:409})
  await assertSame(id,revoked,'revoked media reference cannot republish')
  await edge('revoked_public_media_denied',{action:'media',id,key:paths[1].slice(1)},{expected:404,bridge:false,auth:false})
  const hidden=await edge('withdraw_album',{action:'withdraw',id:92017,expectedUpdatedAt:state.get(92017).updated_at},{bridge:false})
  state.set(92017,hidden.spot)
  await edge('withdrawn_public_media_denied',{action:'media',id:92017,key:albums.get(92017)[0].slice(1)},{expected:404,bridge:false,auth:false})
  const republished=await save('republish_album',92017,{publication_status:'published'})
  state.set(92017,republished.spot)
  await edge('published_media_authorization_passes',{action:'media',id:92017,key:albums.get(92017)[0].slice(1)},{auth:false})
  ensure(await unrelatedSnapshot()===originalHash,'UNRELATED_ISOLATED_DATA_CHANGED')
  report.securityPassed=true
  report.verdict=report.checks.some(c=>c.nativeCpuMs>=8)?'EDGE_BRIDGE_SAVE_NO_GO':'EDGE_BRIDGE_SAVE_GO'
  if(report.verdict!=='EDGE_BRIDGE_SAVE_GO')report.error='INSUFFICIENT_CPU_MARGIN'
}catch(error){report.error=/^[A-Z_0-9]+$/.test(error.message)?error.message:'EDGE_BRIDGE_ACCEPTANCE_FAILED';report.verdict='EDGE_BRIDGE_SAVE_NO_GO';process.exitCode=1}
finally{
  if(keys){
    try{
      report.fixtureFinal=[]
      for(const id of [92005,92017,92030]){const row=await readRow(id);report.fixtureFinal.push({id,version:row.updated_at,imageCount:row.images?.length??0,publication:row.publication_status})}
      if(originalHash)report.unrelatedRowsUnchanged=await unrelatedSnapshot()===originalHash
    }catch{report.finalStateUnknown=true}
  }
  if(token&&keys)try{const logout=await fetch(ISOLATED_ORIGIN+'/auth/v1/logout',{method:'POST',headers:{apikey:keys.anon,Authorization:'Bearer '+token},redirect:'manual'});await logout.body?.cancel();report.authSessionClosed=logout.ok}catch{report.authSessionClosed=false}
  try{await unlink(privateFile);report.localSharedKeyDeleted=true}catch{report.localSharedKeyDeleted=false}
  report.finishedAt=new Date().toISOString();await persist()
  console.log(JSON.stringify({verdict:report.verdict,error:report.error,cloudflareRequests:report.cloudflareRequests,edgeRequests:report.edgeRequests,albums:report.albums,checks:report.checks.map(({name,httpStatus,nativeCpuMs,clientElapsedMs,r2Operations,sqlstate})=>({name,httpStatus,nativeCpuMs,clientElapsedMs,r2Operations,sqlstate})),fixtureFinal:report.fixtureFinal,unrelatedRowsUnchanged:report.unrelatedRowsUnchanged},null,2))
}
