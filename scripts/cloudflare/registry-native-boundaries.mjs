// Read-only Cloudflare isolation gate. Never serialize secret values.
import assert from 'node:assert/strict'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {ACCOUNT,PROJECT,BUCKET,BRANCH,cloudflareClient,privateWranglerToken} from './candidate-cloudflare.mjs'
const root='artifacts/cloudflare-registry-native/'
await mkdir(root,{recursive:true})
const cf=await cloudflareClient()
const [project,deployments]=await Promise.all([cf(),cf('/deployments')])
assert.ok(deployments.length<10)
const prod=project.deployment_configs.production,preview=project.deployment_configs.preview
const beforeIds=['c592d40c','bd7af17d','5332ce56','97cb9bd0','50f3962e','62dbbd59','730e582e','ed4e084d']
const report={checkedAt:new Date().toISOString(),project:PROJECT,canonicalEmpty:!project.canonical_deployment,
  productionEnvCount:Object.keys(prod.env_vars??{}).length,productionR2Count:Object.keys(prod.r2_buckets??{}).length,
  productionDeployments:deployments.filter(d=>d.environment==='production').length,
  failClosedBoth:prod.fail_open===false&&preview.fail_open===false,
  formalDomainAttached:(project.domains??[]).some(d=>/(^|\.)jnqjourney\.com$/i.test(d)),
  previewBucket:preview.r2_buckets?.TEST_MEDIA?.name,
  secrets:Object.fromEntries(['SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','CANDIDATE_R2_ACCESS_KEY_ID','CANDIDATE_R2_SECRET_ACCESS_KEY'].map(k=>[k,preview.env_vars?.[k]?.type])),legacy:[]}
assert.ok(report.canonicalEmpty&&report.productionEnvCount===0&&report.productionR2Count===0&&report.productionDeployments===0&&report.failClosedBoth&&!report.formalDomainAttached&&report.previewBucket===BUCKET)
assert.ok(Object.values(report.secrets).every(type=>type==='secret_text'))
for(const prefix of beforeIds){
  const listed=deployments.find(d=>d.id.startsWith(prefix))
  assert.ok(listed)
  const d=await cf('/deployments/'+listed.id)
  const mapping=d.env_vars?.CANDIDATE_SPOTS
  assert.equal(mapping?.type,'plain_text')
  const ids=Object.keys(JSON.parse(mapping.value))
  assert.ok(ids.length&&ids.every(id=>/^[1-9]\d*$/.test(id)&&Number(id)<92000))
  assert.equal(d.environment,'preview')
  assert.equal(d.deployment_trigger?.metadata?.branch,BRANCH)
  assert.equal(d.r2_buckets?.TEST_MEDIA?.name,BUCKET)
  assert.equal(d.env_vars?.CANDIDATE_SUPABASE_REF?.value,'rnamstwwbzknwbjwdgrf')
  report.legacy.push({id:d.id,fixtureIds:ids,bucket:BUCKET,isolatedSupabase:true})
}
const token=await privateWranglerToken()
async function bucket(path){
  const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/domains/${path}`,{headers:{Authorization:`Bearer ${token}`},redirect:'manual'})
  const payload=await response.json()
  assert.ok(response.ok&&payload.success)
  return payload.result
}
const [managed,custom]=await Promise.all([bucket('managed'),bucket('custom')])
assert.equal(managed.enabled,false)
assert.equal(custom.domains.length,0)
report.bucketPrivate=true
report.sqlLfSha256=createHash('sha256').update((await readFile('cloudflare/spot-loop/review/trusted-media-registry.draft.sql','utf8')).replaceAll('\r\n','\n')).digest('hex')
assert.equal(report.sqlLfSha256,'b221473d7f08dd28bcee736928b7e34b1a16f3191723f5decd025709972008f1')
if(process.argv.includes('--after')||process.argv.includes('--final')){
  const fixtures=JSON.parse(await readFile(root+'fixtures.json'))
  const configured=JSON.parse(preview.env_vars.CANDIDATE_SPOTS.value)
  assert.deepEqual(Object.keys(configured).sort(),fixtures.fixtures.map(f=>String(f.id)).sort())
  assert.equal(preview.env_vars.CANDIDATE_MEDIA_REGISTRY?.value,'true')
  report.newPreviewFixtureIds=Object.keys(configured)
  const deployment=JSON.parse(await readFile(root+'deployment.json'))
  const actual=await cf('/deployments/'+deployment.deploymentId)
  assert.equal(actual.environment,'preview')
  assert.deepEqual(JSON.parse(actual.env_vars.CANDIDATE_SPOTS.value),configured)
  assert.equal(actual.r2_buckets?.TEST_MEDIA?.name,BUCKET)
  assert.equal(actual.env_vars.CANDIDATE_NATIVE_METRICS?.value,'true')
  report.newDeploymentId=actual.id
}
report.passed=true
await writeFile(root+(process.argv.includes('--final')?'final-boundaries.json':process.argv.includes('--after')?'post-boundaries.json':'preflight.json'),JSON.stringify(report,null,2),{flag:'wx'})
console.log(JSON.stringify(report,null,2))
