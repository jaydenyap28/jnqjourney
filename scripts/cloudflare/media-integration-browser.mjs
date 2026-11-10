// Real isolated Chrome run. Store only status, hashes and native counters.
import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'
import {makePng} from './upload-fix-images.mjs'
import {ACCOUNT,BUCKET,privateWranglerToken} from './candidate-cloudflare.mjs'
import {ISOLATED_REF,isolatedKeys,isolatedRequest} from './isolated-supabase.mjs'
import {signBridge,BRIDGE_PATH} from '../../cloudflare/spot-loop/identity-bridge/auth.mjs'

const root='artifacts/cloudflare-media-integration/'
const json=async file=>JSON.parse(await readFile(file,'utf8'))
const deployment=await json(root+'deployment.json')
const fixture=await json('cloudflare/spot-loop/.dev.vars.spot-loop-session')
const origin='https://codex-spot-media-integration.jnqjourney-spot-loop-migration-candidate.pages.dev'
const bridge='https://codex-r2-identity-bridge.jnqjourney-spot-loop-migration-candidate.pages.dev'+BRIDGE_PATH
const spot='/api/candidate/spots/92030'
const publicPath='/spot/cloudflare-loop-registry-92030'
assert.ok(deployment.success&&deployment.mediaIntegration&&deployment.ui.origin===origin&&deployment.projectRef===ISOLATED_REF&&fixture.projectRef===ISOLATED_REF)
const resumeObserver=process.argv.includes('--resume-observer')
const resumeUpload=process.argv.includes('--resume-upload')
const resumeRead=process.argv.includes('--resume-read-tail')
const resumeSecurity=process.argv.includes('--resume-security')
const firstFile=root+'browser-acceptance.json'
const resumedFile=root+'browser-acceptance-resumed.json'
const afterUploadFile=root+'browser-acceptance-after-upload.json'
const afterSaveFile=root+'browser-acceptance-final.json'
const file=resumeSecurity?root+'browser-acceptance-security.json':resumeRead?afterSaveFile:resumeUpload?afterUploadFile:resumeObserver?resumedFile:firstFile
const report={origin,uiDeployment:deployment.ui.deploymentId,bridgeDeployment:deployment.deploymentId,edgeVersion:deployment.edge.version,
  startedAt:new Date().toISOString(),verdict:'BROWSER_MEDIA_INTEGRATION_BLOCKED',edgeCpu:'UNKNOWN',freeQuotaRemaining:'UNKNOWN',steps:[],checks:[],uploads:[],race:[]}
