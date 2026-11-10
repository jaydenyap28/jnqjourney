import assert from 'node:assert/strict'
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import path from 'node:path'
import {ACCOUNT,PROJECT,BUCKET,cloudflareClient,privateWranglerToken} from './candidate-cloudflare.mjs'
import {ISOLATED_ORIGIN,isolatedKeys,isolatedRequest} from './isolated-supabase.mjs'
import {createMediaPreparer} from './edge-bridge-media.mjs'
import {CONSUMER_ORIGIN} from '../../cloudflare/spot-loop/consumer-gateway.mjs'
import {controlledMediaValue} from '../../lib/controlled-media.ts'
const root='artifacts/cloudflare-p0-consumers/'
const ids=[92061,92062]
const resume=process.argv.includes('--resume-enrollment')
const report={startedAt:new Date().toISOString(),success:false,environment:'preview',origin:CONSUMER_ORIGIN,fixtures:ids,formalWrites:0,newSecrets:0}
const run=promisify(execFile)
await mkdir(root+'out',{recursive:true})
if(resume){
  const failed=JSON.parse(await readFile(root+'deployment.json','utf8'))
  assert.ok(!failed.success&&['REGISTRATION_NOT_CONFIRMED','OPERATOR_ENROLLMENT_REQUIRED'].includes(failed.error)&&failed.fixturesCreated)
  report.priorSetupError=failed.error
}else await writeFile(root+'setup-checkpoint.json',JSON.stringify(report),{flag:'wx'})
const cf=await cloudflareClient(),token=await privateWranglerToken(),keys=await isolatedKeys()
function boundary(project){
  assert.equal(project.name,PROJECT);assert.equal(project.production_branch,'main');assert.ok(!project.canonical_deployment)
  const {production,preview}=project.deployment_configs
  assert.deepEqual(Object.keys(production.env_vars||{}),[]);assert.deepEqual(Object.keys(production.r2_buckets||{}),[])
  assert.equal(production.fail_open,false);assert.equal(preview.fail_open,false);assert.equal(preview.r2_buckets.TEST_MEDIA.name,BUCKET)
  assert.ok(Object.values(preview.env_vars).filter(entry=>entry.type==='secret_text').length>=4)
  return production
}
async function read(resource){const response=await isolatedRequest(keys,resource);assert.ok(response.ok,'ISOLATED_SOURCE_UNAVAILABLE');return response.json()}
async function put(key,value){
  assert.ok(key.startsWith(report.feedPrefix));const bytes=Buffer.from(JSON.stringify(value))
  assert.ok(bytes.length>0&&bytes.length<=4194304)
  const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects/${key}`,{method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:bytes,redirect:'manual',signal:AbortSignal.timeout(15000)})
  const result=await response.json();assert.ok(response.ok&&result.success,'ISOLATED_FEED_PUT_FAILED')
  report.feeds.push({key,bytes:bytes.length,version:result.result.version,etag:result.result.etag})
}
try{
  const before=await cf(),production=boundary(before)
  const deployments=await cf('/deployments')
  assert.ok(deployments.every(item=>item.environment==='preview'))
  for(const suffix of ['domains/managed','domains/custom']){
    const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/${suffix}`,{headers:{Authorization:'Bearer '+token},redirect:'manual'})
    const payload=await response.json();assert.ok(response.ok&&payload.success)
    if(suffix.endsWith('managed'))assert.equal(payload.result.enabled,false)
    else assert.equal(payload.result.domains.length,0)
  }
  const older=[]
  const frozen=JSON.parse(await readFile('cloudflare/spot-loop/evidence/media-registry-ddl-approval-2026-11-09.json','utf8')).cloudflare.deploymentSnapshots
  for(const snapshot of frozen){
    const deployment=deployments.find(entry=>entry.id.startsWith(snapshot.idPrefix))
    assert.ok(deployment,'FIXED_PREVIEW_NOT_FOUND')
    const actual=await cf('/deployments/'+deployment.id)
    const allow=JSON.parse(actual.env_vars?.CANDIDATE_SPOTS?.value||'null')
    assert.ok(allow&&typeof allow==='object'&&!Array.isArray(allow)&&!ids.some(id=>Object.hasOwn(allow,String(id))),'OLD_PREVIEW_ALLOWLIST_UNVERIFIED')
    assert.equal(actual.env_vars.SUPABASE_URL.value,ISOLATED_ORIGIN)
    assert.equal(actual.r2_buckets.TEST_MEDIA.name,BUCKET)
    older.push({id:deployment.id,allowlist:Object.keys(allow)})
  }
  report.olderAllowlistChecks=older
  const existing=await read('/rest/v1/locations?select=id,name,status,publication_status,updated_at&id=in.(92061,92062)')
  if(resume)assert.ok(existing.length===2&&existing.every(row=>ids.includes(row.id)&&row.name==='Consumer Fixture '+row.id&&row.status==='active'&&row.publication_status==='hidden'&&row.updated_at===null),'FIXTURE_CHANGED')
  else assert.deepEqual(existing,[],'FIXTURE_ID_OCCUPIED')
  const regions=await read('/rest/v1/regions?select=id,name,name_cn,country,description,image_url,parent_id,code&order=id.asc&limit=200')
  const regionId=regions[0]?.id??null
  const fixtures=ids.map(id=>({id,name:'Consumer Fixture '+id,name_cn:'隔离读取样本 '+id,category:'attraction',latitude:5.33,longitude:103.14,region_id:regionId,status:'active',publication_status:'hidden',description:'Synthetic consumer read verification only.',images:[],image_url:null,image_metadata:{},updated_at:null}))
  if(!resume){
    const inserted=await isolatedRequest(keys,'/rest/v1/locations',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(fixtures)})
    assert.equal(inserted.status,201)
  }
  report.fixturesCreated=true
  if(!resume)throw Error('OPERATOR_ENROLLMENT_REQUIRED')
  const mediaRoot=resume?root+'after-enrollment/':root
  await mkdir(mediaRoot,{recursive:true})
  const preparer=await createMediaPreparer({root:mediaRoot,keys,token,fixtureIds:ids})
  const [mediaPath]=await preparer.prepare(92061,1)
  const identity=preparer.report.media[0]
  const save=await isolatedRequest(keys,'/rest/v1/rpc/jnq_media_save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_spot:92061,p_expected_updated_at:null,p_patch:{publication_status:null,image_url:mediaPath,images:[mediaPath]},p_observed:[{key:identity.key,size:identity.size,mime:'image/png',etag:identity.etag,version:identity.version,receipt_size:identity.receiptSize,receipt_etag:identity.receiptEtag,receipt_version:identity.receiptVersion}]})})
  assert.ok(save.ok,'SYNTHETIC_PUBLICATION_FAILED');report.fixtureVersion=(await save.json()).updated_at;report.mediaPath=mediaPath
  report.feedPrefix='candidate-consumers/'+Date.now()+'/'
  report.feeds=[]
  const load=async file=>JSON.parse(await readFile(file,'utf8'))
  const base='artifacts/cloudflare-public-readiness/sources/'
  const guide=await load(base+'guides.json'),note=await load(base+'notes.json')
  assert.equal(guide.guides.length,7);assert.equal(note.notes.length,6);assert.ok(note.notes.every(item=>item.published))
  const english=await load(base+'english.json')
  english.records=english.records.filter(record=>record.entityType!=='spot'||ids.includes(Number(record.entityId)))
  for(const [key,value] of Object.entries({'regions.json':{schemaVersion:1,regions},'guides.json':guide,'notes.json':note,'i18n/en/records.json':english,'guide-trip-costs.json':await load('public-data/guide-trip-costs.json')}))await put(report.feedPrefix+key,controlledMediaValue(value))
  for(const [from,to]of [['consumer-gateway.mjs','_worker.js'],['publication-gate.mjs','publication-gate.mjs'],['worker.mjs','worker.mjs'],['legacy-media-preview.mjs','legacy-media-preview.mjs'],['spot-contract.mjs','spot-contract.mjs'],['media-identity.mjs','media-identity.mjs']])await copyFile('cloudflare/spot-loop/'+from,root+'out/'+to)
  await writeFile(root+'out/index.html','<!doctype html><meta name="robots" content="noindex"><title>Isolated consumer API</title>')
  await writeFile(root+'out/_routes.json',JSON.stringify({version:1,include:['/*'],exclude:[]}))
  report.expiresAt=Math.floor(Date.now()/1000)+7200
  const vars={SUPABASE_URL:ISOLATED_ORIGIN,CONSUMER_FEED_PREFIX:report.feedPrefix,CONSUMER_EXPIRES_AT:String(report.expiresAt)}
  await writeFile(root+'wrangler.jsonc',JSON.stringify({name:PROJECT,pages_build_output_dir:'./out',compatibility_date:'2026-11-08',vars,r2_buckets:[{binding:'TEST_MEDIA',bucket_name:BUCKET,preview_bucket_name:BUCKET}]}))
  const oldIds=new Set(deployments.map(item=>item.id)),branch='codex/p0-consumers'
  const commit=(await run('git',['rev-parse','HEAD'],{windowsHide:true})).stdout.trim()
  await run(process.execPath,[process.env.JNQ_WRANGLER_CLI,'pages','deploy',path.resolve(root+'out'),'--project-name',PROJECT,'--branch',branch,'--commit-hash',commit,'--commit-dirty=true'],{cwd:path.resolve(root),windowsHide:true,maxBuffer:4*1024*1024,timeout:120000})
  const deployment=(await cf('/deployments')).find(item=>!oldIds.has(item.id)&&item.environment==='preview'&&item.deployment_trigger?.metadata?.branch===branch&&item.latest_stage?.status==='success')
  assert.ok(deployment?.aliases?.includes(CONSUMER_ORIGIN));report.deploymentId=deployment.id
  assert.deepEqual(boundary(await cf()),production)
  report.productionUnchanged=true;report.success=true
}catch(error){report.error=/^[A-Z_0-9]+$/.test(error.message)?error.message:'CONSUMER_SETUP_FAILED';report.failedAssertion=error.code==='ERR_ASSERTION'?String(error.message).slice(0,160):undefined;if(report.error!=='OPERATOR_ENROLLMENT_REQUIRED')process.exitCode=1}
report.finishedAt=new Date().toISOString();await writeFile(root+(resume?'deployment-resumed.json':'deployment.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2))
