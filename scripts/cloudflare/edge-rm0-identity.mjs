// One hosted S3 identity request. No synthetic headers, versions or credentials
// leave the server. Login tokens remain private and are revoked on completion.
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {isolatedKeys,ISOLATED_REF,ISOLATED_ORIGIN} from './isolated-supabase.mjs'
const root='artifacts/cloudflare-edge-rm0/'
assert.deepEqual(process.argv.slice(2),[ISOLATED_REF])
const deployment=JSON.parse(await readFile(root+'identity-deployment.json'))
assert.ok(deployment.success&&deployment.verifyJwt&&deployment.projectRef===ISOLATED_REF)
const media=JSON.parse(await readFile('cloudflare/spot-loop/evidence/registry-native-2026-11-09/media-setup.json'))
const item=media.media.find(m=>m.registered&&m.spot===92005)
assert.ok(item&&item.version&&item.receiptVersion)
const credentials=JSON.parse(await readFile('cloudflare/spot-loop/.dev.vars.spot-loop-session','utf8'))
assert.equal(credentials.projectRef,ISOLATED_REF)
const keys=await isolatedKeys()
const report={projectRef:ISOLATED_REF,functionId:deployment.functionId,functionVersion:deployment.version,
  sourceSha256:deployment.sourceSha256,functionName:deployment.name,key:item.key,edgeInvocations:0,saveRpcCalls:0,cpuMs:'UNKNOWN',
  verdict:'S3_IDENTITY_NOT_VERIFIED',hold:true}
let token
const start=performance.now()
try{
  const login=await fetch(ISOLATED_ORIGIN+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:keys.anon,'Content-Type':'application/json'},body:JSON.stringify({email:credentials.email,password:credentials.password}),redirect:'manual'})
  const session=await login.json()
  token=session.access_token
  assert.ok(login.ok&&session.user?.id===credentials.userId&&typeof token==='string')
  report.authenticatedExistingFixture=true
  report.edgeInvocations=1
  const started=performance.now()
  const response=await fetch(ISOLATED_ORIGIN+'/functions/v1/'+deployment.name,{
    method:'POST',headers:{apikey:keys.anon,Authorization:'Bearer '+token,'Content-Type':'application/json',Origin:'https://codex-cloudflare-free-migrat.jnqjourney-spot-loop-migration-candidate.pages.dev'},
    body:JSON.stringify({action:'identity',key:item.key}),redirect:'manual',signal:AbortSignal.timeout(45000)})
  report.httpStatus=response.status
  report.clientElapsedMs=Math.round(performance.now()-started)
  const data=await response.json()
  // Server response is an explicit non-secret identity report. Refuse unexpected
  // shapes instead of serializing generic gateway bodies or arbitrary headers.
  if(data.verdict==='S3_IDENTITY_PASS'||data.verdict==='S3_IDENTITY_NO_GO'){
    for(const key of ['final','receipt','expected','comparisons','verdict','s3Requests','registryRpc','getReadbackMatched','serverElapsedMs','cpuMs'])if(Object.hasOwn(data,key))report[key]=data[key]
    assert.deepEqual(data.expected,{size:item.size,etag:item.etag,version:item.version,mime:'image/png',receiptSize:item.receiptSize,receiptEtag:item.receiptEtag,receiptVersion:item.receiptVersion})
    report.expectedRegistryIdentityMatchesHistoricalNativeRecord=true
    report.stageOnePassed=response.status===200&&data.verdict==='S3_IDENTITY_PASS'&&data.getReadbackMatched===true
  }else{
    const known=['ISOLATED_PROJECT_REQUIRED','ORIGIN_REFUSED','ADMIN_REQUIRED','PILOT_SECRET_MISSING','REGISTRY_LOOKUP_FAILED','MEDIA_NOT_REGISTERED','PILOT_UPSTREAM_UNAVAILABLE','INVALID_SESSION','SIGN_IN_REQUIRED']
    report.error=known.includes(data.error)?data.error:'EDGE_RESPONSE_UNEXPECTED'
  }
}catch{
  report.error='EDGE_IDENTITY_REQUEST_OR_ASSERTION_FAILED'
}finally{
  if(token)try{
    const logout=await fetch(ISOLATED_ORIGIN+'/auth/v1/logout',{method:'POST',headers:{apikey:keys.anon,Authorization:'Bearer '+token},redirect:'manual'})
    await logout.body?.cancel();report.authSessionClosed=logout.ok
  }catch{report.authSessionClosed=false}
  report.totalElapsedMs=Math.round(performance.now()-start)
  report.finishedAt=new Date().toISOString()
  await writeFile(root+'identity-acceptance.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'})
  console.log(JSON.stringify(report,null,2))
  if(!report.stageOnePassed)process.exitCode=1
}
