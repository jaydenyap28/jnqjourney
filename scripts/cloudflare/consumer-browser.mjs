import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {isolatedKeys,isolatedRequest,ISOLATED_REF,ISOLATED_ORIGIN} from './isolated-supabase.mjs'
const root='artifacts/cloudflare-p0-consumers/',origin='http://127.0.0.1:4401'
const fixture=JSON.parse(await readFile('cloudflare/spot-loop/.dev.vars.spot-loop-session'))
assert.equal(fixture.projectRef,ISOLATED_REF)
const d=JSON.parse(await readFile(root+'deployment-resumed.json'))
const retry=process.argv.includes('--retry-selector')
const resume=process.argv.includes('--resume-components')
const file=root+(resume?'browser-final.json':retry?'browser-after-selector.json':'browser.json')
if(retry){const prior=JSON.parse(await readFile(root+'browser.json'));assert.ok(prior.error==='BROWSER_TIMEOUT'&&prior.steps.length===0&&prior.api.length===0)}
const report={startedAt:new Date().toISOString(),siteOrigin:origin,siteRuntime:'Real Next 14 app, local-only isolated environment; NOT a Cloudflare frontend deployment',previewApi:d.origin,steps:[],api:[],pageErrors:[],formalRequestsBlocked:0,verdict:'P0_CONSUMER_ADAPTATION_BLOCKED'}
if(resume){
  const prior=JSON.parse(await readFile(root+'browser-after-selector.json'))
  assert.ok(prior.error==='BROWSER_TIMEOUT'&&prior.steps.some(step=>step.name==='/admin'&&step.locationRead200))
  report.steps.push(...prior.steps);report.api.push(...prior.api);report.priorBrowserError=prior.error
}
await writeFile(file,JSON.stringify(report),{flag:'wx'})
let browser
const persist=()=>writeFile(file,JSON.stringify(report,null,2)+'\n')
try{
  const setupKeys=await isolatedKeys()
  const before=await isolatedRequest(setupKeys,'/rest/v1/locations?id=eq.92061&select=id,updated_at,publication_status')
  assert.ok(before.ok);const [row]=await before.json();assert.ok(row.id===92061&&row.publication_status==='hidden')
  // Test fixture control, not a product save or a repeat Registry benchmark.
  const setup=await isolatedRequest(setupKeys,'/rest/v1/locations?id=eq.92061&publication_status=eq.hidden&updated_at=eq.'+encodeURIComponent(row.updated_at),{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({publication_status:null,updated_at:new Date().toISOString()})})
  assert.ok(setup.ok&&(await setup.json()).length===1);report.fixtureControlOnly=true
  const {chromium}=await import('../../artifacts/cloudflare-upload-fix/browser-tools/node_modules/playwright-core/index.mjs')
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true})
  report.browserVersion=browser.version()
  const context=await browser.newContext({viewport:{width:1280,height:900}})
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url())
    if(url.origin===origin||url.origin===ISOLATED_ORIGIN||url.origin===d.origin||['data:','blob:'].includes(url.protocol))return route.continue()
    report.formalRequestsBlocked++;return route.abort()
  })
  const page=await context.newPage();page.setDefaultTimeout(25000)
  page.on('pageerror',error=>report.pageErrors.push(String(error.message).replace(/https?:\/\/[^\s]+/g,'[url]').slice(0,180)))
  page.on('response',response=>{const url=new URL(response.url());if(url.origin===origin&&url.pathname.startsWith('/api/'))report.api.push({path:url.pathname,status:response.status()})})
  await page.goto(origin+'/admin/login',{waitUntil:'domcontentloaded',timeout:45000})
  await page.locator('input[type=email]').fill(fixture.email)
  await page.locator('input[type=password]').fill(fixture.password)
  await page.getByRole('button',{name:'登录',exact:true}).click()
  await page.waitForURL(url=>url.pathname==='/admin',{timeout:45000})
  await page.waitForResponse(response=>new URL(response.url()).pathname==='/api/admin/locations',{timeout:45000}).catch(()=>{})
  report.steps.push({name:'real_supabase_login',passed:true})
  const adminRoutes=['/admin','/admin/edit/92061','/admin/regions','/admin/notes','/admin/guides','/admin/affiliate','/admin/klook-widgets']
  for(const path of adminRoutes){
    if(resume&&report.steps.some(step=>step.name===path))continue
    const begin=report.api.length
    const loaded=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/admin/locations',{timeout:20000})
    const response=await page.goto(origin+path,{waitUntil:'domcontentloaded',timeout:45000})
    await loaded.catch(()=>{})
    await page.waitForTimeout(1800)
    const api=report.api.slice(begin)
    const text=await page.locator('body').innerText()
    const failed=api.some(item=>item.status>=400)
    report.steps.push({name:path,http:response.status(),locationRead200:api.some(item=>item.path==='/api/admin/locations'&&item.status===200),allApiSucceeded:!failed,sourceErrorVisible:/Unable to read|加载失败|Failed to load|Error:|无法读取/.test(text)})
    await persist()
  }
  const keys=await isolatedKeys()
  const anonymous=await browser.newContext()
  const publicPage=await anonymous.newPage()
  await anonymous.route('**/*',async route=>{
    const url=new URL(route.request().url());if(url.origin===origin||url.origin===ISOLATED_ORIGIN||url.origin===d.origin)return route.continue();report.formalRequestsBlocked++;return route.abort()
  })
  const unauthorized=await anonymous.request.get(origin+'/api/admin/locations')
  assert.equal(unauthorized.status(),401);report.steps.push({name:'anonymous_admin_denied',http:401,passed:true})
  for(const path of ['/','/search','/region','/guide','/notes','/en','/en/guide','/en/notes','/api/locations','/api/regions','/api/spots/consumer-fixture-92061']){
    const response=await publicPage.goto(origin+path,{waitUntil:'domcontentloaded',timeout:60000})
    const text=await publicPage.locator('body').innerText()
    report.steps.push({name:path,http:response.status(),htmlChars:text.length,hiddenFixtureNotPresent:!text.includes('Consumer Fixture 92061')})
    await persist()
  }
  await publicPage.screenshot({path:root+'public-real-components.png',fullPage:false})
  // Real existing authenticated session still has no direct table privilege.
  const rest=await page.evaluate(async({url,key})=>{
    const entry=Object.entries(localStorage).find(([name])=>name.startsWith('sb-')&&name.endsWith('-auth-token'))
    if(!entry)return null
    const session=JSON.parse(entry[1]);const token=session.access_token
    const response=await fetch(url+'/rest/v1/locations?select=id,name&limit=1',{headers:{apikey:key,Authorization:'Bearer '+token}})
    return {status:response.status,code:(await response.json()).code}
  },{url:ISOLATED_ORIGIN,key:keys.anon})
  assert.equal(rest?.status,403);assert.equal(rest?.code,'42501');report.steps.push({name:'authenticated_direct_table_denied',...rest,passed:true})
  // The legacy mutation endpoint must not silently bypass the Registry.
  const denied=await page.evaluate(async()=>{
    const session=JSON.parse(Object.entries(localStorage).find(([name])=>name.startsWith('sb-')&&name.endsWith('-auth-token'))[1])
    const response=await fetch('/api/admin/locations',{method:'PATCH',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({id:92061,data:{description:'Must not write'},returning:true})})
    return response.status
  })
  assert.equal(denied,503);report.steps.push({name:'legacy_mutation_fails_closed_without_registry_adapter',http:denied,passed:true})
  await page.goto(origin+'/admin',{waitUntil:'domcontentloaded'})
  await context.route('**/api/admin/locations?*',route=>route.continue({headers:{...route.request().headers(),authorization:'Bearer invalid-test-token'}}))
  await page.reload({waitUntil:'domcontentloaded'})
  await page.getByRole('alert').waitFor({timeout:20000})
  assert.ok(await page.getByRole('alert').count());report.steps.push({name:'expired_or_invalid_session_error_visible',passed:true})
  await page.screenshot({path:root+'admin-permission-error.png',fullPage:false})
  report.completed=true
}catch(error){report.error=error?.name==='TimeoutError'?'BROWSER_TIMEOUT':String(error.code||'BROWSER_ACCEPTANCE_FAILED');report.failureSummary=String(error.message||'').replace(/(?:eyJ\S+|Bearer\s+\S+)/g,'[redacted]').slice(0,240)}
finally{
  if(browser)await browser.close()
  const keys=await isolatedKeys()
  const response=await isolatedRequest(keys,'/rest/v1/locations?id=eq.92061&select=id,publication_status,updated_at')
  if(response.ok){const [row]=await response.json();if(row?.publication_status!=='hidden'){
    const hidden=await isolatedRequest(keys,'/rest/v1/rpc/jnq_media_withdraw',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_spot:92061,p_expected_updated_at:row.updated_at})})
    report.fixtureHiddenAfterTest=hidden.ok
  }else report.fixtureHiddenAfterTest=true}
  report.finishedAt=new Date().toISOString();await persist();console.log(JSON.stringify(report,null,2))
}
