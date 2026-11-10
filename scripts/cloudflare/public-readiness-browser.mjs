// Bounded read-only Chrome run against the dedicated Pages Preview.
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {previewOrigin,legacySource} from '../../cloudflare/spot-loop/legacy-media-preview.mjs'

const root='artifacts/cloudflare-public-readiness/'
const read=async name=>JSON.parse(await readFile(root+name))
const deployment=await read('deployment.json')
const bundle=await read('package-result.json')
assert.ok(deployment.success&&deployment.environment==='preview'&&deployment.origin===previewOrigin)
const publicImageOrigins=new Set([new URL(legacySource).origin,'https://vrufunuomioczocdsoer.supabase.co','https://i.ibb.co','https://lh5.googleusercontent.com'])
const canonical='https://www.jnqjourney.com'
const result={preview:previewOrigin,deploymentId:deployment.deploymentId,checkedAt:new Date().toISOString(),http:[],pages:[],externalPolicy:'GET/HEAD public image origins only; no third-party scripts, APIs or telemetry',passed:false}
const output=root+'browser-seo.json'
await writeFile(output,JSON.stringify(result,null,2),{flag:'wx'})
const save=()=>writeFile(output,JSON.stringify(result,null,2)+'\n')
let browser
async function request(pathname){
  return fetch(previewOrigin+pathname,{redirect:'manual',signal:AbortSignal.timeout(15000)})
}
try {
  for(const [from,to] of bundle.aliases){
    const response=await request(from)
    const location=response.headers.get('location')
    const redirect={path:from,status:response.status,location}
    result.http.push(redirect)
    await response.body?.cancel()
    assert.equal(response.status,301)
    assert.equal(new URL(location,previewOrigin).href,previewOrigin+to)
  }
  for(const [pathname,expected] of [['/jnq-public-readiness-nonexistent-20261110',404],['/admin',404],['/robots.txt',200],['/sitemap.xml',200]]){
    const response=await request(pathname)
    const body=await response.text()
    const headers={type:response.headers.get('content-type'),noindex:response.headers.get('x-robots-tag')}
    result.http.push({path:pathname,status:response.status,...headers})
    assert.equal(response.status,expected)
    if(pathname==='/robots.txt')assert.match(body,/Disallow:\s*\//)
    if(pathname==='/sitemap.xml'){
      const urls=[...body.matchAll(/<loc>(.*?)<\/loc>/g)].map(match=>new URL(match[1]))
      assert.ok(urls.length>0&&urls.every(url=>url.origin===canonical))
      result.sitemap={total:urls.length,unique:new Set(urls.map(url=>url.href)).size,english:urls.filter(url=>url.pathname.startsWith('/en')).length,spot:urls.filter(url=>/^\/(?:en\/)?spot\//.test(url.pathname)).length,routes:bundle.routes}
    }
  }
  const {chromium}=await import('../../artifacts/cloudflare-upload-fix/browser-tools/node_modules/playwright-core/index.mjs')
  browser=await chromium.launch({executablePath:process.env.JNQ_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true})
  result.browserVersion=browser.version()
  await mkdir(root+'screenshots',{recursive:true})
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
    const context=await browser.newContext({viewport,isMobile:viewport.width<500,hasTouch:viewport.width<500,serviceWorkers:'block'})
    let imageRequests=0
    await context.route('**/*',route=>{
      const request=route.request(),url=new URL(request.url())
      if(!['GET','HEAD'].includes(request.method()))return route.abort()
      if(url.origin===previewOrigin)return route.continue()
      if(request.resourceType()==='image'&&publicImageOrigins.has(url.origin)&&!url.search&&++imageRequests<=100&&
          (url.hostname!=='vrufunuomioczocdsoer.supabase.co'||url.pathname.startsWith('/storage/v1/object/public/')))return route.continue()
      return route.abort()
    })
    const page=await context.newPage()
    for(const {route} of bundle.routes){
      const faults=[]
      const errors=()=>faults.push('PAGE_ERROR')
      const consoleErrors=message=>{if(message.type()==='error'&&/hydrat|Minified React error/i.test(message.text()))faults.push('HYDRATION_ERROR')}
      page.on('pageerror',errors)
      page.on('console',consoleErrors)
      try {
        const response=await page.goto(previewOrigin+route,{waitUntil:'domcontentloaded',timeout:25000})
        assert.ok(response,'Missing Browser response')
        await page.waitForFunction(()=>{
          const visible=[...document.images].filter(img=>img.getBoundingClientRect().top<innerHeight&&img.getBoundingClientRect().bottom>0)
          return visible.length===0||visible.some(img=>img.complete&&img.naturalWidth>0)
        },undefined,{timeout:6500}).catch(()=>{})
        const dom=await page.evaluate(()=>{
          const meta=name=>document.querySelector('meta[name="'+name+'"]')?.content??null
          const types=[],invalid=[]
          function type(value){
            if(Array.isArray(value))value.forEach(type)
            else if(value&&typeof value==='object'){if(value['@type'])types.push(value['@type']);type(value['@graph'])}
          }
          for(const script of document.querySelectorAll('script[type="application/ld+json"]')){
            try{type(JSON.parse(script.textContent))}catch{invalid.push(true)}
          }
          const visible=[...document.images].filter(img=>img.getBoundingClientRect().top<innerHeight&&img.getBoundingClientRect().bottom>0)
          const decoded=visible.filter(img=>img.complete&&img.naturalWidth>0)
          const imageHosts={}
          for(const img of decoded){const url=new URL(img.currentSrc||img.src,location.href);imageHosts[url.hostname]=(imageHosts[url.hostname]||0)+1}
          return {title:document.title,language:document.documentElement.lang,h1:[...document.querySelectorAll('h1')].map(node=>node.textContent.trim()),
            canonical:document.querySelector('link[rel=canonical]')?.href??null,alternates:[...document.querySelectorAll('link[rel=alternate][hreflang]')].map(link=>({lang:link.hreflang,href:link.href})),
            robots:meta('robots'),ogImage:!!document.querySelector('meta[property="og:image"]'),schemaTypes:types,invalidJsonLd:invalid.length,
            width:{viewport:innerWidth,body:document.documentElement.scrollWidth},visibleImages:{count:visible.length,decoded:decoded.length,broken:visible.filter(img=>img.complete&&!img.naturalWidth).length,imageHosts}}
        })
        const raw=await response.text()
        const entry={route,viewport:viewport.width,status:response.status(),previewNoindex:response.headers()['x-robots-tag']?.includes('noindex')??false,
          serverH1:(raw.match(/<h1[ >]/g)||[]).length,serverCanonical:raw.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/)?.[1]??null,
          ...dom,issues:[...new Set(faults)]}
        entry.canonicalMatches=entry.canonical===new URL(route,canonical).href
        entry.overflowPx=Math.max(0,dom.width.body-dom.width.viewport)
        result.pages.push(entry)
        if(['/','/spot/turtle-alley-636','/notes/malaysia-turtle-night-terengganu','/en/spot/bukit-tun-razak-274'].includes(route)){
          const label=route==='/'?'home':route.slice(1).replaceAll('/','-')
          await page.screenshot({path:root+'screenshots/'+label+'-'+viewport.width+'.png',timeout:8000}).catch(()=>{entry.screenshot='unavailable'})
        }
        await save()
      } finally {
        page.off('pageerror',errors)
        page.off('console',consoleErrors)
      }
    }
    await context.close()
  }
  result.inspectionCompleted=result.pages.length===2*bundle.routes.length
  result.passed=result.inspectionCompleted&&result.pages.every(page=>page.status===200&&page.canonicalMatches&&page.h1.length===1&&page.serverH1===1&&!page.invalidJsonLd&&!page.issues.length)&&result.sitemap.spot>0
}catch(error){
  result.error=/^[A-Z0-9_]+$/.test(error.message)?error.message:'PUBLIC_BROWSER_CHECK_INCOMPLETE'
  process.exitCode=1
}finally{
  await browser?.close()
  await save()
  console.log(JSON.stringify({passed:result.passed,error:result.error,checks:result.http,pages:result.pages.map(({route,viewport,status,canonicalMatches,language,robots,alternates,schemaTypes,visibleImages,overflowPx,issues})=>({route,viewport,status,canonicalMatches,language,robots,alternates,schemaTypes,visibleImages,overflowPx,issues}))},null,2))
}
