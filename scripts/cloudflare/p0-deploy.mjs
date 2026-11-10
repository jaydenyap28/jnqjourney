import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {randomUUID,createHash} from 'node:crypto'
import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {ACCOUNT,BUCKET,PROJECT,cloudflareClient,privateWranglerToken} from './candidate-cloudflare.mjs'
import {isolatedKeys,isolatedRequest,ISOLATED_ORIGIN} from './isolated-supabase.mjs'
import {GATE_ORIGIN,FAULT_ORIGIN} from '../../cloudflare/spot-loop/publication-gate.mjs'
const root='artifacts/cloudflare-p0-cutover/'
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const report={startedAt:new Date().toISOString(),project:PROJECT,environment:'preview',success:false}
const run=promisify(execFile)
await mkdir(root+'out',{recursive:true})
const cf=await cloudflareClient(),token=await privateWranglerToken(),keys=await isolatedKeys()
function boundary(project){
  assert.ok(project.name===PROJECT&&project.production_branch==='main'&&!project.canonical_deployment)
  const {production,preview}=project.deployment_configs
  assert.ok(!Object.keys(production.env_vars||{}).length&&!Object.keys(production.r2_buckets||{}).length)
  assert.ok(production.fail_open===false&&preview.fail_open===false&&preview.r2_buckets?.TEST_MEDIA?.name===BUCKET)
  assert.ok((project.domains||[]).every(domain=>domain===PROJECT+'.pages.dev'))
  return production
}
async function r2(key,bytes,mime){
  assert.match(key,/^(?:media\/candidate|_candidate-validation)\/920(?:05|17)\/[a-f0-9-]{36}\.webp(?:\.json)?$/)
  const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects/${key}`,{
    method:bytes?'PUT':'GET',body:bytes,headers:{Authorization:'Bearer '+token,...(mime?{'Content-Type':mime}:{})},redirect:'error',signal:AbortSignal.timeout(15000),
  })
  assert.ok(response.ok,'ISOLATED_R2_IMPORT_FAILED')
  if(bytes){const payload=await response.json();assert.ok(payload.success);return {...payload.result,size:bytes.length}}
  return {bytes:Buffer.from(await response.arrayBuffer()),mime:response.headers.get('content-type'),etag:response.headers.get('etag')?.replace(/^W\//,'').replaceAll('"','')}
}
async function verifiedPut(key,bytes,mime){
  const result=await r2(key,bytes,mime),readback=await r2(key)
  assert.ok(result.key===key&&result.version&&result.etag===readback.etag&&readback.mime===mime&&bytes.equals(readback.bytes))
  return result
}
try{
  const before=await cf(),production=boundary(before)
  const prior=JSON.parse(await readFile('cloudflare/spot-loop/evidence/public-readiness-2026-11-10/deployment.json'))
  assert.ok(prior.bucket===BUCKET&&prior.fixture===92017&&prior.identity?.mime==='image/webp')
  const original=await r2(prior.key)
  assert.ok(hash(original.bytes)===prior.sha256&&original.mime==='image/webp'&&original.bytes.toString('ascii',0,4)==='RIFF'&&original.bytes.toString('ascii',8,12)==='WEBP')
  const key='media/candidate/92005/'+randomUUID()+'.webp'
  const receiptKey='_candidate-validation/'+key.slice('media/candidate/'.length)+'.json'
  report.media={key,receiptKey,bytes:original.bytes.length,sha256:hash(original.bytes),source:prior.sourceUrl}
  await writeFile(root+'import-checkpoint.json',JSON.stringify(report,null,2),{flag:'wx'})
  const object=await verifiedPut(key,original.bytes,'image/webp')
  const proof={schemaVersion:1,key,fixtureId:'92005',size:object.size,etag:object.etag,version:object.version,contentType:'image/webp',signatureChecked:true}
  const receipt=await verifiedPut(receiptKey,Buffer.from(JSON.stringify(proof)),'application/json')
  const identity={key,size:object.size,mime:'image/webp',etag:object.etag,version:object.version,receipt_size:receipt.size,receipt_etag:receipt.etag,receipt_version:receipt.version}
  const response=await isolatedRequest(keys,'/rest/v1/rpc/jnq_media_register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_spot:92005,p_can_insert:true,...Object.fromEntries(Object.entries(identity).map(([name,value])=>['p_'+name,value]))})})
  assert.ok(response.ok&&await response.json()===true,'ISOLATED_IMPORT_REGISTRATION_UNCONFIRMED')
  report.media.identity=identity
  const frozen=hash((await readFile('cloudflare/spot-loop/review/trusted-media-registry.draft.sql','utf8')).replaceAll('\r\n','\n'))
  assert.equal(frozen,'b221473d7f08dd28bcee736928b7e34b1a16f3191723f5decd025709972008f1')
  report.registrySqlSha256=frozen
  for(const [from,to] of [['publication-gate.mjs','_worker.js'],['worker.mjs','worker.mjs'],['legacy-media-preview.mjs','legacy-media-preview.mjs'],['spot-contract.mjs','spot-contract.mjs'],['media-identity.mjs','media-identity.mjs'],['candidate.css','candidate.css']])await copyFile('cloudflare/spot-loop/'+from,root+'out/'+to)
  await writeFile(root+'out/_routes.json',JSON.stringify({version:1,include:['/*'],exclude:[]}))
  await writeFile(root+'out/index.html','<!doctype html><meta name="robots" content="noindex"><title>Live publication gate</title>')
  const expires=Math.floor(Date.now()/1000)+1800
  const commit=(await run('git',['rev-parse','HEAD'],{windowsHide:true})).stdout.trim()
  for(const fault of [false,true]){
    const branch=fault?'codex/p0-source-fault':'codex/p0-publication-gate'
    const origin=fault?FAULT_ORIGIN:GATE_ORIGIN
    const ids=new Set((await cf('/deployments')).map(item=>item.id))
    const vars={SUPABASE_URL:ISOLATED_ORIGIN,P0_MEDIA_KEY:key,P0_EXPIRES_AT:String(expires),...(fault?{P0_SOURCE_FAULT:'true'}:{})}
    await writeFile(root+'wrangler.jsonc',JSON.stringify({name:PROJECT,pages_build_output_dir:'./out',compatibility_date:'2026-11-08',vars,r2_buckets:[{binding:'TEST_MEDIA',bucket_name:BUCKET,preview_bucket_name:BUCKET}]},null,2))
    await run(process.execPath,[process.env.JNQ_WRANGLER_CLI,'pages','deploy',path.resolve(root+'out'),'--project-name',PROJECT,'--branch',branch,'--commit-hash',commit,'--commit-dirty=true'],{cwd:path.resolve(root),windowsHide:true,maxBuffer:4*1024*1024,timeout:120000})
    const deployment=(await cf('/deployments')).find(item=>!ids.has(item.id)&&item.environment==='preview'&&item.deployment_trigger?.metadata?.branch===branch&&item.latest_stage?.status==='success')
    assert.ok(deployment?.aliases?.includes(origin))
    const actual=await cf('/deployments/'+deployment.id)
    assert.equal(actual.r2_buckets?.TEST_MEDIA?.name,BUCKET)
    for(const [name,value] of Object.entries(vars))assert.equal(actual.env_vars[name].value,value)
    assert.equal(actual.env_vars.SUPABASE_SERVICE_ROLE_KEY.type,'secret_text')
    report[fault?'fault':'gate']={deploymentId:deployment.id,origin,branch,environment:'preview',success:true,sourceUnavailable:fault,expiresAt:expires}
    assert.deepEqual(boundary(await cf()),production)
  }
  report.success=true;report.productionUnchanged=true
}catch(error){
  report.error=/^[A-Z_0-9]+$/.test(error.message)?error.message:'P0_ISOLATED_DEPLOY_FAILED'
  process.exitCode=1
}
report.finishedAt=new Date().toISOString()
await writeFile(root+'deployment.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify(report,null,2))
