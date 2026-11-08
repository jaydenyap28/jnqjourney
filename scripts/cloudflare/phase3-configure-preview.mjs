import {readFile,writeFile} from 'node:fs/promises'
import {cloudflareClient,PROJECT,BUCKET} from './candidate-cloudflare.mjs'
import {isolatedKeys,ISOLATED_REF,ISOLATED_ORIGIN} from './isolated-supabase.mjs'
const sharedFailClosedApproved=process.argv.includes('--allow-empty-candidate-shared-fail-closed')
const report={project:PROJECT,formalProductionModified:false,emptyCandidateProductionConfigModified:false}
try {
  const cf=await cloudflareClient()
  const before=await cf()
  if(before.name!==PROJECT||before.production_branch!=='main'||before.canonical_deployment)throw new Error('CANDIDATE_PROJECT_BOUNDARY_FAILED')
  const beforeProduction=JSON.stringify(before.deployment_configs?.production)
  const fixture=JSON.parse(await readFile('artifacts/cloudflare-phase3/fixture.json','utf8'))
  if(fixture.projectRef!==ISOLATED_REF||!fixture.fixtureId||fixture.realAuthLoginHttpStatus!==200)throw new Error('ISOLATED_FIXTURE_NOT_READY')
  const keys=await isolatedKeys()
  const vars={ENVIRONMENT:'isolated-candidate',CANDIDATE_WRITES_ENABLED:'true',CANDIDATE_SUPABASE_REF:ISOLATED_REF,SUPABASE_URL:ISOLATED_ORIGIN,CANDIDATE_SPOTS:JSON.stringify({[fixture.fixtureId]:fixture.slug}),ADMIN_EMAILS:fixture.testEmail}
  const env_vars=Object.fromEntries(Object.entries(vars).map(([key,value])=>[key,{type:'plain_text',value}]))
  env_vars.SUPABASE_ANON_KEY={type:'secret_text',value:keys.anon}
  env_vars.SUPABASE_SERVICE_ROLE_KEY={type:'secret_text',value:keys.service}
  const deployment_configs={preview:{fail_open:false,compatibility_date:'2026-11-08',limits:{cpu_ms:10},env_vars,r2_buckets:{TEST_MEDIA:{name:BUCKET}}}}
  // Cloudflare rejects unequal fail_open across environments. Changing this
  // new, never-deployed project's Production setting requires explicit consent.
  if(sharedFailClosedApproved)deployment_configs.production={fail_open:false}
  await cf('',{method:'PATCH',body:JSON.stringify({deployment_configs})})
  const after=await cf()
  const preview=after.deployment_configs?.preview
  if(preview?.fail_open!==false||preview.r2_buckets?.TEST_MEDIA?.name!==BUCKET)throw new Error('PREVIEW_PROTECTION_NOT_VERIFIED')
  if(beforeProduction!==JSON.stringify(after.deployment_configs?.production)) {
    const expectedProduction=JSON.parse(beforeProduction)
    if(sharedFailClosedApproved)expectedProduction.fail_open=false
    if(JSON.stringify(expectedProduction)!==JSON.stringify(after.deployment_configs?.production))throw new Error('PRODUCTION_CONFIG_CHANGED_UNEXPECTEDLY')
    report.emptyCandidateProductionConfigModified=true
  }
  const config={name:PROJECT,pages_build_output_dir:'./out',compatibility_date:'2026-11-08',vars,r2_buckets:[{binding:'TEST_MEDIA',bucket_name:BUCKET,preview_bucket_name:BUCKET}]}
  await writeFile('artifacts/cloudflare-spot-loop/wrangler.jsonc',JSON.stringify(config,null,2))
  report.previewFailOpen=false;report.cpuLimitMs=preview.limits?.cpu_ms;report.privateBucket=BUCKET;report.fixtureId=fixture.fixtureId;report.readyForPreviewDeployment=true
}catch(error){report.error=/^[A-Z0-9_]+$/.test(error.message)?error.message:'PREVIEW_CONFIG_FAILED';if(error.candidateReason)report.reason=error.candidateReason}
await writeFile('artifacts/cloudflare-phase3/preview-config.json',JSON.stringify(report,null,2))
console.log(JSON.stringify(report,null,2))
if(report.error)process.exitCode=1
