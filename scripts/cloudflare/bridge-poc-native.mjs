import assert from 'node:assert/strict'
import {readFile,writeFile,rename,unlink} from 'node:fs/promises'
import path from 'node:path'
import {signBridge,BRIDGE_PATH} from '../../cloudflare/spot-loop/identity-bridge/auth.mjs'
import {isolatedKeys,ISOLATED_ORIGIN,ISOLATED_REF} from './isolated-supabase.mjs'
const root='artifacts/cloudflare-bridge-poc/',file=root+'native-acceptance.json'
const d=JSON.parse(await readFile(root+'deployment.json'))
assert.ok(d.success&&d.environment==='preview'&&d.edge.verifyJwt)
const privateFile=path.resolve('cloudflare/spot-loop/.dev.vars.identity-bridge')
const secret=(await readFile(privateFile,'utf8')).trim().split('=')[1]
assert.match(secret,/^[A-Za-z0-9_-]{43}$/)
const media=JSON.parse(await readFile('cloudflare/spot-loop/evidence/registry-native-2026-11-09/media-setup.json'))
const registered=media.media.find(m=>m.registered&&m.spot===92005)
const key=registered.key,body=JSON.stringify({key})
const url='https://codex-r2-identity-bridge.jnqjourney-spot-loop-migration-candidate.pages.dev'+BRIDGE_PATH
const report={deploymentId:d.deploymentId,edgeVersion:d.edge.version,expiresAt:d.expiresAt,startedAt:new Date().toISOString(),
  cloudflareRequestBudget:5,cloudflareRequests:0,edgeRequests:0,totalHttpTestRequests:0,checks:[],verdict:'BRIDGE_POC_NO_GO',hold:true}
