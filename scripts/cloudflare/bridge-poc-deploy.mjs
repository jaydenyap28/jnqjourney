import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises'
import {createHash,randomBytes} from 'node:crypto'
import path from 'node:path'
import {cloudflareClient,privateWranglerToken,ACCOUNT,PROJECT,BUCKET} from './candidate-cloudflare.mjs'
const integration=process.argv[3]==='--media-integration'
const saveTrial=integration||process.argv[3]==='--save-trial'
const root=integration?'artifacts/cloudflare-media-integration/':saveTrial?'artifacts/cloudflare-edge-bridge-save/':'artifacts/cloudflare-bridge-poc/'
const BRANCH='codex/r2-identity-bridge',REF='rnamstwwbzknwbjwdgrf',NAME='jnq-registry-rm0-pilot'
const UI_BRANCH='codex/spot-media-integration'
const UI_ORIGIN='https://codex-spot-media-integration.jnqjourney-spot-loop-migration-candidate.pages.dev'
const privateFile=path.resolve('cloudflare/spot-loop/.dev.vars.identity-bridge'+(integration?'-media':saveTrial?'-save':''))
assert.deepEqual(process.argv.slice(2),integration?[REF,'--media-integration']:saveTrial?[REF,'--save-trial']:[REF])
const run=promisify(execFile),cli=process.env.JNQ_SUPABASE_CLI
assert.ok(cli&&process.env.JNQ_WRANGLER_CLI)
const bridgeRoot=integration?root+'bridge/':root
await mkdir(bridgeRoot+'out',{recursive:true})
const report={project:PROJECT,branch:BRANCH,projectRef:REF,environment:'preview',success:false,secretName:'CANDIDATE_IDENTITY_BRIDGE_KEY'}
const cf=await cloudflareClient()
function boundary(p){
  assert.equal(p.name,PROJECT)
  assert.equal(p.production_branch,'main')
  assert.ok(!p.canonical_deployment)
  assert.equal(Object.keys(p.deployment_configs.production.env_vars??{}).length,0)
  assert.equal(Object.keys(p.deployment_configs.production.r2_buckets??{}).length,0)
  assert.equal(p.deployment_configs.production.fail_open,false)
  assert.equal(p.deployment_configs.preview.fail_open,false)
  assert.equal(p.deployment_configs.preview.r2_buckets?.TEST_MEDIA?.name,BUCKET)
  assert.ok(!(p.domains??[]).some(d=>/(^|\.)jnqjourney\.com$/.test(d)))
}
try{
  const before=await cf();boundary(before)
  const prod=JSON.stringify(before.deployment_configs.production)
  assert.ok(!before.deployment_configs.preview.env_vars?.CANDIDATE_IDENTITY_BRIDGE_KEY)
  const listed=await cf('/deployments')
  assert.ok(listed.every(d=>d.environment==='preview'))
  report.existingDeploymentIds=listed.map(d=>d.id)
  const token=await privateWranglerToken()
  for(const suffix of ['managed','custom']){
    const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/domains/${suffix}`,{headers:{Authorization:`Bearer ${token}`},redirect:'manual'})
    const p=await r.json();assert.ok(r.ok&&p.success)
    if(suffix==='managed')assert.equal(p.result.enabled,false)
    else assert.equal(p.result.domains.length,0)
  }
  const secretList=await run(process.execPath,[cli,'secrets','list','--project-ref',REF,'--output','json'],{windowsHide:true,maxBuffer:1024*1024})
  const secretNames=JSON.parse(secretList.stdout).map(s=>s.name)
  assert.ok(!secretNames.includes('CANDIDATE_IDENTITY_BRIDGE_KEY'))
  await run('git',['check-ignore',privateFile],{windowsHide:true})
  const expires=Math.floor(Date.now()/1000)+1800,secret=randomBytes(32).toString('base64url')
  await writeFile(privateFile,'CANDIDATE_IDENTITY_BRIDGE_KEY='+secret+'\n',{flag:'wx',mode:0o600})
  report.expiresAt=expires
  await run(process.execPath,[cli,'secrets','set','--project-ref',REF,'--env-file',privateFile],{windowsHide:true,maxBuffer:1024*1024})
  await cf('',{method:'PATCH',body:JSON.stringify({deployment_configs:{preview:{env_vars:{CANDIDATE_IDENTITY_BRIDGE_KEY:{type:'secret_text',value:secret}}}}})})
  const provisioned=await cf();boundary(provisioned)
  assert.equal(JSON.stringify(provisioned.deployment_configs.production),prod)
  assert.equal(provisioned.deployment_configs.preview.env_vars.CANDIDATE_IDENTITY_BRIDGE_KEY.type,'secret_text')
  for(const [name,value] of Object.entries(before.deployment_configs.preview.env_vars??{}))assert.deepEqual(provisioned.deployment_configs.preview.env_vars[name],value)
  report.credentialProvisionedAutomatically=true
  report.productionUnchangedBeforeDeploy=true
  let worker=await readFile('cloudflare/spot-loop/identity-bridge/worker.mjs','utf8')
  worker=worker.replace("from '../media-identity.mjs'","from './media-identity.mjs'")
  await writeFile(bridgeRoot+'out/_worker.js',worker)
  await copyFile('cloudflare/spot-loop/media-identity.mjs',bridgeRoot+'out/media-identity.mjs')
  await copyFile('cloudflare/spot-loop/identity-bridge/auth.mjs',bridgeRoot+'out/auth.mjs')
  await writeFile(bridgeRoot+'out/snapshot.mjs',(await readFile('cloudflare/spot-loop/identity-bridge/snapshot.mjs','utf8')).replace("from '../media-identity.mjs'","from './media-identity.mjs'"))
  await writeFile(bridgeRoot+'out/index.html','<!doctype html><meta name="robots" content="noindex,nofollow"><title>Isolated metadata bridge</title>')
  await writeFile(bridgeRoot+'out/_routes.json',JSON.stringify({version:1,include:['/*'],exclude:[]}))
  await writeFile(bridgeRoot+'wrangler.jsonc',JSON.stringify({name:PROJECT,pages_build_output_dir:'./out',compatibility_date:'2026-11-08',vars:{BRIDGE_PROJECT_REF:REF,BRIDGE_BUCKET:BUCKET,...(saveTrial?{BRIDGE_FIXTURE_IDS:'92005,92017,92030'}:{BRIDGE_FIXTURE:'92005'}),BRIDGE_EXPIRES_AT:String(expires)},r2_buckets:[{binding:'TEST_MEDIA',bucket_name:BUCKET,preview_bucket_name:BUCKET}]},null,2))
  const commit=(await run('git',['rev-parse','HEAD'],{windowsHide:true})).stdout.trim()
  const deploy=async(directory,branch)=>run(process.execPath,[process.env.JNQ_WRANGLER_CLI,'pages','deploy',path.resolve(directory+'out'),'--project-name',PROJECT,'--branch',branch,'--commit-hash',commit,'--commit-dirty=true'],{cwd:path.resolve(directory),windowsHide:true,maxBuffer:4*1024*1024,timeout:120000})
  await deploy(bridgeRoot,BRANCH)
  const after=await cf();boundary(after)
  assert.equal(JSON.stringify(after.deployment_configs.production),prod)
  const deployments=await cf('/deployments')
  assert.ok(deployments.every(d=>d.environment==='preview'))
  const d=deployments.find(d=>d.deployment_trigger?.metadata?.branch===BRANCH&&!report.existingDeploymentIds.includes(d.id)&&d.latest_stage?.status==='success')
  assert.ok(d)
  Object.assign(report,{deploymentId:d.id,url:d.url,workerSha256:createHash('sha256').update(worker).digest('hex'),productionCanonicalEmpty:true,productionEnvironmentCount:0,productionR2Count:0,productionUnchanged:true})
  const actual=await cf('/deployments/'+d.id)
  assert.equal(actual.r2_buckets.TEST_MEDIA.name,BUCKET)
  assert.equal(actual.env_vars.CANDIDATE_IDENTITY_BRIDGE_KEY.type,'secret_text')
  const c=JSON.parse(await readFile('cloudflare/spot-loop/.dev.vars.spot-loop-session','utf8'))
  assert.equal(c.projectRef,REF)
  const media=JSON.parse(await readFile('cloudflare/spot-loop/evidence/registry-native-2026-11-09/media-setup.json'))
  const key=media.media.find(m=>m.registered&&m.spot===92005).key
  const work=path.resolve(root+'edge'),folder=work+'/supabase/functions/'+NAME
  await mkdir(folder,{recursive:true})
  await copyFile('cloudflare/spot-loop/edge-pilot/'+(saveTrial?'save-entry.ts':'bridge-probe.ts'),folder+'/index.ts')
  await copyFile('cloudflare/spot-loop/identity-bridge/auth.mjs',folder+'/bridge-auth.mjs')
  if(saveTrial){
    await writeFile(folder+'/save-handler.mjs',(await readFile('cloudflare/spot-loop/edge-pilot/save-handler.mjs','utf8')).replace("from '../identity-bridge/auth.mjs'","from './bridge-auth.mjs'").replace("from '../spot-contract.mjs'","from './spot-contract.mjs'"))
    await copyFile('cloudflare/spot-loop/spot-contract.mjs',folder+'/spot-contract.mjs')
  }
  await writeFile(folder+'/pilot-config.json',JSON.stringify({adminId:c.userId,adminEmail:c.email.toLowerCase(),key,expiresAt:expires,...(integration?{browserIntegration:true}:{})}))
  await writeFile(work+'/supabase/config.toml',`project_id="jnq-bridge-poc-local"\n[functions.${NAME}]\nverify_jwt=true\nentrypoint="./functions/${NAME}/index.ts"\n`)
  await run(process.execPath,[cli,'functions','deploy',NAME,'--project-ref',REF,'--workdir',work,'--use-api','--yes'],{windowsHide:true,maxBuffer:4*1024*1024,timeout:120000})
  const functions=JSON.parse((await run(process.execPath,[cli,'functions','list','--project-ref',REF,'--output','json'],{windowsHide:true,maxBuffer:1024*1024})).stdout)
  const edge=functions.find(f=>f.slug===NAME)
  assert.ok(edge?.verify_jwt)
  report.edge={name:NAME,id:edge.id,version:edge.version,verifyJwt:true}
  if(integration){
    assert.equal(createHash('sha256').update((await readFile('cloudflare/spot-loop/review/trusted-media-registry.draft.sql','utf8')).replaceAll('\r\n','\n')).digest('hex'),'b221473d7f08dd28bcee736928b7e34b1a16f3191723f5decd025709972008f1')
    const vars={ENVIRONMENT:'isolated-candidate',CANDIDATE_SUPABASE_REF:REF,SUPABASE_URL:`https://${REF}.supabase.co`,ADMIN_EMAILS:c.email,
      CANDIDATE_SPOTS:JSON.stringify({92017:'cloudflare-loop-registry-92017',92030:'cloudflare-loop-registry-92030'}),CANDIDATE_MEDIA_REGISTRY:'true',
      CANDIDATE_NATIVE_METRICS:'true',CANDIDATE_WRITES_ENABLED:'true',CANDIDATE_EDGE_SAVE:'true',CANDIDATE_MEDIA_EXPIRES_AT:String(expires)}
    const cfg={name:PROJECT,pages_build_output_dir:'./out',compatibility_date:'2026-11-08',vars,r2_buckets:[{binding:'TEST_MEDIA',bucket_name:BUCKET,preview_bucket_name:BUCKET}]}
    await writeFile(root+'wrangler.jsonc',JSON.stringify(cfg,null,2))
    await deploy(root,UI_BRANCH)
    const ui=(await cf('/deployments')).find(item=>item.environment==='preview'&&item.deployment_trigger?.metadata?.branch===UI_BRANCH&&item.latest_stage?.status==='success'&&!report.existingDeploymentIds.includes(item.id))
    assert.ok(ui?.aliases?.includes(UI_ORIGIN))
    const uiActual=await cf('/deployments/'+ui.id)
    assert.equal(uiActual.r2_buckets?.TEST_MEDIA?.name,BUCKET)
    for(const key of Object.keys(vars))assert.equal(uiActual.env_vars[key].value,vars[key])
    for(const key of ['SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','CANDIDATE_R2_ACCESS_KEY_ID','CANDIDATE_R2_SECRET_ACCESS_KEY'])assert.equal(uiActual.env_vars[key].type,'secret_text')
    const final=await cf();boundary(final);assert.equal(JSON.stringify(final.deployment_configs.production),prod)
    report.ui={deploymentId:ui.id,environment:'preview',origin:UI_ORIGIN,fixtureIds:[92017,92030],success:true}
    report.mediaIntegration=true
  }
  report.saveTrial=saveTrial
  report.success=true
}catch(error){report.error='BRIDGE_PROVISION_OR_DEPLOY_FAILED';report.exitCode=typeof error.code==='number'?error.code:null;process.exitCode=1}
await writeFile(root+'deployment.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify(report,null,2))
