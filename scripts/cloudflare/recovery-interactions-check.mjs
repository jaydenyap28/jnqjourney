// Narrow follow-up: wait for decoded gallery bytes, and test region/refresh.
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {RECOVERY} from './recovery-sources.mjs'
const deployment=JSON.parse(await readFile(path.join(RECOVERY,'deployment.json'),'utf8'))
assert.ok(deployment.success&&deployment.environment==='preview')
const {chromium}=await import('../../artifacts/cloudflare-upload-fix/browser-tools/node_modules/playwright-core/index.mjs')
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']})
const report={checkedAt:new Date().toISOString(),passed:false,errors:[],checks:[]}
try {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'})
  const page=await context.newPage()
  page.on('pageerror',error=>report.errors.push({message:error.message.replace(/https?:\/\/\S+/g,'[url]').slice(0,180),stack:error.stack?.replace(/https?:\/\/\S+/g,'[url]').slice(0,600),route:new URL(page.url()).pathname}))
  report.failedRequests=[]
  page.on('requestfailed',request=>{const url=new URL(request.url());report.failedRequests.push({host:url.hostname,path:url.pathname,error:request.failure()?.errorText})})
  await context.route('**/*',route=>{
    const req=route.request(),url=new URL(req.url())
    if(url.origin===deployment.url)return route.continue()
    if(['GET','HEAD'].includes(req.method())&&(req.resourceType()==='image'||/(?:^|\.)(?:mapbox\.com|youtube\.com|youtube-nocookie\.com|ytimg\.com|gstatic\.com)$/.test(url.hostname)))return route.continue()
    return route.abort()
  })
  await page.goto(deployment.url+'/guide/china-dali-shangri-la-lijiang-11d10n',{waitUntil:'networkidle'})
  const index=await page.locator('[data-guide-gallery]').evaluateAll(nodes=>nodes.findIndex(node=>node.querySelectorAll('button').length>1))
  await page.locator('[data-guide-gallery]').nth(Math.max(0,index)).locator('button').first().click()
  const modal=page.getByRole('dialog',{name:'攻略实拍图预览'})
  await modal.waitFor({state:'visible'})
  await modal.locator('img').first().evaluate(img=>img.decode())
  const before=await modal.locator('img').first().getAttribute('src')
  await page.getByRole('button',{name:'下一张图片',exact:true}).click()
  const imageCount=await modal.locator('button[aria-current]').count()
  if(imageCount>1)await page.waitForFunction(()=>document.querySelector('[role="dialog"] button[aria-label="查看第 2 张图片"]')?.getAttribute('aria-current')==='true')
  // React commits the source and resets FallbackImage error state in an effect.
  await modal.locator('img').first().evaluate(img=>img.decode())
  const after=await modal.locator('img').first().getAttribute('src')
  await page.screenshot({path:path.join(RECOVERY,'screenshots/gallery-decoded-390.png')})
  const visible=await modal.locator('img').first().evaluate(img=>({src:img.currentSrc,width:img.naturalWidth,height:img.naturalHeight}))
  assert.ok(visible.width>0&&visible.height>0)
  await modal.focus();await page.keyboard.press('Escape')
  await modal.waitFor({state:'hidden'})
  report.checks.push({feature:'gallery-decode-next-keyboard-close',before,after,decoded:visible,imageCount,nextBehavior:imageCount===1?'SINGLE_IMAGE_WRAP':'NEXT_SELECTED',passed:true})
  await page.goto(deployment.url+'/spot/pulau-kapas-232',{waitUntil:'networkidle'})
  const next=page.getByRole('button',{name:'Next gallery image',exact:true})
  await next.scrollIntoViewIfNeeded()
  const hero=next.locator('..')
  const original=await hero.locator('img').last().getAttribute('src')
  await next.click()
  await page.waitForFunction(previous=>[...document.querySelectorAll('img')].some(img=>img.alt.includes('Kapas')&&img.getAttribute('src')!==previous&&img.complete&&img.naturalWidth>0),original)
  const changed=await hero.locator('img').last().getAttribute('src')
  assert.notEqual(changed,original)
  report.checks.push({feature:'multi-image-spot-carousel',imageChanged:true,passed:true})
  await page.goto(deployment.url+'/region',{waitUntil:'networkidle'})
  const target=page.locator('a[href^="/region/terengganu-"]').first()
  await target.waitFor({state:'visible'})
  await Promise.all([page.waitForURL('**/region/terengganu-*'),target.click()])
  const regionPath=new URL(page.url()).pathname
  const count=await page.locator('a[href^="/spot/"]').count()
  assert.ok(count>0)
  const refreshed=await page.reload({waitUntil:'networkidle'})
  assert.equal(refreshed.status(),200)
  report.checks.push({feature:'region-selection-and-refresh',path:regionPath,spotLinks:count,passed:true})
  report.passed=report.errors.length===0
}catch(error){report.failure={name:error.name,message:error.message.replace(/https?:\/\/\S+/g,'[url]').slice(0,300)}}
finally{await browser.close();await writeFile(path.join(RECOVERY,'browser-interactions.json'),JSON.stringify(report,null,2))}
console.log(JSON.stringify(report))
if(!report.passed)process.exitCode=1
