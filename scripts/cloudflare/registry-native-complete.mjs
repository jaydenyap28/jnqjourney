// First native gate. One persistent journal includes preparation requests.
import assert from 'node:assert/strict'
import {readFile,writeFile,rename} from 'node:fs/promises'
import {inflateSync} from 'node:zlib'
import {createHash} from 'node:crypto'
import {isolatedKeys,ISOLATED_REF,ISOLATED_ORIGIN} from './isolated-supabase.mjs'
const root='artifacts/cloudflare-registry-native/'
const deployment=JSON.parse(await readFile(root+'deployment.json'))
const boundaries=JSON.parse(await readFile(root+'post-boundaries.json'))
const credentials=JSON.parse(await readFile('cloudflare/spot-loop/.dev.vars.spot-loop-session'))
assert.equal(credentials.projectRef,ISOLATED_REF)
assert.ok(deployment.success&&deployment.environment==='preview'&&boundaries.passed)
const origin='https://codex-cloudflare-free-migrat.jnqjourney-spot-loop-migration-candidate.pages.dev'
const file=root+'native-acceptance.json'
const report={startedAt:new Date().toISOString(),projectRef:ISOLATED_REF,deploymentId:deployment.deploymentId,workerSha256:deployment.workerSha256,
  origin,budget:40,checks:[],directOperations:[],verdict:'PENDING',hold:true}
await writeFile(file,JSON.stringify(report,null,2),{flag:'wx'})
const persist=async()=>{await writeFile(file+'.tmp',JSON.stringify(report,null,2));await rename(file+'.tmp',file)}
const ensure=(value,code)=>{if(!value)throw Error(code)}
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=','base64')
for(let p=8;p<png.length;){const n=png.readUInt32BE(p);let crc=0xffffffff;for(const v of png.subarray(p+4,p+8+n)){crc^=v;for(let bit=0;bit<8;bit++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1}ensure(((crc^0xffffffff)>>>0)===png.readUInt32BE(p+8+n),'PNG_CRC_INVALID');if(png.subarray(p+4,p+8).toString()==='IDAT')inflateSync(png.subarray(p+8,p+8+n));p+=n+12}
let token,keys
async function call(name,path,{body,expected=200,method=body===undefined?'GET':'POST',auth=true}={}){
  ensure(report.checks.length<40,'REQUEST_BUDGET_EXHAUSTED')
  const acceptanceId=`${Date.now()}-${report.checks.length}`
  const entry={name,path,method,acceptanceId,deploymentId:deployment.deploymentId,issuedAt:new Date().toISOString(),expected}
  report.checks.push(entry);await persist()
  const response=await fetch(origin+path,{method,headers:{'X-JnQ-Acceptance':acceptanceId,Origin:origin,'Content-Type':'application/json',...(auth?{Cookie:`__Host-jnq-candidate=${token}`}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual',signal:AbortSignal.timeout(30000)})
  entry.status=response.status
  const bytes=Buffer.from(await response.arrayBuffer())
  let trace
  const end=Date.now()+25000
  while(Date.now()<end){
    let tail
    try{tail=JSON.parse(await readFile(root+'runtime-events.json'))}catch{}
    ensure(!tail?.diagnostics?.parseErrors&&!tail?.diagnostics?.truncatedEvents,'TAIL_INTEGRITY_FAILED')
    if(tail?.deploymentId===deployment.deploymentId)trace=tail.events.find(e=>e.acceptanceId===acceptanceId)
    if(trace||tail?.diagnostics?.closed)break
    await new Promise(resolve=>setTimeout(resolve,50))
  }
  if(trace)Object.assign(entry,{cpuTimeMs:trace.cpuTime,runtimeWallTimeMs:trace.wallTime,outcome:trace.outcome,operations:trace.operations})
  await persist()
  ensure(Number.isFinite(trace?.cpuTime),'NATIVE_CPU_NOT_OBSERVED')
  ensure(trace.method===method&&trace.status===response.status&&trace.path===path,'NATIVE_TRACE_MISMATCH')
  ensure(trace.cpuTime<=10&&trace.outcome==='ok','NATIVE_CPU_LIMIT_EXCEEDED')
  ensure(trace.operations,'NATIVE_OPERATION_COUNTS_MISSING')
  if(trace.cpuTime===10)entry.critical=true
  ensure(response.status===expected,'UNEXPECTED_HTTP_STATUS')
  await persist()
  return JSON.parse(bytes.toString())
}
try {
  keys=await isolatedKeys()
  const login=await fetch(ISOLATED_ORIGIN+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:keys.anon,'Content-Type':'application/json'},body:JSON.stringify({email:credentials.email,password:credentials.password}),redirect:'manual'})
  const session=await login.json();token=session.access_token
  ensure(login.ok&&session.user?.id===credentials.userId&&typeof token==='string','ISOLATED_AUTH_FAILED')
  const base='/api/candidate/spots/92001/image'
  const ticket=await call('prepare_presign_tail_probe',base+'/presign',{body:{size:png.length,type:'image/png'},expected:201})
  report.tailAssociationProved=true
  const signed=new URL(ticket.putUrl)
  ensure(signed.hostname==='41feff7cd62964f2eb33bb82508509a1.r2.cloudflarestorage.com'&&signed.pathname.startsWith('/jnqjourney-spot-loop-isolated-media/_candidate-staging/92001/'),'SIGNED_TARGET_MISMATCH')
  const put=await fetch(signed,{method:'PUT',headers:{'Content-Type':'image/png'},body:png,redirect:'manual'})
  await put.body?.cancel()
  report.directOperations.push({name:'staging_put',status:put.status,workerInvocations:0,bytes:png.length})
  await persist();ensure(put.ok,'DIRECT_PUT_FAILED')
  report.firstMedia={path:'/'+ticket.key,sha256:createHash('sha256').update(png).digest('hex'),bytes:png.length}
  await persist()
  await call('complete_first',base+'/complete',{body:{key:ticket.key},expected:201})
  await call('complete_confirm_only',base+'/complete',{body:{key:ticket.key},expected:201})
  report.completeGatePassed=true
  report.verdict='COMPLETE_PASSED_ALBUMS_PENDING'
}catch(error){
  report.error=/^[A-Z_]+$/.test(error.message)?error.message:'NATIVE_ACCEPTANCE_FAILED'
  report.verdict='FREE_REGISTRY_CPU_NO_GO'
  process.exitCode=1
}finally{
  if(token&&keys){
    try{const logout=await fetch(ISOLATED_ORIGIN+'/auth/v1/logout',{method:'POST',headers:{apikey:keys.anon,Authorization:`Bearer ${token}`},redirect:'manual'});await logout.body?.cancel();report.authSessionClosed=logout.ok}catch{report.authSessionClosed=false}
  }
  report.finishedAt=new Date().toISOString();await persist()
  console.log(JSON.stringify(report,null,2))
}
