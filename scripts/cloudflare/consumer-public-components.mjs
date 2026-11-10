import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {isolatedKeys,isolatedRequest} from './isolated-supabase.mjs'
const root='artifacts/cloudflare-p0-consumers/',origin='http://127.0.0.1:4401'
const afterCache=process.argv.includes('--english-after-cache')
const englishOnly=afterCache||process.argv.includes('--english-only')
const file=root+(afterCache?'public-english-after-cache.json':englishOnly?'public-english-followup.json':'public-components.json')
const report={startedAt:new Date().toISOString(),runtime:'Local real Next components; Cloudflare Preview is the private-feed/byte API only',pages:[],canonical:null,formalWrites:0}
await writeFile(file,JSON.stringify(report),{flag:'wx'})
const keys=await isolatedKeys();let browser
const state=async()=>{const response=await isolatedRequest(keys,'/rest/v1/locations?id=eq.92061&select=id,updated_at,publication_status');assert.ok(response.ok);return(await response.json())[0]}
try{
  if(!englishOnly){
  const row=await state();assert.equal(row.publication_status,'hidden')
  const control=await isolatedRequest(keys,'/rest/v1/locations?id=eq.92061&updated_at=eq.'+encodeURIComponent(row.updated_at),{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({publication_status:null,updated_at:new Date().toISOString()})})
  assert.ok(control.ok&&(await control.json()).length===1)
  const api=await fetch(origin+'/api/spots/spot-92061',{redirect:'manual'});assert.ok(api.ok)
  const slug=(await api.json()).spot.slug
  assert.ok(slug.endsWith('-92061'))
  const canonical=await fetch(origin+'/public-data/spots/'+slug+'.json',{redirect:'manual'})
  assert.equal(canonical.status,200);const data=await canonical.json();assert.equal(data.spot.id,92061);assert.ok(!Object.hasOwn(data.spot,'review_jayden'))
  report.canonical={source:'Actual current public API slug, not guessed from fixture name',slug,status:canonical.status,fields: Object.keys(data.spot).length}
  }
  const {chromium}=await import('../../artifacts/cloudflare-upload-fix/browser-tools/node_modules/playwright-core/index.mjs')
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true})
  const context=await browser.newContext({viewport:{width:1280,height:900}})
  await context.route('**/*',route=>{
    const url=new URL(route.request().url())
    return url.origin===origin?route.continue():route.abort()
  })
  const page=await context.newPage();const errors=[]
  page.on('pageerror',error=>errors.push(String(error.name)))
  const media=[];page.on('response',response=>{if(response.url().includes('/media/'))media.push(response.status())})
  for(const path of (englishOnly?['/en/notes']:['/search','/region','/guide','/notes','/en/notes'])){
    const before=errors.length,begin=media.length
    try{
      const response=await page.goto(origin+path,{waitUntil:'domcontentloaded',timeout:45000})
      await page.getByRole('heading').first().waitFor({timeout:20000})
      const text=await page.locator('body').innerText()
      report.pages.push({path,http:response.status(),textChars:text.length,headings:await page.getByRole('heading').count(),newJsErrors:errors.length-before,unverifiedMediaDenied:media.slice(begin).filter(status=>status===404).length,runtimeErrorOverlay:/Unhandled Runtime Error|Application error/.test(text),bodyRendered:text.length>50})
    }catch(error){report.pages.push({path,error:error.name==='TimeoutError'?'BROWSER_TIMEOUT':'BROWSER_NAVIGATION_FAILED',newJsErrors:errors.length-before})}
    await writeFile(file,JSON.stringify(report,null,2)+'\n')
  }
  await page.screenshot({path:root+'public-notes-components.png',fullPage:false})
}catch(error){report.error=String(error.code||'PUBLIC_COMPONENT_CHECK_FAILED')}
finally{
  if(browser)await browser.close()
  const row=await state();if(row.publication_status!=='hidden'){
    const response=await isolatedRequest(keys,'/rest/v1/rpc/jnq_media_withdraw',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_spot:92061,p_expected_updated_at:row.updated_at})});report.fixtureHidden=response.ok
  }else report.fixtureHidden=true
  report.finishedAt=new Date().toISOString();await writeFile(file,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}