await writeFile(file,JSON.stringify(report,null,2),{flag:'wx'})
const persist=async()=>{await writeFile(file+'.tmp',JSON.stringify(report,null,2));await rename(file+'.tmp',file)}
const ensure=(value,message)=>{if(!value)throw Error(message)}
async function trace(entry,expected){
  let event
  const end=Date.now()+25000
  while(Date.now()<end){
    let tail;try{tail=JSON.parse(await readFile(root+'runtime-events.json'))}catch{}
    ensure(!tail?.diagnostics?.parseErrors&&!tail?.diagnostics?.truncatedEvents,'TAIL_INTEGRITY_FAILED')
    if(tail?.deploymentId===d.deploymentId)event=tail.events.find(e=>e.acceptanceId===entry.acceptanceId)
    if(event||tail?.diagnostics?.closed)break
    await new Promise(resolve=>setTimeout(resolve,50))
  }
  if(event)Object.assign(entry,{cpuTimeMs:event.cpuTime,runtimeWallTimeMs:event.wallTime,nativeStatus:event.status,outcome:event.outcome})
  await persist()
  ensure(Number.isFinite(event?.cpuTime),'NATIVE_CPU_NOT_OBSERVED')
  ensure(event.path===BRIDGE_PATH&&event.method==='POST'&&event.status===expected,'NATIVE_TRACE_MISMATCH')
  ensure(event.cpuTime<10&&event.outcome==='ok','CPU_THRESHOLD_REACHED')
}
async function direct(name,expected,headers){
  ensure(report.cloudflareRequests<5&&report.totalHttpTestRequests<5,'REQUEST_BUDGET_EXHAUSTED')
  const acceptanceId=`${Date.now()}-${report.checks.length}`
  const entry={name,acceptanceId,expected,method:'POST',path:BRIDGE_PATH}
  report.cloudflareRequests++;report.totalHttpTestRequests++;report.checks.push(entry);await persist()
  const h=await headers(acceptanceId)
  const response=await fetch(url,{method:'POST',headers:{...h,'X-JnQ-Acceptance':acceptanceId},body,redirect:'manual',signal:AbortSignal.timeout(15000)})
  entry.httpStatus=response.status
  entry.corsHeaderPresent=response.headers.has('Access-Control-Allow-Origin')
  const data=await response.json()
  entry.metadataReturned=Object.hasOwn(data,'identity')
  await trace(entry,expected)
  ensure(response.status===expected&&!entry.metadataReturned&&!entry.corsHeaderPresent,'ANONYMOUS_OR_BROWSER_METADATA_LEAK')
}
let token,keys
try{
  ensure(Date.now()<d.expiresAt*1000,'TEST_CREDENTIAL_EXPIRED')
  await direct('anonymous_refused',401,async()=>({'Content-Type':'application/json'}))
  await direct('forged_signature_refused',401,async marker=>({...await signBridge(secret,url,body,marker),'X-JnQ-Bridge-Signature':'0'.repeat(64)}))
  await direct('signed_browser_origin_refused',403,async marker=>({...await signBridge(secret,url,body,marker),Origin:'https://fixture.invalid'}))
  keys=await isolatedKeys()
  const c=JSON.parse(await readFile('cloudflare/spot-loop/.dev.vars.spot-loop-session'))
  ensure(c.projectRef===ISOLATED_REF,'ISOLATED_AUTH_REQUIRED')
  const login=await fetch(ISOLATED_ORIGIN+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:keys.anon,'Content-Type':'application/json'},body:JSON.stringify({email:c.email,password:c.password}),redirect:'manual'})
  const session=await login.json();token=session.access_token
  ensure(login.ok&&session.user?.id===c.userId&&typeof token==='string','AUTH_FAILED')
  ensure(report.totalHttpTestRequests+2<=5,'REQUEST_BUDGET_EXHAUSTED')
  const acceptanceId=`${Date.now()}-${report.checks.length}`
  const entry={name:'edge_to_cloudflare_native_identity',acceptanceId,method:'POST',path:BRIDGE_PATH,expected:200}
  report.cloudflareRequests++;report.edgeRequests++;report.totalHttpTestRequests+=2;report.checks.push(entry);await persist()
  const started=performance.now()
  const response=await fetch(ISOLATED_ORIGIN+'/functions/v1/'+d.edge.name,{method:'POST',headers:{apikey:keys.anon,Authorization:'Bearer '+token,
    Origin:'https://codex-cloudflare-free-migrat.jnqjourney-spot-loop-migration-candidate.pages.dev','X-JnQ-Acceptance':acceptanceId,'Content-Type':'application/json'},body:'{}',redirect:'manual',signal:AbortSignal.timeout(25000)})
  entry.edgeHttpStatus=response.status;entry.clientElapsedMs=Math.round(performance.now()-started)
  const data=await response.json()
  if(data.verdict==='BRIDGE_IDENTITY_MATCH'||data.verdict==='BRIDGE_IDENTITY_MISMATCH'){
    entry.identity=data.identity;entry.matches=data.matches;entry.serverElapsedMs=data.serverElapsedMs
  }
  await trace(entry,200)
  ensure(response.status===200&&data.verdict==='BRIDGE_IDENTITY_MATCH'&&Object.values(data.matches).every(v=>v===true),'REGISTRY_IDENTITY_MISMATCH')
  assert.deepEqual(entry.identity,{key,size:registered.size,mime:'image/png',etag:registered.etag,version:registered.version,receipt_size:registered.receiptSize,receipt_etag:registered.receiptEtag,receipt_version:registered.receiptVersion})
  ensure(entry.cpuTimeMs<=7,'INSUFFICIENT_CPU_MARGIN')
  report.verdict='BRIDGE_POC_PASS'
  report.hold=true
}catch(error){report.error=/^[A-Z_]+$/.test(error.message)?error.message:'BRIDGE_NATIVE_FAILED';process.exitCode=1}
finally{
  if(token&&keys)try{const logout=await fetch(ISOLATED_ORIGIN+'/auth/v1/logout',{method:'POST',headers:{apikey:keys.anon,Authorization:'Bearer '+token},redirect:'manual'});await logout.body?.cancel();report.authSessionClosed=logout.ok}catch{report.authSessionClosed=false}
  try{await unlink(privateFile);report.localSharedKeyFileDeleted=true}catch{report.localSharedKeyFileDeleted=false}
  report.finishedAt=new Date().toISOString();await persist();console.log(JSON.stringify(report,null,2))
}
