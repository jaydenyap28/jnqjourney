import {readFile,writeFile} from 'node:fs/promises'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {createHash} from 'node:crypto'
import path from 'node:path'
import {cloudflareClient,PROJECT,BRANCH,BUCKET} from './candidate-cloudflare.mjs'
const run=promisify(execFile)
const report={project:PROJECT,branch:BRANCH,productionDeploymentCreated:false}
function check(project) {
  if(project.name!==PROJECT||project.production_branch!=='main'||project.canonical_deployment)throw new Error('PRODUCTION_BOUNDARY_FAILED')
  const prod=project.deployment_configs?.production,preview=project.deployment_configs?.preview
  if(prod?.fail_open!==false||preview?.fail_open!==false)throw new Error('FAIL_CLOSED_NOT_VERIFIED')
  if(Object.keys(prod.env_vars||{}).length||Object.keys(prod.r2_buckets||{}).length)throw new Error('PRODUCTION_BINDINGS_NOT_EMPTY')
  if(preview.r2_buckets?.TEST_MEDIA?.name!==BUCKET)throw new Error('ISOLATED_R2_BINDING_MISMATCH')
}
try {
  const cf=await cloudflareClient(),before=await cf();check(before)
  report.canonicalBefore=null;report.productionSecretsBefore=0;report.productionR2BindingsBefore=0
  const prodBefore=JSON.stringify(before.deployment_configs.production)
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
  const sourceHash=hash(await readFile('cloudflare/spot-loop/worker.mjs'))
  if(sourceHash!==hash(await readFile('artifacts/cloudflare-spot-loop/out/_worker.js')))throw new Error('PACKAGE_SOURCE_MISMATCH')
  report.workerSha256=sourceHash
  const commit=(await run('git',['rev-parse','HEAD'],{windowsHide:true})).stdout.trim()
  let deployed
  try {
    deployed=await run(process.execPath,[process.env.JNQ_WRANGLER_CLI,'pages','deploy',path.resolve('artifacts/cloudflare-spot-loop/out'),'--project-name',PROJECT,'--branch',BRANCH,'--commit-hash',commit,'--commit-dirty=true'],{cwd:path.resolve('artifacts/cloudflare-spot-loop'),windowsHide:true,maxBuffer:4*1024*1024})
  }catch(error){
    report.cliExitCode=error.code
    const raw=`${error.stderr||''}\n${error.stdout||''}`.replace(/\u001b\[[0-9;]*m/g,'')
    report.cliDiagnostic=raw.split('\n').filter(line=>/ERROR|Error|error:|cannot|Cannot|Unknown|unknown|Unsupported|not supported|Must|must|Missing|missing/.test(line)).slice(0,8).map(line=>line.replace(/eyJ[A-Za-z0-9_.-]+|sb_secret_[A-Za-z0-9_-]+|[A-Za-z0-9_-]{48,}/g,'[redacted]')).join('\n')
    throw new Error('PREVIEW_DEPLOY_COMMAND_FAILED')
  }
  // Report only known candidate URLs. Never dump deployment environment data.
  report.cliUrls=[...new Set(deployed.stdout.match(/https:\/\/[a-z0-9.-]+\.pages\.dev/g)||[])]
  const after=await cf();check(after)
  if(prodBefore!==JSON.stringify(after.deployment_configs.production))throw new Error('PRODUCTION_CONFIGURATION_CHANGED')
  const deployments=await cf('/deployments?env=preview')
  const deployment=deployments.find(item=>item.environment==='preview'&&item.deployment_trigger?.metadata?.branch===BRANCH&&item.latest_stage?.status==='success')
  if(!deployment)throw new Error('SUCCESSFUL_PREVIEW_NOT_FOUND')
  report.deploymentId=deployment.id;report.url=deployment.url;report.environment=deployment.environment
  report.canonicalAfter=null;report.productionSecretsAfter=0;report.productionR2BindingsAfter=0;report.failClosedBothEnvironments=true;report.success=true
}catch(error){report.error=/^[A-Z0-9_]+$/.test(error.message)?error.message:'PREVIEW_DEPLOY_CHECK_FAILED';if(error.candidateReason)report.reason=error.candidateReason}
const output=process.argv.includes('--upload-fix')?'artifacts/cloudflare-upload-fix/deployment.json':'artifacts/cloudflare-phase3/deployment.json'
await writeFile(output,JSON.stringify(report,null,2))
console.log(JSON.stringify(report,null,2))
if(report.error)process.exitCode=1
