import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ACCOUNT, privateWranglerToken } from './candidate-cloudflare.mjs'
import { RECOVERY, PROJECT, BRANCH, fingerprint } from './recovery-sources.mjs'
import { FINAL_DIR } from './recovery-media-inventory-final.mjs'
import { readMediaApproval } from './recovery-media-release-gate.mjs'

const run=promisify(execFile)
export async function deployRecoveryPreview() {
  assert.equal((await run('git',['branch','--show-current'],{windowsHide:true})).stdout.trim(),BRANCH,'WRONG_STATIC_RECOVERY_GIT_BRANCH')
  const verified=JSON.parse(await readFile(path.join(RECOVERY,'verification.json'),'utf8'))
  assert.ok(verified.passed&&verified.functions===0&&verified.files<=20000)
  const expected=JSON.parse(await readFile(path.join(RECOVERY,'deploy/_publication.json'),'utf8'))
  if(expected.mediaInventorySha256){
    const media=JSON.parse(await readFile(path.join(RECOVERY,'media-approval-gate.json'),'utf8'))
    const inventory=JSON.parse(await readFile(path.join(FINAL_DIR,'inventory.private.json'),'utf8'))
    const {approval:current}=await readMediaApproval(inventory)
    assert.ok(media.finalPackageVerified&&media.inventorySha256===expected.mediaInventorySha256
      &&media.approvalFingerprint===expected.mediaApprovalFingerprint&&media.approvalFingerprint===fingerprint(current),'FINAL_MEDIA_PACKAGE_NOT_VERIFIED')
  }
  const token=await privateWranglerToken()
  const endpoint=`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/pages/projects`
  async function api(suffix,options={}) {
    const response=await fetch(endpoint+suffix,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},redirect:'manual',signal:AbortSignal.timeout(20000)})
    const data=await response.json()
    if(response.status===404)return null
    assert.ok(response.ok&&data.success,`STATIC_PAGES_API_${response.status}_${data.errors?.[0]?.code||'UNKNOWN'}`)
    return data.result
  }
  let project=await api('/'+PROJECT)
  if(!project)project=await api('',{method:'POST',body:JSON.stringify({name:PROJECT,production_branch:'main'})})
  function boundary(value) {
    assert.equal(value.name,PROJECT)
    assert.equal(value.production_branch,'main')
    assert.ok(!value.canonical_deployment,'PRODUCTION_CANONICAL_MUST_BE_EMPTY')
    assert.ok(!value.source,'STATIC_PROJECT_MUST_NOT_HAVE_GIT_AUTODEPLOY')
    assert.ok((value.domains||[]).every(domain=>domain===PROJECT+'.pages.dev'),'CUSTOM_DOMAIN_OUT_OF_SCOPE')
    for(const config of Object.values(value.deployment_configs||{})) {
      for(const key of ['env_vars','r2_buckets','kv_namespaces','d1_databases','services','durable_object_namespaces'])assert.equal(Object.keys(config[key]||{}).length,0,'STATIC_PROJECT_BINDING_'+key)
    }
    return {productionCanonicalEmpty:true,noSecretsOrBindings:true,noCustomDomain:true,noGitAutodeploy:true}
  }
  const report={startedAt:new Date().toISOString(),project:PROJECT,environment:'preview',branch:BRANCH,before:boundary(project),success:false,functions:0}
  const journal=path.join(RECOVERY,'deployment.json')
  await writeFile(journal,JSON.stringify(report,null,2),{flag:'wx'})
  const previous=await api('/'+PROJECT+'/deployments')
  assert.ok(previous.every(item=>item.environment!=='production'),'PRODUCTION_DEPLOYMENT_PRESENT')
  const previousIds=new Set(previous.map(item=>item.id))
  await writeFile(path.join(RECOVERY,'wrangler.jsonc'),JSON.stringify({name:PROJECT,pages_build_output_dir:'./deploy'},null,2))
  const commit=(await run('git',['rev-parse','HEAD'],{windowsHide:true})).stdout.trim()
  Object.assign(report,{commit,preexistingDeploymentIds:[...previousIds]})
  await writeFile(journal,JSON.stringify(report,null,2))
  try {
    const result=await run(process.execPath,[process.env.JNQ_WRANGLER_CLI,'pages','deploy',path.join(RECOVERY,'deploy'),'--project-name',PROJECT,'--branch',BRANCH,'--commit-hash',commit,'--commit-dirty=true'],
      {cwd:RECOVERY,windowsHide:true,timeout:expected.mediaInventorySha256?45*60_000:180_000,maxBuffer:4*1024*1024,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:ACCOUNT,WRANGLER_SEND_METRICS:'false'}})
    const log=(result.stdout+'\n'+result.stderr).replaceAll(token,'[redacted]')
    await writeFile(path.join(RECOVERY,'deploy.log'),log)
    assert.ok(!/Uploading (?:Worker|Functions)|Compiled Worker|worker bundle/i.test(log),'UNEXPECTED_FUNCTION_UPLOAD')
    const deployments=await api('/'+PROJECT+'/deployments')
    assert.ok(deployments.every(item=>item.environment!=='production'),'PRODUCTION_DEPLOYMENT_PRESENT')
    const fresh=deployments.find(item=>!previousIds.has(item.id)&&item.environment==='preview'&&item.deployment_trigger?.metadata?.branch===BRANCH)
    assert.ok(fresh?.latest_stage?.status==='success','PREVIEW_DEPLOY_NOT_CONFIRMED')
    assert.match(fresh.url,new RegExp('^https://[a-z0-9-]+\\.'+PROJECT.replaceAll('-','\\-')+'\\.pages\\.dev$'))
    Object.assign(report,{deploymentId:fresh.id,url:fresh.url,commit,after:boundary(await api('/'+PROJECT)),workerUpload:false})
    const receipt=await fetch(fresh.url+'/_publication.json',{cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(20000)})
    assert.equal(receipt.status,200)
    assert.match(receipt.headers.get('x-robots-tag')||'',/noindex/)
    assert.equal(receipt.headers.get('x-jnq-hosting'),'static-recovery-preview')
    assert.deepEqual(await receipt.json(),expected,'DEPLOYMENT_CONTENT_RECEIPT_MISMATCH')
    if(expected.mediaApprovalFingerprint)report.mediaApprovalFingerprint=expected.mediaApprovalFingerprint
    report.publicationReceiptMatched=true
    report.success=true
  } catch(error) {
    report.failure={reason:String(error.message).split('\n')[0].replaceAll(token,'[redacted]').slice(0,180),deploymentResult:'VERIFY_BEFORE_RETRY'}
    throw Error(report.failure.reason)
  } finally {
    report.finishedAt=new Date().toISOString()
    await writeFile(journal,JSON.stringify(report,null,2))
  }
  console.log(JSON.stringify(report))
  return report
}
export async function verifyExistingPreview() {
  // Recovery is read-only: never upload again after an ambiguous receipt read.
  const journal=path.join(RECOVERY,'deployment.json')
  const report=JSON.parse(await readFile(journal,'utf8'))
  assert.ok(report.project===PROJECT&&report.environment==='preview'&&report.branch===BRANCH)
  const token=await privateWranglerToken()
  const base=`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/pages/projects/${PROJECT}`
  async function get(suffix='') {
    const response=await fetch(base+suffix,{headers:{Authorization:`Bearer ${token}`},redirect:'manual',signal:AbortSignal.timeout(20000)})
    const data=await response.json()
    assert.ok(response.ok&&data.success,'PREVIEW_READ_ONLY_CHECK_FAILED')
    return data.result
  }
  const [project,all]=await Promise.all([get(),get('/deployments')])
  if(!report.deploymentId){
    assert.ok(report.commit&&Array.isArray(report.preexistingDeploymentIds),'DEPLOYMENT_ATTEMPT_RECEIPT_INCOMPLETE')
    const before=new Set(report.preexistingDeploymentIds)
    const candidates=all.filter(item=>!before.has(item.id)&&item.environment==='preview'&&item.uses_functions===false
      &&item.deployment_trigger?.metadata?.branch===BRANCH&&item.deployment_trigger?.metadata?.commit_hash===report.commit
      &&Date.parse(item.created_on)>=Date.parse(report.startedAt)-5_000)
    assert.equal(candidates.length,1,'UNCONFIRMED_UPLOAD_REQUIRES_MANUAL_RECONCILIATION')
    Object.assign(report,{deploymentId:candidates[0].id,url:candidates[0].url})
  }
  assert.match(report.deploymentId,/^[a-f0-9-]{36}$/)
  const deployment=await get('/deployments/'+report.deploymentId)
  assert.equal(deployment.environment,'preview')
  assert.equal(deployment.url,report.url)
  const deploymentUrl=new URL(deployment.url)
  assert.equal(deploymentUrl.protocol,'https:')
  assert.ok(deploymentUrl.hostname.endsWith('.'+PROJECT+'.pages.dev'))
  assert.equal(deployment.latest_stage.status,'success')
  assert.ok(!project.canonical_deployment&&!project.source)
  assert.equal(project.production_branch,'main')
  assert.ok((project.domains||[]).every(domain=>domain===PROJECT+'.pages.dev'))
  assert.ok(all.every(item=>item.environment!=='production'))
  for(const config of Object.values(project.deployment_configs||{}))for(const key of ['env_vars','r2_buckets','kv_namespaces','d1_databases','services','durable_object_namespaces'])assert.equal(Object.keys(config[key]||{}).length,0)
  const receipt=await fetch(report.url+'/_publication.json',{cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(20000)})
  assert.equal(receipt.status,200)
  assert.match(receipt.headers.get('x-robots-tag')||'',/noindex/)
  assert.equal(receipt.headers.get('x-jnq-hosting'),'static-recovery-preview')
  const expected=JSON.parse(await readFile(path.join(RECOVERY,'deploy/_publication.json'),'utf8'))
  assert.deepEqual(await receipt.json(),expected)
  if(expected.mediaApprovalFingerprint)report.mediaApprovalFingerprint=expected.mediaApprovalFingerprint
  report.recovery={checkedAt:new Date().toISOString(),readOnly:true,previousFailurePreserved:report.failure,productionDeployments:0,canonicalEmpty:true,receiptMatched:true}
  report.success=true
  await writeFile(journal,JSON.stringify(report,null,2))
  console.log(JSON.stringify({url:report.url,success:true,readOnlyRecovery:true}))
}
if(process.argv[1]?.endsWith('recovery-deploy.mjs')) {
  if(process.argv.includes('--verify-existing'))await verifyExistingPreview()
  else await deployRecoveryPreview()
}
