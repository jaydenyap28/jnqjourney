// Single, publicly documented historical image. All mutations are limited
// to a generated key in the isolated bucket and existing fixture 92017.
import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {createHash,randomUUID} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {ACCOUNT,BUCKET,PROJECT,cloudflareClient,privateWranglerToken} from './candidate-cloudflare.mjs'
import {ISOLATED_ORIGIN,ISOLATED_REF,isolatedKeys,isolatedRequest} from './isolated-supabase.mjs'
import {canonicalMediaPath,legacyPath,legacySource,previewOrigin} from '../../cloudflare/spot-loop/legacy-media-preview.mjs'

const root='artifacts/cloudflare-public-readiness/'
const branch='codex/public-readiness'
const id=92017
const mime='image/webp'
const run=promisify(execFile)
const load=async name=>JSON.parse(await readFile(root+name))
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const phase=process.argv[2]
assert.ok(['deploy','resume-deploy','verify-media'].includes(phase))
const cf=await cloudflareClient()
const token=await privateWranglerToken()
const keys=await isolatedKeys()
const report={phase,startedAt:new Date().toISOString(),project:PROJECT,branch,ref:ISOLATED_REF,bucket:BUCKET,fixture:id,sourceUrl:legacySource,legacyPath,canonicalMediaPath,checks:[],success:false}
let published=false
async function r2(endpoint,method='GET',bytes,contentType){
  assert.ok(/^domains\/(managed|custom)$/.test(endpoint)||/^objects\/(?:media\/candidate|_candidate-validation)\/92017\/[a-f0-9-]{36}\.webp(?:\.json)?$/.test(endpoint))
  const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/${endpoint}`,{
    method,body:bytes,headers:{Authorization:'Bearer '+token,...(contentType?{'Content-Type':contentType}:{})},redirect:'error',signal:AbortSignal.timeout(15000),
  })
  assert.ok(response.ok,`ISOLATED_R2_${method}_${response.status}`)
  if(method==='GET'&&endpoint.startsWith('objects/'))return {bytes:Buffer.from(await response.arrayBuffer()),etag:response.headers.get('etag')?.replace(/^W\//,'').replaceAll('"',''),mime:response.headers.get('content-type')}
  if(method==='DELETE'&&response.status===204)return null
  const result=await response.json()
  assert.ok(result.success)
  return result.result
}
async function boundary(){
  const project=await cf(),{production,preview}=project.deployment_configs
  assert.ok(project.name===PROJECT&&project.production_branch==='main'&&!project.canonical_deployment)
  assert.ok(!Object.keys(production.env_vars||{}).length&&!Object.keys(production.r2_buckets||{}).length)
  assert.ok(production.fail_open===false&&preview.fail_open===false&&preview.r2_buckets?.TEST_MEDIA?.name===BUCKET)
  assert.deepEqual(project.domains,[PROJECT+'.pages.dev'])
  assert.equal((await r2('domains/managed')).enabled,false)
  assert.equal((await r2('domains/custom')).domains.length,0)
  return production
}
async function row(){
  const response=await isolatedRequest(keys,'/rest/v1/locations?id=eq.'+id+'&select=id,status,publication_status,updated_at,image_url,images')
  assert.ok(response.ok,'ISOLATED_ROW_READ_FAILED')
  const [value]=await response.json()
  assert.equal(value?.id,id)
  return value
}
async function rpc(name,args){
  const response=await isolatedRequest(keys,'/rest/v1/rpc/jnq_media_'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)})
  const value=await response.json()
  assert.ok(response.ok,`ISOLATED_RPC_${name.toUpperCase()}_${response.status}_${/^PT[0-9]{3}$/.test(value?.code||'')?value.code:'UNKNOWN'}`)
  return value
}
async function putVerified(key,bytes,contentType){
  const result=await r2('objects/'+key,'PUT',bytes,contentType)
  const readback=await r2('objects/'+key)
  assert.ok(result.key===key&&Number(result.size)===bytes.length&&result.version&&result.etag===readback.etag&&readback.mime===contentType&&bytes.equals(readback.bytes),'ISOLATED_OBJECT_VERIFICATION_FAILED')
  return {...result,size:bytes.length}
}
async function publication(expected){
  const current=await row()
  assert.equal(current.publication_status,expected)
  return current
}
try{
  const production=await boundary()
  if(phase!=='verify-media'){
    if(phase==='resume-deploy'){
      const checkpoint=await load('deployment-before-route-fix.json')
      assert.ok(checkpoint.phase==='deploy'&&!checkpoint.success&&checkpoint.identity?.key===checkpoint.key&&checkpoint.ref===ISOLATED_REF&&checkpoint.fixture===id&&checkpoint.sourceUrl===legacySource)
      const current=await publication('hidden')
      const lookup=await rpc('lookup',{p_spot:id,p_key:checkpoint.key})
      const live=await r2('objects/'+checkpoint.key)
      const receipt=await r2('objects/'+checkpoint.receiptKey)
      assert.ok(current.updated_at===checkpoint.beforeVersion&&lookup?.publiclyReferenced===false&&lookup.version===checkpoint.identity.version&&lookup.receiptVersion===checkpoint.identity.receipt_version)
      assert.ok(sha(live.bytes)===checkpoint.sha256&&live.etag===checkpoint.identity.etag&&receipt.etag===checkpoint.identity.receipt_etag)
      for(const key of ['key','receiptKey','bytes','sha256','sourceEtag','beforeVersion','identity'])report[key]=checkpoint[key]
      report.reusedRegisteredMirror=true
    }else{
    const evidence=await load('inventory.json')
    const observed=evidence.samples.find(sample=>sample.label==='spot_cover_636')
    assert.ok(observed?.url===legacySource&&observed.status===200&&observed.referenceSources.includes('publicLocationIndex:636'))
    assert.equal(sha((await readFile('cloudflare/spot-loop/review/trusted-media-registry.draft.sql','utf8')).replaceAll('\r\n','\n')),'b221473d7f08dd28bcee736928b7e34b1a16f3191723f5decd025709972008f1')
    const before=await publication('hidden')
    assert.equal(before.status,'active')
    const source=await fetch(legacySource,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)})
    const expectedSize=Number(source.headers.get('content-length'))
    assert.ok(source.ok&&source.headers.get('content-type')===mime&&source.headers.get('etag')===observed.etag&&expectedSize>12&&expectedSize<1024*1024,'PUBLIC_SOURCE_CHANGED')
    const chunks=[]
    let length=0
    for await(const chunk of source.body){
      length+=chunk.byteLength
      assert.ok(length<=expectedSize,'PUBLIC_SOURCE_TOO_LARGE')
      chunks.push(chunk)
    }
    const bytes=Buffer.concat(chunks)
    assert.ok(bytes.length===expectedSize&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP','PUBLIC_WEBP_SIGNATURE_FAILED')
    const key='media/candidate/'+id+'/'+randomUUID()+'.webp'
    const receiptKey='_candidate-validation/'+key.slice('media/candidate/'.length)+'.json'
    Object.assign(report,{key,receiptKey,bytes:bytes.length,sha256:sha(bytes),sourceEtag:observed.etag,beforeVersion:before.updated_at})
    await writeFile(root+'media-checkpoint.json',JSON.stringify(report,null,2),{flag:'wx'})
    const final=await putVerified(key,bytes,mime)
    const proof={schemaVersion:1,key,fixtureId:String(id),size:final.size,etag:final.etag,version:final.version,contentType:mime,signatureChecked:true}
    const receipt=await putVerified(receiptKey,Buffer.from(JSON.stringify(proof)),'application/json')
    report.identity={key,size:final.size,mime,etag:final.etag,version:final.version,receipt_size:receipt.size,receipt_etag:receipt.etag,receipt_version:receipt.version}
    const register={p_spot:id,p_can_insert:true,...Object.fromEntries(Object.entries(report.identity).map(([name,value])=>['p_'+name,value]))}
    assert.equal(await rpc('register',register),true)
    const lookup=await rpc('lookup',{p_spot:id,p_key:key})
    assert.ok(lookup?.publiclyReferenced===false&&lookup.version===final.version&&lookup.receiptVersion===receipt.version)
    }
    const expires=Math.floor(Date.now()/1000)+1800
    const vars={SUPABASE_URL:ISOLATED_ORIGIN,LEGACY_MEDIA_TEST_KEY:report.key,LEGACY_MEDIA_TEST_EXPIRES:String(expires)}
    const config={name:PROJECT,pages_build_output_dir:'./deploy',compatibility_date:'2026-11-08',vars,r2_buckets:[{binding:'TEST_MEDIA',bucket_name:BUCKET,preview_bucket_name:BUCKET}]}
    await writeFile(root+'wrangler.jsonc',JSON.stringify(config,null,2),{flag:phase==='deploy'?'wx':'w'})
    const prior=new Set((await cf('/deployments')).map(d=>d.id))
    const commit=(await run('git',['rev-parse','HEAD'],{windowsHide:true})).stdout.trim()
    try{
      await run(process.execPath,[process.env.JNQ_WRANGLER_CLI,'pages','deploy',path.resolve(root+'deploy'),'--project-name',PROJECT,'--branch',branch,'--commit-hash',commit,'--commit-dirty=true'],{cwd:path.resolve(root),windowsHide:true,maxBuffer:4*1024*1024,timeout:120000})
    }catch(error){
      const messages=String(error.stderr||'')+'\n'+String(error.stdout||'')
      report.deployDiagnostic=/Invalid _routes\.json/i.test(messages)?'INVALID_PAGES_ROUTES':/overlapping rules/i.test(messages)?'OVERLAPPING_PAGES_ROUTES':'NO_ALLOWLISTED_CLI_DIAGNOSTIC'
      throw Error('ISOLATED_PREVIEW_DEPLOY_FAILED')
    }
    const preview=(await cf('/deployments')).find(d=>!prior.has(d.id)&&d.environment==='preview'&&d.deployment_trigger?.metadata?.branch===branch&&d.latest_stage?.status==='success')
    assert.ok(preview?.aliases?.includes(previewOrigin),'ISOLATED_PREVIEW_NOT_FOUND')
    const actual=await cf('/deployments/'+preview.id)
    for(const [name,value] of Object.entries(vars))assert.equal(actual.env_vars[name].value,value)
    assert.equal(actual.r2_buckets.TEST_MEDIA.name,BUCKET)
    assert.equal(actual.env_vars.SUPABASE_SERVICE_ROLE_KEY.type,'secret_text')
    Object.assign(report,{origin:previewOrigin,deploymentId:preview.id,environment:'preview',expiresAt:expires,productionUnchanged:true})
  }else{
    const deployment=await load('deployment.json')
    assert.ok(deployment.success&&deployment.origin===previewOrigin&&deployment.fixture===id&&deployment.environment==='preview'&&Date.now()<deployment.expiresAt*1000)
    const {key,receiptKey,identity}=deployment
    assert.ok(/^media\/candidate\/92017\/[a-f0-9-]{36}\.webp$/.test(key)&&receiptKey==='_candidate-validation/'+key.slice('media/candidate/'.length)+'.json')
    report.deploymentId=deployment.deploymentId
    async function media(label,pathname,status){
      const response=await fetch(previewOrigin+pathname,{redirect:'manual',signal:AbortSignal.timeout(15000)})
      const body=Buffer.from(await response.arrayBuffer())
      const result={label,pathname,status:response.status,mime:response.headers.get('content-type'),cacheControl:response.headers.get('cache-control'),bytes:body.length,sha256:sha(body)}
      report.checks.push(result)
      assert.ok(result.status===status&&result.cacheControl?.includes('no-store'),label.toUpperCase()+'_HTTP_FAILED')
      if(status===200)assert.ok(result.sha256===deployment.sha256&&result.mime===mime&&result.bytes===deployment.bytes,'HISTORICAL_BYTES_MISMATCH')
      else assert.ok(result.sha256!==deployment.sha256&&!result.mime?.startsWith('image/'),'HISTORICAL_BYTES_LEAK')
    }
    const original=await publication('hidden')
    assert.equal(original.updated_at,deployment.beforeVersion)
    await media('registered_unpublished',legacyPath,404)
    async function publish(current){
      const result=await rpc('save',{p_spot:id,p_expected_updated_at:current.updated_at,p_patch:{publication_status:'published',image_url:'/'+key,images:['/'+key]},p_observed:[identity]})
      assert.ok(result.publication_status==='published'&&result.image_url==='/'+key)
      published=true
      return result
    }
    const live=await publish(original)
    await media('same_historical_path_public',legacyPath,200)
    await media('new_canonical_media_path_public',canonicalMediaPath,200)
    await rpc('withdraw',{p_spot:id,p_expected_updated_at:live.updated_at})
    published=false
    await media('withdrawn_warmed_path',legacyPath,404)
    await publish(await publication('hidden'))
    const originalBytes=(await r2('objects/'+key)).bytes
    assert.equal(sha(originalBytes),deployment.sha256)
    await r2('objects/'+key,'DELETE')
    await media('registered_object_missing',legacyPath,404)
    const replacement=await putVerified(key,originalBytes,mime)
    assert.ok(replacement.etag===identity.etag&&replacement.version!==identity.version)
    await media('same_bytes_different_native_version',legacyPath,404)
    assert.equal(await rpc('revoke',{p_spot:id,p_key:key}),true)
    published=false
    await publication('hidden')
    await media('revoked_alias',legacyPath,404)
    await media('revoked_canonical',canonicalMediaPath,404)
    const old=await fetch(legacySource,{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(15000)})
    report.originalPublicR2AfterRevoke={status:old.status,mime:old.headers.get('content-type')}
    assert.ok(old.ok,'ORIGINAL_PUBLIC_R2_PROBE_FAILED')
    report.fixtureFinal='hidden'
    report.productionUnchanged=true
  }
  assert.deepEqual(await boundary(),production)
  report.success=true
}catch(error){
  report.error=/^[A-Z0-9_]+$/.test(error.message)?error.message:'PUBLIC_READINESS_PHASE_FAILED'
  if(published)try{
    const current=await row()
    await rpc('withdraw',{p_spot:id,p_expected_updated_at:current.updated_at})
    report.withdrawnAfterFailure=true
  }catch{report.withdrawnAfterFailure=false}
  process.exitCode=1
}
report.finishedAt=new Date().toISOString()
await writeFile(root+(phase==='verify-media'?'historical-media.json':'deployment.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify(report,null,2))