if(resumeObserver){
  const first=await json(firstFile)
  assert.ok(first.uiDeployment===deployment.ui.deploymentId&&first.error==='TAIL_CORRELATION_FAILED'&&first.failedStage==='login_and_load_30'&&first.checks.length===4&&!first.uploads.length)
  report.priorObservedRequests=first.checks.length
}
let previousUpload
let previousSave
if(resumeUpload||resumeRead||resumeSecurity){
  const prior=await json(resumedFile)
  assert.ok(prior.uiDeployment===deployment.ui.deploymentId&&prior.error==='NATIVE_TAIL_MISSING'&&prior.failedStage==='browser_presigned_upload_and_complete')
  const complete=prior.checks.find(check=>check.path===spot+'/image/complete')
  const preview=prior.checks.find(check=>check.stage==='browser_presigned_upload_and_complete'&&check.method==='GET'&&check.status===200)
  assert.ok(complete?.status===201&&Number.isFinite(complete.nativeCpuMs)&&complete.nativeCpuMs<=10&&preview&&prior.uploads.some(upload=>upload.status===200&&upload.cors))
  previousUpload={path:preview.path,image:prior.image,completeCpuMs:complete.nativeCpuMs}
  report.priorObservedRequests=prior.priorObservedRequests+prior.checks.length
  report.uploadReused=true
}
if(resumeRead||resumeSecurity){
  const prior=await json(afterUploadFile)
  assert.ok(prior.uiDeployment===deployment.ui.deploymentId&&prior.failedStage==='login_and_load_30'&&prior.error==='NATIVE_TAIL_MISSING')
  assert.ok(prior.checks.length===5&&prior.checks.at(-1)?.path===spot&&prior.checks.every(check=>check.method!=='PATCH'))
  report.priorObservedRequests+=prior.checks.length
  report.unmeasuredPriorRead=prior.checks.at(-1).acceptanceId
}
if(resumeSecurity){
  const prior=await json(afterSaveFile)
  const saved=prior.checks.filter(check=>check.method==='PATCH')
  assert.ok(prior.uiDeployment===deployment.ui.deploymentId&&prior.failedStage==='reload_and_handle_conflict_permission_network'&&prior.error==='BROWSER_OR_INTEGRATION_STEP_FAILED')
  assert.ok(prior.steps.includes('real_public_bytes_and_cache')&&saved.length===3&&saved[0].status===200&&saved[1].status===409&&saved[2].status===200)
  report.priorObservedRequests+=prior.checks.length
  previousSave={version:prior.album.version,path:previousUpload.path}
  report.permissionTestFirstRequestCommitted=true
}
await writeFile(file,JSON.stringify(report,null,2),{flag:'wx'})
const persist=()=>writeFile(file,JSON.stringify(report,null,2)+'\n')
const requireCheck=(condition,code)=>{if(!condition)throw Error(code)}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
let browser,stage='initialize',fault,intercept,queue=Promise.resolve(),pageErrors=0
function marker(){
  requireCheck(report.checks.length+(report.priorObservedRequests??0)<55,'REQUEST_BUDGET_EXHAUSTED')
  return Date.now()+'-'+report.checks.length
}
async function trace(target,acceptanceId,status,method,path){
  const id=target==='ui'?deployment.ui.deploymentId:deployment.deploymentId
  const deadline=Date.now()+20000
  while(Date.now()<deadline){
    let data
    try{data=await json(root+'runtime-'+target+'.json')}catch{}
    requireCheck(!data?.diagnostics.parseErrors&&!data?.diagnostics.truncatedEvents,'TAIL_INTEGRITY_FAILED')
    if(data?.deploymentId===id){
      const event=data.events.find(item=>item.acceptanceId===acceptanceId)
      if(event){
        const redacted=path.replace(/^(\/media\/candidate\/(?:92017|92030)\/)[a-f0-9-]+(\.[a-z]+)$/,'$1REDACTED$2')
        requireCheck(event.status===status&&event.method===method&&(event.path===path||event.path===redacted),'TAIL_CORRELATION_FAILED')
        return event
      }
    }
    await new Promise(resolve=>setTimeout(resolve,80))
  }
  throw Error('NATIVE_TAIL_MISSING')
}
async function measure(entry,status,bridgeStatus){
  entry.status=status
  const ui=await trace(entry.target,entry.acceptanceId,status,entry.method,entry.path)
  entry.nativeCpuMs=ui.cpuTime;entry.operations=ui.operations??entry.operations;entry.outcome=ui.outcome
  await persist()
  requireCheck(Number.isFinite(ui.cpuTime)&&ui.cpuTime<=10&&ui.outcome==='ok','NATIVE_CPU_OR_OUTCOME_LIMIT')
  if(bridgeStatus){
    const native=await trace('bridge',entry.acceptanceId,bridgeStatus,'POST',BRIDGE_PATH)
    entry.bridgeCpuMs=native.cpuTime
    await persist()
    requireCheck(Number.isFinite(native.cpuTime)&&native.cpuTime<=10&&native.outcome==='ok','BRIDGE_CPU_OR_OUTCOME_LIMIT')
  }
}
async function step(name,run){
  stage=name
  await run()
  await queue
  if(fault)throw fault
  report.steps.push(name);await persist()
}
try{
  const {chromium}=await import('../../artifacts/cloudflare-upload-fix/browser-tools/node_modules/playwright-core/index.mjs')
  browser=await chromium.launch({executablePath:process.env.JNQ_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true})
  report.browserVersion=browser.version()
  const admin=await browser.newContext(),anonymous=await browser.newContext()
  const page=await admin.newPage(),publicPage=await anonymous.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror',()=>pageErrors++)
  const cdp=await anonymous.newCDPSession(publicPage)
  await cdp.send('Network.enable')
  const cache=new Map(),cacheHits=new Set()
  cdp.on('Network.requestServedFromCache',e=>cacheHits.add(e.requestId))
  cdp.on('Network.responseReceived',({response,requestId})=>{
    if(response.url.startsWith(origin+'/media/'))cache.set(new URL(response.url).pathname,{disk:!!response.fromDiskCache,memory:cacheHits.has(requestId),serviceWorker:!!response.fromServiceWorker})
  })
  await admin.route(url=>url.origin===origin&&/^\/(api|media)\//.test(url.pathname),async route=>{
    queue=queue.then(async()=>{
      if(fault){await route.abort();return}
      const request=route.request(),pathname=new URL(request.url()).pathname,method=request.method()
      if((resumeRead||resumeSecurity)&&method==='GET'&&pathname.startsWith('/api/')){await route.continue();return}
      const mode=pathname===spot&&method==='PATCH'?intercept:null
      if(mode)intercept=null
      if(mode==='offline'){report.networkFault='aborted before dispatch';await route.abort('internetdisconnected');return}
      const entry={stage,target:'ui',path:pathname,method,acceptanceId:marker()}
      report.checks.push(entry)
      if(mode==='permission'){
        // Chromium generates its own Origin for a continued request. Send the
        // isolated permission probe through Playwright's HTTP client, then let
        // the editor consume the real response and render its error.
        const denied=await route.fetch({headers:{...await request.allHeaders(),origin:'https://untrusted.invalid','x-jnq-acceptance':entry.acceptanceId},maxRedirects:0})
        await route.fulfill({response:denied})
        await measure(entry,denied.status())
        requireCheck(denied.status()===403,'PERMISSION_PROBE_NOT_DENIED')
        return
      }
      await route.continue({
        headers:{...await request.allHeaders(),'x-jnq-acceptance':entry.acceptanceId},
        ...(mode==='stale'?{postData:JSON.stringify({...request.postDataJSON(),expectedUpdatedAt:null})}:{}),
      })
      const response=await request.response()
      requireCheck(response,'BROWSER_RESPONSE_MISSING')
      let bridgeStatus
      if(pathname===spot&&method==='PATCH'&&(response.status()===200||mode==='stale')){
        bridgeStatus=200
        if(response.status()===200){
          const result=await response.json()
          requireCheck(result.counts?.bridge===1&&result.counts.registryRpc===1&&result.bridgeOperations?.list===2,'EDGE_SAVE_NOT_OBSERVED')
          entry.edgeElapsedMs=result.serverElapsedMs;entry.bridgeOperations=result.bridgeOperations
        }
      }
      await measure(entry,response.status(),bridgeStatus)
    }).catch(error=>{fault=error})
    await queue
  })
  page.on('response',response=>{
    const u=new URL(response.url()),method=response.request().method()
    if(u.hostname===ACCOUNT+'.r2.cloudflarestorage.com'&&u.pathname.startsWith('/'+BUCKET+'/_candidate-staging/92030/')&&method==='PUT'){
      report.uploads.push({method,status:response.status(),cors:response.headers()['access-control-allow-origin']===origin})
    }
  })
  const status=expected=>page.waitForFunction(text=>document.querySelector('#status').textContent.includes(text),expected)
  const signIn=async()=>{
    await page.locator('#login [name=email]').fill(fixture.email)
    await page.locator('#login [name=password]').fill(fixture.password)
    await page.locator('#login button').click()
    await status('已读取版本')
  }
  const saveButton=()=>page.locator('#save button:not([type])').click()
  const readFields=async()=>JSON.parse(await page.locator('#advanced-fields').inputValue())
  const png=makePng(32*1024,73)
  report.image={bytes:png.bytes.length,sha256:png.sha256}
  const keys=await isolatedKeys()
  async function row(id){
    assert.ok([92017,92030].includes(id))
    const response=await isolatedRequest(keys,'/rest/v1/locations?id=eq.'+id+'&select=*')
    requireCheck(response.ok,'ISOLATED_FIXTURE_READ_FAILED')
    const records=await response.json()
    requireCheck(records.length===1&&records[0].id===id,'ISOLATED_FIXTURE_SCOPE_FAILED')
    return records[0]
  }
  async function rpc(name,args){
    const response=await isolatedRequest(keys,'/rest/v1/rpc/jnq_media_'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)})
    return {status:response.status,value:await response.json()}
  }
  async function bytes(label,pathname,expected,expectedHash){
    const entry={stage:label,target:'ui',path:pathname,method:'GET',acceptanceId:marker()}
    report.checks.push(entry)
    const result=await publicPage.evaluate(async ({pathname,acceptanceId})=>{
      const response=await fetch(pathname,{headers:{'X-JnQ-Acceptance':acceptanceId}})
      const bytes=await response.arrayBuffer()
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('')
      return {status:response.status,hash,bytes:bytes.byteLength,mime:response.headers.get('content-type'),cache:response.headers.get('cache-control'),edgeCache:response.headers.get('cf-cache-status')}
    },{pathname,acceptanceId:entry.acceptanceId})
    entry.bytes=result.bytes;entry.mime=result.mime;entry.sha256=result.hash;entry.cacheControl=result.cache;entry.cfCacheStatus=result.edgeCache;entry.browserCache=cache.get(pathname)
    await measure(entry,result.status)
    requireCheck(result.status===expected&&result.cache?.includes('no-store')&&result.edgeCache!=='HIT','PUBLIC_STATUS_OR_CACHE_FAILED')
    if(expected===200)requireCheck(result.hash===expectedHash&&result.mime==='image/png'&&entry.browserCache&&!Object.values(entry.browserCache).some(Boolean),'PUBLIC_BYTES_OR_BROWSER_CACHE_FAILED')
    else requireCheck(!result.mime?.startsWith('image/')&&result.hash!==png.sha256,'PUBLIC_BYTES_LEAK')
    return result
  }
  let path,priorPath,retired,versionAfterSave
  await step('login_and_load_30',async()=>{
    await page.goto(origin+'/admin/cloudflare-spot')
    await signIn()
    await page.locator('#fixture').selectOption('92030')
    await page.waitForFunction(()=>JSON.parse(document.querySelector('#advanced-fields').value).images.length===30)
    priorPath=(await readFields()).image_url
    await publicPage.goto(origin+'/admin/cloudflare-spot')
  })
  if(previousSave){
    path=previousSave.path
    const current=await row(92030)
    requireCheck(current.images.length===30&&current.image_url===path&&current.updated_at!==previousSave.version&&current.name_cn==='隔离浏览器再次编辑'&&current.publication_status==='published','RESUMED_SAVE_STATE_INVALID')
    versionAfterSave=current.updated_at
    report.album={count:current.images.length,version:current.updated_at}
    await step('verify_already_saved_30_checkpoint',()=>bytes('public_image_before_withdraw_resume',path,200,png.sha256))
  }else{
  await step('browser_presigned_upload_and_complete',async()=>{
    if(previousUpload){
      requireCheck(previousUpload.image.sha256===png.sha256,'UPLOAD_CHECKPOINT_HASH_CHANGED')
      path=previousUpload.path
      requireCheck(/^\/media\/candidate\/92030\/[a-f0-9-]+\.png$/.test(path)&&path!==priorPath,'UPLOAD_CHECKPOINT_SCOPE_FAILED')
      const lookup=await rpc('lookup',{p_spot:92030,p_key:path.slice(1)})
      requireCheck(lookup.status===200&&lookup.value?.size===png.bytes.length&&lookup.value.publiclyReferenced===false,'UPLOAD_CHECKPOINT_NOT_REGISTERED')
      await bytes('unpublished_registered_bytes_denied',path,404)
      return
    }
    await page.locator('#photo').setInputFiles({name:'synthetic-media-integration.png',mimeType:'image/png',buffer:png.bytes})
    await page.locator('#upload').click()
    await page.waitForFunction(()=>document.querySelector('#photo-state').textContent.includes('已上传到测试 R2'))
    path=await page.locator('#image').getAttribute('src')
    requireCheck(/^\/media\/candidate\/92030\/[a-f0-9-]+\.png$/.test(path)&&path!==priorPath,'UPLOAD_SCOPE_FAILED')
    await page.waitForFunction(()=>document.querySelector('#image').complete&&document.querySelector('#image').naturalWidth===1024)
    requireCheck(report.uploads.some(item=>item.status===200&&item.cors),'R2_CORS_NOT_OBSERVED')
    await bytes('unpublished_registered_bytes_denied',path,404)
  })
  await step('save_30_with_new_upload',async()=>{
    await page.locator('#save details summary').click()
    const fields=await readFields()
    retired=fields.images.pop()
    if(previousUpload){fields.image_url=path;fields.images.push(path)}
    await page.locator('#advanced-fields').fill(JSON.stringify(fields))
    await page.locator('[name=name_cn]').fill('隔离浏览器相册验收')
    await saveButton();await status('保存成功')
    const actual=await row(92030)
    requireCheck(actual.images.length===30&&actual.image_url===path&&actual.images.at(-1)===path&&actual.name_cn==='隔离浏览器相册验收','BROWSER_ALBUM_NOT_SAVED')
    versionAfterSave=actual.updated_at
    report.album={count:actual.images.length,version:actual.updated_at}
  })
  await step('real_public_bytes_and_cache',async()=>{
    await bytes('public_image_first',path,200,png.sha256)
    await bytes('public_image_repeat_default_cache',path,200,png.sha256)
    await bytes('retired_candidate_url_denied',retired,404)
    await bytes('legacy_public_media_path_denied','/media/locations/92030/synthetic-legacy.png',404)
    const pageResponse=await publicPage.evaluate(async path=>{const r=await fetch(path);return {status:r.status,html:await r.text()}},publicPath)
    requireCheck(pageResponse.status===200&&pageResponse.html.includes(path)&&pageResponse.html.includes('隔离浏览器相册验收'),'PUBLIC_PAGE_NOT_UPDATED')
  })
  }
  await step('reload_and_handle_conflict_permission_network',async()=>{
    if(!previousSave){
      await page.reload();await status('已读取版本')
      await page.locator('#fixture').selectOption('92030')
      await page.waitForFunction(()=>document.querySelector('[name=name_cn]').value==='隔离浏览器相册验收')
      await page.locator('[name=name_cn]').fill('隔离浏览器再次编辑')
      intercept='stale';await saveButton();await status('版本或照片已变化')
    }
    await page.locator('[name=name_cn]').fill('隔离浏览器再次编辑')
    intercept='permission';await saveButton();await status('没有执行此操作的权限')
    intercept='offline';await saveButton();await status('保存结果未知')
    requireCheck((await row(92030)).updated_at===versionAfterSave,'REJECTED_SAVE_CHANGED_ROW')
  })
  await step('save_reedit_and_withdraw',async()=>{
    await page.locator('[name=publication_status]').selectOption('hidden')
    await saveButton();await status('已下架')
    const actual=await row(92030)
    requireCheck(actual.publication_status==='hidden'&&actual.images.length===30&&actual.name_cn==='隔离浏览器再次编辑','BROWSER_WITHDRAW_NOT_SAVED')
    await bytes('withdrawn_same_warmed_url_denied',path,404)
    const result=await publicPage.evaluate(async path=>(await fetch(path)).status,publicPath)
    requireCheck(result===404,'WITHDRAWN_PAGE_EXPOSED')
  })
  await step('expired_browser_session',async()=>{
    // Evict only the access cookie, as Chrome does at its expiry.
    await admin.clearCookies({name:'__Host-jnq-candidate'})
    await saveButton();await status('会话已到期')
    requireCheck(await page.locator('#login').isVisible(),'EXPIRED_LOGIN_NOT_RESTORED')
  })
  await step('logout_and_clear_browser_session',async()=>{
    await signIn()
    await page.locator('#logout').click();await status('已退出登录')
    requireCheck(!(await admin.cookies()).some(cookie=>cookie.name.startsWith('__Host-jnq-candidate')),'BROWSER_SESSION_REMAINS')
  })
  const secret=(await readFile('cloudflare/spot-loop/.dev.vars.identity-bridge-media','utf8')).trim().split('=')[1]
  requireCheck(/^[A-Za-z0-9_-]{43}$/.test(secret),'TRIAL_KEY_REQUIRED')
  async function snapshot(current,paths){
    const body=JSON.stringify({spotId:current.id,keys:paths.map(path=>path.slice(1))})
    const entry={stage,target:'bridge',path:BRIDGE_PATH,method:'POST',acceptanceId:marker()}
    report.checks.push(entry)
    const headers=await signBridge(secret,bridge,body,entry.acceptanceId)
    const response=await fetch(bridge,{method:'POST',headers,body,redirect:'error',signal:AbortSignal.timeout(15000)})
    const result=await response.json()
    entry.operations=result.operations
    await measure(entry,response.status)
    requireCheck(response.ok&&result.nonce===headers['X-JnQ-Bridge-Nonce']&&result.acceptanceId===entry.acceptanceId&&result.spotId===current.id&&result.identities?.length===paths.length,'RACE_SNAPSHOT_INVALID')
    return result.identities
  }
  const token=await privateWranglerToken()
  async function putSynthetic(key,content){
    requireCheck(/^media\/candidate\/92017\/[a-f0-9-]+\.png$/.test(key),'RACE_OBJECT_OUT_OF_SCOPE')
    const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects/${key}`,{
      method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'image/png'},body:content,redirect:'error',signal:AbortSignal.timeout(15000),
    })
    const payload=await response.json()
    requireCheck(response.ok&&payload.success&&payload.result.key===key,'ISOLATED_R2_PUT_FAILED')
    return payload.result
  }
  await step('unregistered_r2_object_denied',async()=>{
    const key='media/candidate/92017/'+randomUUID()+'.png'
    await putSynthetic(key,png.bytes)
    await bytes('unregistered_r2_bytes_denied','/'+key,404)
  })
  await step('overwrite_after_snapshot_before_transaction',async()=>{
    const before=await row(92017),paths=[...new Set([before.image_url,...before.images])]
    requireCheck(before.publication_status==='published'&&paths.length===17,'RACE_FIXTURE_NOT_READY')
    const observed=await snapshot(before,paths)
    const original=observed[0]
    const changed=await putSynthetic(original.key,png.bytes)
    requireCheck(changed.version!==original.version&&changed.etag!==original.etag,'R2_OVERWRITE_UNCONFIRMED')
    const result=await rpc('save',{p_spot:before.id,p_expected_updated_at:before.updated_at,p_patch:{name_cn:'隔离快照覆盖验收'},p_observed:observed})
    report.race.push({case:'overwrite',snapshotVersion:original.version,currentVersion:changed.version,rpcStatus:result.status})
    await persist()
    requireCheck(result.status===200&&(await row(92017)).updated_at!==before.updated_at,'EXPECTED_CROSS_SYSTEM_WINDOW_NOT_OBSERVED')
    await bytes('overwritten_object_bytes_denied','/'+original.key,404)
  })
  await step('revoke_after_snapshot_before_transaction',async()=>{
    const before=await row(92017),paths=before.images.slice(1)
    requireCheck(before.image_url===before.images[0]&&paths.length===16,'REVOKE_FIXTURE_MISMATCH')
    const observed=await snapshot(before,paths)
    const revoked=await rpc('revoke',{p_spot:before.id,p_key:paths[0].slice(1)})
    requireCheck(revoked.status===200&&revoked.value===true,'REVOCATION_FAILED')
    const after=await row(92017)
    requireCheck(after.publication_status==='hidden'&&after.updated_at!==before.updated_at,'REVOCATION_DID_NOT_WITHDRAW')
    const params={p_spot:before.id,p_patch:{image_url:paths[0],images:paths,publication_status:'published'},p_observed:observed}
    const stale=await rpc('save',{...params,p_expected_updated_at:before.updated_at})
    const current=await rpc('save',{...params,p_expected_updated_at:after.updated_at})
    report.race.push({case:'revoke',staleStatus:stale.status,staleCode:stale.value.code,currentStatus:current.status,currentCode:current.value.code})
    requireCheck(stale.status===409&&current.status===409&&stale.value.code==='PT409'&&current.value.code==='PT409','REVOKED_SNAPSHOT_COULD_SAVE')
    requireCheck((await row(92017)).updated_at===after.updated_at,'REVOKED_RACE_CHANGED_ROW')
    await bytes('revoked_object_bytes_denied',paths[0],404)
  })
  requireCheck(pageErrors===0,'BROWSER_PAGE_ERROR')
  report.lowMargin=report.checks.filter(check=>check.nativeCpuMs>=8||check.bridgeCpuMs>=8).map(check=>({path:check.path,nativeCpuMs:check.nativeCpuMs,bridgeCpuMs:check.bridgeCpuMs}))
  if(previousUpload?.completeCpuMs>=8)report.lowMargin.push({path:spot+'/image/complete',nativeCpuMs:previousUpload.completeCpuMs})
  requireCheck(!report.checks.some(check=>check.nativeCpuMs===10||check.bridgeCpuMs===10),'NATIVE_CPU_AT_LIMIT')
  report.verdict='BROWSER_MEDIA_INTEGRATION_PASS'
}catch(error){
  report.error=fault?.message??error.message
  if(!/^[A-Z_0-9]+$/.test(report.error))report.error='BROWSER_OR_INTEGRATION_STEP_FAILED'
  report.failedStage=stage;process.exitCode=1
}finally{
  await browser?.close()
  await queue
  report.finishedAt=new Date().toISOString()
  report.pageErrors=pageErrors
  await persist()
  console.log(JSON.stringify({verdict:report.verdict,error:report.error,failedStage:report.failedStage,steps:report.steps,checks:report.checks.length},null,2))
}
