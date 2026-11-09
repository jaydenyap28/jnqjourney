// Read-only gate for the 4e443f4 native acceptance. Never serialize secrets.
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {createHash} from 'node:crypto'
import {SPOT_FIELDS} from '../../cloudflare/spot-loop/spot-contract.mjs'
import {ACCOUNT,PROJECT,BUCKET,BRANCH,cloudflareClient,privateWranglerToken} from './candidate-cloudflare.mjs'
import {ISOLATED_REF,isolatedKeys,isolatedRequest} from './isolated-supabase.mjs'

const directory='artifacts/cloudflare-compatibility-native'
await mkdir(directory,{recursive:true})
const run=promisify(execFile)
const commit=(await run('git',['rev-parse','HEAD'],{windowsHide:true})).stdout.trim()
const sourceCommit=(await run('git',['rev-parse','4e443f4'],{windowsHide:true})).stdout.trim()
await run('git',['merge-base','--is-ancestor',sourceCommit,commit],{windowsHide:true})
await run('git',['diff','--exit-code',sourceCommit,'--','cloudflare/spot-loop/worker.mjs','cloudflare/spot-loop/spot-contract.mjs','cloudflare/spot-loop/editor.js','cloudflare/spot-loop/admin.html','scripts/cloudflare/package-spot-loop.mjs'],{windowsHide:true})
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex')
const report={checkedAt:new Date().toISOString(),sourceCommit,checkedHead:commit,project:PROJECT,branch:BRANCH,isolatedSupabaseRef:ISOLATED_REF,candidateWorkerRequests:0,sqlExecuted:false,productionDataAccessed:false}

try {
  const cf=await cloudflareClient()
  const project=await cf()
  const old=await cf('/deployments/c592d40c-394e-4cbc-b842-f3cb2aa71535')
  const production=project.deployment_configs.production
  const preview=project.deployment_configs.preview
  const deployments=await cf('/deployments')
  const secretNames=['SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','CANDIDATE_R2_ACCESS_KEY_ID','CANDIDATE_R2_SECRET_ACCESS_KEY']
  report.boundaries={canonicalEmpty:!project.canonical_deployment,productionEnvironmentCount:Object.keys(production.env_vars||{}).length,productionR2BindingCount:Object.keys(production.r2_buckets||{}).length,productionDeploymentCount:deployments.filter(item=>item.environment==='production').length,failClosedBoth:production.fail_open===false&&preview.fail_open===false,previewBucketMatches:preview.r2_buckets?.TEST_MEDIA?.name===BUCKET,previewSupabaseMatches:preview.env_vars?.CANDIDATE_SUPABASE_REF?.value===ISOLATED_REF,formalDomainAttached:(project.domains||[]).some(name=>name.endsWith('jnqjourney.com')),secrets:Object.fromEntries(secretNames.map(name=>[name,preview.env_vars?.[name]?.type==='secret_text'])),oldFixedDeployment:{id:old.id,url:old.url,environment:old.environment,status:old.latest_stage?.status},latestDeploymentId:project.latest_deployment?.id}
  const b=report.boundaries
  report.boundariesPassed=b.canonicalEmpty&&b.productionEnvironmentCount===0&&b.productionR2BindingCount===0&&b.productionDeploymentCount===0&&b.failClosedBoth&&b.previewBucketMatches&&b.previewSupabaseMatches&&!b.formalDomainAttached&&Object.values(b.secrets).every(Boolean)&&old.environment==='preview'&&old.latest_stage?.status==='success'
  if(!report.boundariesPassed)throw new Error('ENVIRONMENT_BOUNDARY_FAILED')

  const token=await privateWranglerToken()
  async function bucketMetadata(suffix) {
    const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}${suffix}`,{headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(12000)})
    const payload=await response.json()
    if(!response.ok||!payload.success)throw new Error('ISOLATED_BUCKET_METADATA_UNAVAILABLE')
    return payload.result
  }
  const managed=await bucketMetadata('/domains/managed')
  const custom=await bucketMetadata('/domains/custom')
  report.testBucket={name:BUCKET,managedPublicAccessEnabled:managed.enabled,customDomainCount:custom.domains?.length}
  if(managed.enabled!==false||custom.domains?.length!==0)throw new Error('ISOLATED_BUCKET_NOT_PRIVATE')

  const sourceWorker=await readFile('cloudflare/spot-loop/worker.mjs')
  const sourceContract=await readFile('cloudflare/spot-loop/spot-contract.mjs')
  const packagedWorker=await readFile('artifacts/cloudflare-spot-loop/out/_worker.js')
  const packagedContract=await readFile('artifacts/cloudflare-spot-loop/out/spot-contract.mjs')
  report.package={workerSha256:sha256(sourceWorker),contractSha256:sha256(sourceContract),workerMatches:sourceWorker.equals(packagedWorker),contractMatches:sourceContract.equals(packagedContract),topLevelFiles:(await readdir('artifacts/cloudflare-spot-loop/out')).length}
  if(!report.package.workerMatches||!report.package.contractMatches)throw new Error('PACKAGE_SOURCE_MISMATCH')

  const keys=await isolatedKeys()
  const response=await isolatedRequest(keys,'/rest/v1/',{headers:{Accept:'application/openapi+json'}})
  if(!response.ok)throw new Error('ISOLATED_SCHEMA_UNAVAILABLE')
  const schema=await response.json()
  const properties=schema.definitions?.locations?.properties||{}
  report.schema={actualColumnCount:Object.keys(properties).length,requiredColumnCount:SPOT_FIELDS.length,missingColumns:SPOT_FIELDS.filter(name=>!Object.hasOwn(properties,name)),openingHoursType:properties.opening_hours?.format||properties.opening_hours?.type,expectedOpeningHoursType:'text'}
  const probe=await isolatedRequest(keys,`/rest/v1/locations?select=${SPOT_FIELDS.join(',')}&limit=0`)
  report.schema.readProbeHttpStatus=probe.status
  if(!probe.ok){
    const error=await probe.json()
    if(/^[A-Z0-9]+$/.test(error.code||''))report.schema.readProbeErrorCode=error.code
  }else await probe.body?.cancel()
  report.schemaCompatible=report.schema.missingColumns.length===0&&report.schema.openingHoursType==='text'&&probe.ok
  if(!report.schemaCompatible)throw new Error('ISOLATED_SCHEMA_CONTRACT_MISMATCH')
}catch(error){report.error=/^[A-Z_]+$/.test(error.message)?error.message:'COMPATIBILITY_PREFLIGHT_UNAVAILABLE'}

report.verdict=report.error?'NO_GO_HOLD':'READY_FOR_ISOLATED_FIXTURE_SETUP'
report.previewDeployed=false
report.finishedAt=new Date().toISOString()
await writeFile(directory+'/preflight.json',JSON.stringify(report,null,2))
console.log(JSON.stringify(report,null,2))
if(report.error)process.exitCode=1
