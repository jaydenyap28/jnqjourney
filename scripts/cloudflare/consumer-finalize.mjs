import assert from 'node:assert/strict'
import {readFile,readdir,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {cloudflareClient,privateWranglerToken,ACCOUNT,BUCKET,PROJECT} from './candidate-cloudflare.mjs'
import {isolatedKeys,isolatedRequest,ISOLATED_REF,ISOLATED_ORIGIN} from './isolated-supabase.mjs'
const root='artifacts/cloudflare-p0-consumers/',site='http://127.0.0.1:4401'
const report={checkedAt:new Date().toISOString(),project:PROJECT,formalMigration:'HOLD',paidServicesAdded:0,newSecrets:0,formalWrites:0}
const keys=await isolatedKeys()
const sha=value=>createHash('sha256').update(value).digest('hex')
report.frozenRegistrySha256=sha((await readFile('cloudflare/spot-loop/review/trusted-media-registry.draft.sql','utf8')).replaceAll('\r\n','\n'))
assert.equal(report.frozenRegistrySha256,'b221473d7f08dd28bcee736928b7e34b1a16f3191723f5decd025709972008f1')
let chunks=0,privateKeyMatches=0,privateRpcMatches=0
async function scan(dir){for(const item of await readdir(dir,{withFileTypes:true})){
  const file=dir+'/'+item.name
  if(item.isDirectory())await scan(file)
  else if(item.name.endsWith('.js')){const text=await readFile(file,'utf8');chunks++;if(text.includes(keys.service))privateKeyMatches++;if(text.includes('jnq_public_spots'))privateRpcMatches++}
}}
await scan(root+'site/.next/static')
assert.equal(privateKeyMatches,0);assert.equal(privateRpcMatches,0)
report.clientBundleScan={chunks,privateKeyMatches,privateRpcMatches,includesCompiledEnglishPages:true}
const cf=await cloudflareClient(),project=await cf()
assert.ok(!project.canonical_deployment)
assert.deepEqual(Object.keys(project.deployment_configs.production.env_vars||{}),[])
assert.deepEqual(Object.keys(project.deployment_configs.production.r2_buckets||{}),[])
assert.equal(project.deployment_configs.preview.r2_buckets.TEST_MEDIA.name,BUCKET)
for(const name of ['SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','CANDIDATE_R2_ACCESS_KEY_ID','CANDIDATE_R2_SECRET_ACCESS_KEY'])assert.equal(project.deployment_configs.preview.env_vars[name].type,'secret_text')
report.productionCanonicalEmpty=true;report.productionVariables=0;report.productionBindings=0;report.previewSecretTypesCorrect=true
report.productionFailClosed=project.deployment_configs.production.fail_open===false;report.previewFailClosed=project.deployment_configs.preview.fail_open===false
assert.ok(report.productionFailClosed&&report.previewFailClosed)
const token=await privateWranglerToken()
report.buckets=[]
for(const name of [BUCKET,'jnqjourney-img']){
  const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${name}/domains/managed`,{headers:{Authorization:'Bearer '+token},redirect:'manual'})
  const payload=await response.json();assert.ok(response.ok&&payload.success)
  assert.equal(payload.result.enabled,name==='jnqjourney-img')
  report.buckets.push({name,managedPublicEnabled:payload.result.enabled})
}
const fixture=await isolatedRequest(keys,'/rest/v1/locations?select=id,status,publication_status&id=in.(92061,92062)&order=id.asc')
assert.ok(fixture.ok);report.fixtures=await fixture.json();assert.ok(report.fixtures.length===2&&report.fixtures.every(row=>row.publication_status==='hidden'))
const credentials=JSON.parse(await readFile('cloudflare/spot-loop/.dev.vars.spot-loop-session'));assert.equal(credentials.projectRef,ISOLATED_REF)
const auth=await fetch(ISOLATED_ORIGIN+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:keys.anon,'Content-Type':'application/json'},body:JSON.stringify({email:credentials.email,password:credentials.password})})
const session=await auth.json();assert.ok(auth.ok&&session.user.id===credentials.userId)
try{
  const direct=await fetch(ISOLATED_ORIGIN+'/rest/v1/locations?select=id,name&limit=1',{headers:{apikey:keys.anon,Authorization:'Bearer '+session.access_token}})
  report.authenticatedDirectTable={status:direct.status,code:(await direct.json()).code}
  assert.equal(report.authenticatedDirectTable.status,403);assert.equal(report.authenticatedDirectTable.code,'42501')
  report.candidateWritesBlocked=[]
  for(const resource of ['locations','notes','guides']){
    const response=await fetch(site+'/api/admin/'+resource,{method:resource==='locations'?'PATCH':'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({id:92061,data:{name:'MUST NOT WRITE'}})})
    const result=await response.json();assert.ok(response.status===503&&JSON.stringify(result).includes('未执行保存'))
    report.candidateWritesBlocked.push({resource,status:response.status})
  }
}finally{
  const logout=await fetch(ISOLATED_ORIGIN+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:keys.anon,Authorization:'Bearer '+session.access_token}});report.localSessionClosed=logout.ok
}
const native=JSON.parse(await readFile(root+'runtime-events.json'))
assert.equal(native.count,13);assert.ok(native.events.every(event=>Number.isFinite(event.cpuTime)&&event.cpuTime<=10)&&!native.diagnostics.parseErrors&&!native.diagnostics.truncatedEvents)
report.nativeMarkedSamples={count:native.count,peakCpuMs:Math.max(...native.events.map(event=>event.cpuTime)),actualTotalWorkerRequests:'UNKNOWN: browser/server feed requests without markers are not a total request ledger',originalP0MissingTail:'1794278768484-11 remains UNKNOWN'}
report.accountFreeQuotaRemaining='UNKNOWN';report.edgeCpu='UNKNOWN'
await writeFile(root+'final-boundaries.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2))
