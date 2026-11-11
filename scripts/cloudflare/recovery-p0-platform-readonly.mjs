// GET-only scoped control-plane checks. Never output OAuth/Secret values.
import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolveNs,resolveCname} from 'node:dns/promises'
import {ACCOUNT,privateWranglerToken} from './candidate-cloudflare.mjs'
const root='artifacts/cloudflare-static-launch-p0'
await mkdir(root,{recursive:true})
const token=await privateWranglerToken()
async function get(suffix) {
  assert.ok(suffix.startsWith(`/accounts/${ACCOUNT}/r2/buckets/jnqjourney-img`)||suffix===`/accounts/${ACCOUNT}/pages/projects/jnqjourney-static-recovery-candidate`)
  const response=await fetch('https://api.cloudflare.com/client/v4'+suffix,{headers:{Authorization:`Bearer ${token}`},redirect:'manual',signal:AbortSignal.timeout(20000)})
  const data=await response.json()
  return {status:response.status,success:data.success,result:data.success?data.result:undefined,errorCodes:data.errors?.map(error=>error.code)}
}
const [managed,custom,project]=await Promise.all([
  get(`/accounts/${ACCOUNT}/r2/buckets/jnqjourney-img/domains/managed`),
  get(`/accounts/${ACCOUNT}/r2/buckets/jnqjourney-img/domains/custom`),
  get(`/accounts/${ACCOUNT}/pages/projects/jnqjourney-static-recovery-candidate`),
])
const p=project.result
const report={checkedAt:new Date().toISOString(),methods:['GET'],bucket:'jnqjourney-img',managed,custom,
  previewProject:{status:project.status,success:project.success,productionCanonicalEmpty:p?!p.canonical_deployment:'UNKNOWN',customDomains:p?.domains?.filter(domain=>!domain.endsWith('.pages.dev')),
    environments:p?Object.fromEntries(Object.entries(p.deployment_configs||{}).map(([environment,value])=>[environment,{variableCount:Object.keys(value.env_vars||{}).length,r2Bindings:Object.keys(value.r2_buckets||{}).length}])):'UNKNOWN'},
  dns:{nameservers:await resolveNs('jnqjourney.com').catch(error=>'UNKNOWN_'+error.code),wwwCname:await resolveCname('www.jnqjourney.com').catch(error=>'UNKNOWN_'+error.code)},
  writes:0}
await writeFile(root+'/platform-readonly.json',JSON.stringify(report,null,2))
console.log(JSON.stringify(report))
