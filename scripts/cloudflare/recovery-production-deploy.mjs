import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {ACCOUNT,privateWranglerToken} from './candidate-cloudflare.mjs'
import {PROJECT,RECOVERY_BASE} from './recovery-sources.mjs'

assert.deepEqual(process.argv.slice(2),['--approved-production-recovery'])
const run=promisify(execFile)
const directory=path.join(RECOVERY_BASE,'runs/production-20261111')
const manifest=JSON.parse(await readFile(path.join(directory,'production-package.json'),'utf8'))
assert.ok(manifest.productionPackage&&manifest.passed&&manifest.functions===0&&manifest.files<=20_000
  &&manifest.acceptedPreviewId==='368a3f26-1e0b-42c0-8c90-f38caa2cf84e')
const token=await privateWranglerToken()
const endpoint='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+'/pages/projects/'+PROJECT
async function get(suffix=''){
  const r=await fetch(endpoint+suffix,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(20000)})
  const p=await r.json()
  assert.ok(r.ok&&p.success,`PRODUCTION_PAGES_HTTP_${r.status}_${p.errors?.[0]?.code??'UNKNOWN'}`)
  return p.result
}
const project=await get()
assert.equal(project.name,PROJECT)
assert.ok(typeof project.production_branch==='string'&&project.production_branch
  &&project.production_branch!=='codex/cloudflare-static-recovery'&&!project.canonical_deployment&&!project.source,'FIRST_PRODUCTION_PREFLIGHT_FAILED')
for(const config of Object.values(project.deployment_configs??{})){
  for(const key of ['env_vars','r2_buckets','kv_namespaces','d1_databases','services','durable_object_namespaces']){
    assert.equal(Object.keys(config[key]??{}).length,0,'UNEXPECTED_RUNTIME_BINDING')
  }
}
const headers=await readFile(path.join(directory,'deploy/_headers'),'utf8')
assert.ok(headers.startsWith('/*\n  Cache-Control:')&&!headers.startsWith('/*\n  X-Robots-Tag:'))
assert.ok(!(await readFile(path.join(directory,'deploy/robots.txt'),'utf8')).includes('Disallow: /\n'))
const before=await get('/deployments')
assert.ok(before.every(row=>row.environment==='preview'),'PRODUCTION_ALREADY_EXISTS_RECONCILE')
const old=new Set(before.map(row=>row.id))
const report={startedAt:new Date().toISOString(),project:PROJECT,environment:'production',productionBranch:project.production_branch,
  sourceBranch:'codex/cloudflare-static-recovery',sourceCommit:(await run('git',['rev-parse','HEAD'],{windowsHide:true})).stdout.trim(),
  preexistingDeploymentIds:[...old],success:false,functions:0}
const journal=path.join(directory,'production-deployment.json')
await writeFile(journal,JSON.stringify(report,null,2),{flag:'wx'})
try{
  const r=await run(process.execPath,[process.env.JNQ_WRANGLER_CLI,'pages','deploy',path.join(directory,'deploy'),
    '--project-name',PROJECT,'--branch',project.production_branch,'--commit-hash',report.sourceCommit,'--commit-dirty=true'],{
    cwd:directory,windowsHide:true,timeout:30*60_000,maxBuffer:4*1024*1024,
    env:{...process.env,CLOUDFLARE_ACCOUNT_ID:ACCOUNT,WRANGLER_SEND_METRICS:'false'},
  })
  const log=(r.stdout+'\n'+r.stderr).replaceAll(token,'[redacted]')
  await writeFile(path.join(directory,'production-upload.log'),log)
  assert.ok(!/Uploading (?:Worker|Functions)|Compiled Worker|worker bundle/i.test(log),'UNEXPECTED_FUNCTION_UPLOAD')
  const deployments=await get('/deployments')
  const fresh=deployments.filter(row=>!old.has(row.id)&&row.environment==='production'&&row.deployment_trigger?.metadata?.branch===project.production_branch)
  assert.equal(fresh.length,1,'PRODUCTION_OUTCOME_REQUIRES_RECONCILIATION')
  const [deployment]=fresh
  assert.ok(deployment.latest_stage?.status==='success'&&deployment.uses_functions===false)
  const latest=await get()
  assert.equal(latest.canonical_deployment?.id,deployment.id)
  Object.assign(report,{deploymentId:deployment.id,fixedUrl:deployment.url,url:'https://'+PROJECT+'.pages.dev',usesFunctions:false})
  const response=await fetch(report.url+'/_publication.json',{redirect:'error',signal:AbortSignal.timeout(20000)})
  assert.equal(response.status,200)
  assert.ok(!/noindex/.test(response.headers.get('x-robots-tag')??''))
  const expected=JSON.parse(await readFile(path.join(directory,'deploy/_publication.json'),'utf8'))
  assert.deepEqual(await response.json(),expected,'PRODUCTION_PUBLICATION_RECEIPT_MISMATCH')
  report.success=true
}catch(error){
  report.failure=String(error.message).split('\n')[0].replaceAll(token,'[redacted]').slice(0,240)
  report.reconcileBeforeRetry=true
  process.exitCode=1
}finally{
  report.finishedAt=new Date().toISOString()
  await writeFile(journal,JSON.stringify(report,null,2))
}
console.log(JSON.stringify(report))
