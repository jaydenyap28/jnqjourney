import assert from 'node:assert/strict'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {ACCOUNT,privateWranglerToken} from './candidate-cloudflare.mjs'
import {RECOVERY_BASE,PROJECT} from './recovery-sources.mjs'

assert.deepEqual(process.argv.slice(2),['--approved-domain-recovery'])
const directory=path.join(RECOVERY_BASE,'runs/production-20261111')
const deployment=JSON.parse(await readFile(path.join(directory,'production-deployment.json'),'utf8'))
assert.ok(deployment.success&&deployment.environment==='production'&&deployment.project===PROJECT)
const token=await privateWranglerToken()
const root='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+'/pages/projects/'+PROJECT
async function api(suffix,options={}){
  const r=await fetch(root+suffix,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(20000)})
  const p=await r.json()
  return {http:r.status,codes:p.errors?.map(error=>error.code)??[],result:p.success?p.result:null}
}
const current=await api('')
assert.ok(current.result?.canonical_deployment?.id===deployment.deploymentId&&current.result.production_branch===deployment.productionBranch)
const before=await api('/domains')
assert.ok(before.result&&Array.isArray(before.result))
const privateDirectory=path.join(RECOVERY_BASE,'production-cutover-private')
await mkdir(privateDirectory,{recursive:true})
await writeFile(path.join(privateDirectory,'pages-domains-before.json'),JSON.stringify(before,null,2))
const report={startedAt:new Date().toISOString(),deploymentId:deployment.deploymentId,domains:[]}
for(const name of ['www.jnqjourney.com','jnqjourney.com']){
  const existing=before.result.find(row=>row.name===name)
  const response=existing?{http:200,codes:[],result:existing}:await api('/domains',{method:'POST',body:JSON.stringify({name})})
  if(response.result)await writeFile(path.join(privateDirectory,'domain-'+name+'.json'),JSON.stringify(response.result,null,2))
  report.domains.push({name,http:response.http,codes:response.codes,created:!existing&&Boolean(response.result),
    status:response.result?.status??'NOT_CREATED',validationStatus:response.result?.validation_data?.status??null,
    verificationStatus:response.result?.verification_data?.status??null})
  if(response.http>=400)break
}
report.finishedAt=new Date().toISOString()
await writeFile(path.join(directory,'domain-bindings.json'),JSON.stringify(report,null,2))
console.log(JSON.stringify(report))
