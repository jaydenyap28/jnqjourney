// Read-only candidate metadata. Secret values are never returned or serialized.
import {writeFile} from 'node:fs/promises'
import {cloudflareClient,PROJECT,BUCKET,BRANCH} from './candidate-cloudflare.mjs'
const cf=await cloudflareClient(),project=await cf(),deployments=await cf('/deployments')
const prod=project.deployment_configs.production,preview=project.deployment_configs.preview
const names=['CANDIDATE_R2_ACCESS_KEY_ID','CANDIDATE_R2_SECRET_ACCESS_KEY']
const report={project:PROJECT,checkedAt:new Date().toISOString(),canonicalDeploymentEmpty:!project.canonical_deployment,
  productionEnvironmentVariableCount:Object.keys(prod.env_vars||{}).length,productionR2BindingCount:Object.keys(prod.r2_buckets||{}).length,
  productionDeploymentCount:deployments.filter(d=>d.environment==='production').length,
  allDeploymentsIsolatedPreview:deployments.every(d=>d.environment==='preview'&&d.deployment_trigger?.metadata?.branch===BRANCH),
  failClosedBothEnvironments:prod.fail_open===false&&preview.fail_open===false,previewBucket:preview.r2_buckets?.TEST_MEDIA?.name,
  formalDomainBound:(project.domains||[]).some(domain=>/jnqjourney\.com$/.test(domain)),
  signingSecretPresence:Object.fromEntries(names.map(name=>[name,preview.env_vars?.[name]?.type==='secret_text']))}
report.boundariesPassed=report.canonicalDeploymentEmpty&&report.productionEnvironmentVariableCount===0&&report.productionR2BindingCount===0&&report.productionDeploymentCount===0&&report.allDeploymentsIsolatedPreview&&report.failClosedBothEnvironments&&report.previewBucket===BUCKET&&!report.formalDomainBound
report.directUploadCredentialsReady=Object.values(report.signingSecretPresence).every(Boolean)
await writeFile('artifacts/cloudflare-upload-fix/boundaries.json',JSON.stringify(report,null,2))
console.log(JSON.stringify(report,null,2))
if(!report.boundariesPassed)process.exitCode=1
