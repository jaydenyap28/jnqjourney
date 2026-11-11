import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import path from 'node:path'
import {CDN,RECOVERY} from './recovery-sources.mjs'
import {readMediaApproval} from './recovery-media-release-gate.mjs'
import {FINAL_DIR} from './recovery-media-inventory-final.mjs'
const json=async name=>JSON.parse(await readFile(path.join(RECOVERY,name),'utf8'))
const deployment=await json('deployment.json'),guides=(await json('sources/guides.json')).guides
assert.ok(deployment.success&&deployment.environment==='preview')
const origin=deployment.url
const {chromium}=await import('../../artifacts/cloudflare-upload-fix/browser-tools/node_modules/playwright-core/index.mjs')
const result={checkedAt:new Date().toISOString(),origin,pages:[],interactions:[],network:{sameOrigin:[],external:{},blockedTelemetry:0,blockedOther:[]},passed:false}
const mobileResume=process.argv.includes('--resume-mobile')
const delta=process.argv.includes('--delta')
const finalMedia=process.argv.includes('--final-media')
const legacyHost=new URL(CDN).hostname
const providerImages=new Set()
if(finalMedia){
  const receipt=await json('deploy/_publication.json'),gate=await json('media-approval-gate.json')
  assert.ok(gate.finalPackageVerified&&receipt.mediaInventorySha256===gate.inventorySha256)
  assert.equal(deployment.mediaApprovalFingerprint,receipt.mediaApprovalFingerprint,'FINAL_BROWSER_DEPLOYMENT_APPROVAL_MISMATCH')
  assert.ok(!delta&&!mobileResume,'FINAL_BROWSER_REQUIRES_DESKTOP_AND_MOBILE')
  result.network.legacyR2=[]
  result.network.externalContentImages=[]
  const inventory=JSON.parse(await readFile(path.join(FINAL_DIR,'inventory.private.json'),'utf8'))
  const {approval}=await readMediaApproval(inventory)
  const decisions=new Map(approval.decisions.map(item=>[item.identitySha256,item]))
  for(const item of inventory.records){
    if(decisions.get(item.sha256)?.disposition==='provider-reference')providerImages.add(item.identity)
  }
}
const output=path.join(RECOVERY,finalMedia?'browser-final-media-checks.json':delta?'browser-delta-checks.json':mobileResume?'browser-mobile-checks.json':'browser-checks.json'),screens=path.join(RECOVERY,'screenshots')
await mkdir(screens,{recursive:true})
const save=()=>writeFile(output,JSON.stringify(result,null,2))
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']})
result.browserVersion=browser.version()
try {
  for(const viewport of [{width:1440,height:900},{width:1920,height:1080},{width:390,height:844},{width:430,height:932}].filter(viewport=>(!mobileResume||viewport.width<500)&&(!(delta||finalMedia)||[1440,390].includes(viewport.width)))) {
    const context=await browser.newContext({viewport,isMobile:viewport.width<500,hasTouch:viewport.width<500,serviceWorkers:'block'})
    await context.route('**/*',route=>{
      const req=route.request(),url=new URL(req.url())
      if(url.origin===origin)return route.continue()
      if(finalMedia&&url.hostname===legacyHost){
        result.network.legacyR2.push({path:url.pathname,type:req.resourceType()})
        return route.abort()
      }
      if(finalMedia&&req.resourceType()==='image'&&req.frame()===page.mainFrame()
        &&url.protocol==='https:'&&!providerImages.has(url.href)&&!/(?:^|\.)mapbox\.(com|cn)$/.test(url.hostname)){
        result.network.externalContentImages.push({host:url.hostname,path:url.pathname})
        return route.abort()
      }
      if(/events\.mapbox|vercel-(?:insights|analytics)|vitals\.vercel|doubleclick|google-analytics|pagead2|googlesyndication/.test(url.hostname)){result.network.blockedTelemetry++;return route.abort()}
      if(['GET','HEAD'].includes(req.method())&&(
        req.resourceType()==='image'&&['pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev','vrufunuomioczocdsoer.supabase.co','i.ibb.co','i.ytimg.com','lh5.googleusercontent.com'].includes(url.hostname)||
        /(?:^|\.)(?:mapbox\.com|mapbox\.cn|youtube-nocookie\.com|youtube\.com|ytimg\.com|googlevideo\.com|gstatic\.com)$/.test(url.hostname)
      ))return route.continue()
      if(url.protocol==='data:'||url.protocol==='blob:')return route.continue()
      result.network.blockedOther.push({host:url.hostname,path:url.pathname,type:req.resourceType(),method:req.method()})
      return route.abort()
    })
    const page=await context.newPage()
    let faults=[]
    page.on('pageerror',error=>faults.push(error.message.replace(/https?:\/\/\S+/g,'[url]').slice(0,180)))
    page.on('response',response=>{
      const req=response.request(),url=new URL(response.url())
      if(url.origin===origin)result.network.sameOrigin.push({path:url.pathname,type:req.resourceType(),method:req.method(),status:response.status(),queryPresent:!!url.search})
      else {const key=url.hostname+':'+response.status();result.network.external[key]=(result.network.external[key]||0)+1}
    })
    page.on('console',message=>{if(message.type()==='error'&&/hydrat|Minified React error|ChunkLoadError/.test(message.text()))faults.push('REACT_ERROR:'+message.text().slice(0,120))})
    async function visit(route,screenshot=false){
      faults=[]
      const response=await page.goto(origin+route,{waitUntil:'networkidle',timeout:45000})
      assert.equal(response.status(),200)
      await page.evaluate(()=>document.fonts.ready)
      await page.waitForFunction(()=>[...document.images].filter(img=>{const r=img.getBoundingClientRect();return r.width>0&&r.height>0&&r.left<innerWidth&&r.right>0&&r.top<innerHeight&&r.bottom>0}).every(img=>img.complete),undefined,{timeout:10000}).catch(()=>{})
      const stats=await page.evaluate(()=>({title:document.title,h1:document.querySelectorAll('h1').length,
        viewport:innerWidth,width:document.documentElement.scrollWidth,bodyText:document.body.innerText.length,
        canonical:document.querySelector('link[rel=canonical]')?.href,
        visibleImages:[...document.images].filter(img=>{const r=img.getBoundingClientRect();return r.width>0&&r.height>0&&r.left<innerWidth&&r.right>0&&r.top<innerHeight&&r.bottom>0}).map(img=>({loaded:img.complete&&img.naturalWidth>0,pending:!img.complete,alt:img.alt})),
        scripts:document.querySelectorAll('script[src]').length,footers:document.querySelectorAll('footer').length,
        eagerVideo:document.querySelectorAll('iframe[src*="youtube"]').length}))
      const record={route,viewport,...stats,errors:[...faults],passed:stats.h1===1&&stats.width<=stats.viewport+1&&faults.length===0}
      result.pages.push(record)
      if(screenshot){const name=route.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'')||'home';await page.screenshot({path:path.join(screens,`${name}-${viewport.width}.png`)})}
      await save()
      return record
    }
    const primary='/guide/china-dali-shangri-la-lijiang-11d10n'
    if(delta) {
      for(const route of ['/','/en/spot/turtle-alley-636','/en/packages','/en/disclaimer','/spot/pulau-kapas-232','/notes/malaysia-turtle-night-terengganu',primary])await visit(route,true)
      await context.close()
      continue
    }
    if([1440,390].includes(viewport.width)) {
      await visit('/',true)
      await page.waitForFunction(()=>document.querySelectorAll('.mapboxgl-marker').length===582)
      const initialMarkers=await page.locator('.mapboxgl-marker').count()
      await page.locator('input').first().fill('Turtle Alley')
      await page.waitForFunction(()=>new URL(location.href).searchParams.get('q')==='Turtle Alley')
      await page.waitForFunction(()=>document.querySelectorAll('.mapboxgl-marker').length===1)
      const filteredMarkers=await page.locator('.mapboxgl-marker').count()
      assert.ok(filteredMarkers>0&&filteredMarkers<initialMarkers,'HOME_FILTER_NOT_REACTIVE')
      const canvas=page.locator('canvas.mapboxgl-canvas')
      result.interactions.push({viewport:viewport.width,feature:'home-search-map',initialMarkers,filteredMarkers,mapCanvas:await canvas.count(),mapStyleResponses:Object.keys(result.network.external).filter(key=>key.includes('mapbox.com:200'))})
      await visit('/search')
      await page.locator('#public-search').fill('Turtle Alley')
      const found=page.locator('main a[href*="turtle-alley-636"]').first()
      await found.waitFor({state:'visible'})
      await Promise.all([page.waitForURL('**/spot/turtle-alley-636'),found.click()])
      result.interactions.push({viewport:viewport.width,feature:'static-search-document-navigation',path:new URL(page.url()).pathname})
      for(const route of ['/spot/turtle-alley-636','/en/spot/turtle-alley-636','/notes/malaysia-turtle-night-terengganu','/region/terengganu-34','/packages/batam-3d2n','/en','/en/notes','/en/guide']) {
        // Resolve the actual region route from the package inventory, never invent it.
        const actual=route==='/region/terengganu-34'?(await json('package-result.json')).pages.find(item=>/^\/region\/terengganu-/.test(item.route))?.route:route
        if(actual)await visit(actual,true)
      }
      for(const guide of guides)await visit('/guide/'+guide.slug,guide.slug==='china-dali-shangri-la-lijiang-11d10n')
    }
    await visit(primary,true)
    const galleryIndex=await page.locator('[data-guide-gallery]').evaluateAll(nodes=>nodes.findIndex(node=>node.querySelectorAll('button').length>1))
    const gallery=page.locator('[data-guide-gallery]').nth(Math.max(0,galleryIndex)).locator('button').first()
    if(await gallery.count()) {
      await gallery.click()
      const modal=page.getByRole('dialog',{name:'攻略实拍图预览'})
      await modal.waitFor({state:'visible'})
      const before=await modal.locator('img').first().getAttribute('src')
      await page.getByRole('button',{name:'下一张图片',exact:true}).click()
      if(galleryIndex>=0)await page.waitForFunction(()=>document.querySelector('[role="dialog"] button[aria-label="查看第 2 张图片"]')?.getAttribute('aria-current')==='true')
      const after=await modal.locator('img').first().getAttribute('src')
      await page.getByRole('button',{name:'关闭图片预览',exact:true}).click()
      await modal.waitFor({state:'hidden'})
      result.interactions.push({viewport:viewport.width,feature:'lightbox-open-next-close',imageChanged:before!==after,passed:true})
    }
    const nav=page.getByRole('navigation',{name:'攻略快速导航'})
    if(await nav.count()) {
      if(viewport.width<500)await page.locator('#guide-day-nav').selectOption('day-2')
      else await nav.getByRole('button',{name:'D2',exact:true}).click()
      await page.waitForFunction(()=>location.hash==='#day-2')
      result.interactions.push({viewport:viewport.width,feature:'day-nav',hash:'#day-2',passed:true})
    }
    const map=page.locator('#route-map')
    if(await map.count()) {
      await map.scrollIntoViewIfNeeded()
      await page.screenshot({path:path.join(screens,`guide-map-${viewport.width}.png`)})
      result.interactions.push({viewport:viewport.width,feature:'guide-map',canvas:await map.locator('canvas').count(),buttons:await map.locator('button').count(),textFallback:(await map.innerText()).length>0})
    }
    for(const id of ['budget','day-2','day-8','guide-bookings']) {
      const section=page.locator('#'+id)
      if(await section.count()){await section.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(screens,`guide-${id}-${viewport.width}.png`)})}
    }
    const video=page.getByRole('button',{name:/播放影片|Play video/}).first()
    if(await video.count()) {
      await video.click()
      const iframe=page.locator('iframe[src*="youtube-nocookie"]').first()
      await iframe.waitFor({state:'attached'})
      result.interactions.push({viewport:viewport.width,feature:'video-click-to-load',privacyHost:new URL(await iframe.getAttribute('src')).hostname,passed:true})
    }
    await page.locator('footer').last().scrollIntoViewIfNeeded()
    await page.screenshot({path:path.join(screens,`guide-footer-${viewport.width}.png`)})
    await context.close()
  }
  result.sameOriginFailures=result.network.sameOrigin.filter(row=>row.status>=400)
  result.serverRuntimeRequests=result.network.sameOrigin.filter(row=>row.method!=='GET'&&row.method!=='HEAD'||row.queryPresent&&row.type==='fetch')
  result.passed=result.pages.every(page=>page.passed)&&result.sameOriginFailures.length===0&&result.serverRuntimeRequests.length===0
  if(finalMedia)result.passed&&=result.network.legacyR2.length===0&&result.network.externalContentImages.length===0
    &&result.pages.some(page=>page.visibleImages.some(image=>image.loaded))
    &&result.pages.every(page=>page.visibleImages.every(image=>image.loaded))
}catch(error){result.failure={name:error.name,message:error.message.replace(/https?:\/\/\S+/g,'[url]').slice(0,400)}}
finally {await browser.close();await save()}
console.log(JSON.stringify({passed:result.passed,pages:result.pages.length,interactions:result.interactions,failedPages:result.pages.filter(page=>!page.passed),sameOriginFailures:result.sameOriginFailures,failure:result.failure}))
if(!result.passed)process.exitCode=1
