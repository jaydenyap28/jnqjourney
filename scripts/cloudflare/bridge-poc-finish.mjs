// Remove only this run's temporary project-level authentication secret.
// The immutable Preview snapshot retains its hard deadline in the Worker.
import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {readFile,writeFile,access} from 'node:fs/promises'
import {cloudflareClient,PROJECT,BUCKET} from './candidate-cloudflare.mjs'
const saveTrial=process.argv.includes('--save-trial')
const root=saveTrial?'artifacts/cloudflare-edge-bridge-save/':'artifacts/cloudflare-bridge-poc/',REF='rnamstwwbzknwbjwdgrf',NAME='CANDIDATE_IDENTITY_BRIDGE_KEY'
const deployment=JSON.parse(await readFile(root+'deployment.json'))
const acceptance=JSON.parse(await readFile(root+'native-acceptance.json'))
assert.equal(acceptance.deploymentId,deployment.deploymentId)
assert.ok(saveTrial?acceptance.cloudflareRequests>0&&acceptance.cloudflareRequests<=24:acceptance.cloudflareRequests===4)
const cf=await cloudflareClient(),before=await cf(),run=promisify(execFile)
const prod=JSON.stringify(before.deployment_configs.production)
const beforeEnv=before.deployment_configs.preview.env_vars
assert.equal(beforeEnv[NAME]?.type,'secret_text')
await cf('',{method:'PATCH',body:JSON.stringify({deployment_configs:{preview:{env_vars:{[NAME]:null}}}})})
await run(process.execPath,[process.env.JNQ_SUPABASE_CLI,'secrets','unset',NAME,'--project-ref',REF,'--yes'],{windowsHide:true,maxBuffer:1024*1024})
const after=await cf()
assert.equal(after.name,PROJECT)
assert.ok(!after.canonical_deployment)
assert.equal(JSON.stringify(after.deployment_configs.production),prod)
assert.equal(Object.keys(after.deployment_configs.production.env_vars??{}).length,0)
assert.equal(Object.keys(after.deployment_configs.production.r2_buckets??{}).length,0)
assert.equal(after.deployment_configs.production.fail_open,false)
assert.equal(after.deployment_configs.preview.fail_open,false)
assert.equal(after.deployment_configs.preview.r2_buckets.TEST_MEDIA.name,BUCKET)
assert.ok(!after.deployment_configs.preview.env_vars[NAME])
for(const [name,value] of Object.entries(beforeEnv))if(name!==NAME)assert.deepEqual(after.deployment_configs.preview.env_vars[name],value)
const list=JSON.parse((await run(process.execPath,[process.env.JNQ_SUPABASE_CLI,'secrets','list','--project-ref',REF,'--output','json'],{windowsHide:true,maxBuffer:1024*1024})).stdout)
assert.ok(!list.some(s=>s.name===NAME))
assert.ok(list.some(s=>s.name==='CANDIDATE_R2_ACCESS_KEY_ID')&&list.some(s=>s.name==='CANDIDATE_R2_SECRET_ACCESS_KEY'))
let localExists=true
try{await access('cloudflare/spot-loop/.dev.vars.identity-bridge'+(saveTrial?'-save':''))}catch{localExists=false}
assert.equal(localExists,false)
const snapshot=await cf('/deployments/'+deployment.deploymentId)
assert.equal(snapshot.environment,'preview')
assert.equal(snapshot.r2_buckets.TEST_MEDIA.name,BUCKET)
if(saveTrial)assert.equal(snapshot.env_vars.BRIDGE_FIXTURE_IDS.value,'92005,92017,92030')
else assert.equal(snapshot.env_vars.BRIDGE_FIXTURE.value,'92005')
assert.equal(snapshot.env_vars.BRIDGE_EXPIRES_AT.value,String(deployment.expiresAt))
const final={checkedAt:new Date().toISOString(),productionCanonicalEmpty:true,productionConfigurationUnchanged:true,productionEnvironmentCount:0,productionR2Count:0,
  previewFailClosed:true,productionFailClosed:true,bucket:BUCKET,fixtures:saveTrial?[92005,92017,92030]:[92005],localTemporaryKeyDeleted:true,
  supabaseProjectSharedSecretRemoved:true,pagesPreviewProjectSharedSecretRemoved:true,remainingSupabaseSecretMetadataNames:list.map(s=>s.name),
  fixedDeploymentRetained:true,immutablePreviewSnapshotHasHardExpiry:deployment.expiresAt,
  caveat:'Existing Preview snapshots and already-loaded Edge runtimes may retain the temporary key until their fixed hard deadline. No further traffic is sent.',
  registryWrites:saveTrial?'See native acceptance and media setup':0,r2Writes:saveTrial?'See media setup':0,sqlModified:false,oldWorkerRedeployed:false,metadataQueryCount:acceptance.cloudflareRequests,finalVerdict:acceptance.verdict,formalMigration:'HOLD'}
await writeFile(root+'final-boundaries.json',JSON.stringify(final,null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify(final,null,2))
