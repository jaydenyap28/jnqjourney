import assert from 'node:assert/strict'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {RECOVERY_BASE} from './recovery-sources.mjs'

const root=path.join(RECOVERY_BASE,'runs/production-20261111')
const d=JSON.parse(await readFile(path.join(root,'production-deployment.json'),'utf8'))
assert.ok(d.success&&d.environment==='production')
const origin=process.argv[2]??d.url
assert.ok([d.url,'https://www.jnqjourney.com'].includes(origin))
const {chromium}=await import('../../artifacts/cloudflare-upload-fix/browser-tools/node_modules/playwright-core/index.mjs')
const folder=path.join(root,new URL(origin).hostname==='www.jnqjourney.com'?'formal-browser':'production-browser')
await mkdir(folder,{recursive:true})
const report={startedAt:new Date().toISOString(),origin,results:[],requests:[],blockedLegacy:[],errors:[],passed:false}
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']})
try{
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
    const context=await browser.newContext({viewport,isMobile:viewport.width<500,hasTouch:viewport.width<500,serviceWorkers:'block'})
    await context.route('**/*',route=>{
      const request=route.request(),url=new URL(request.url())
      if(url.origin===origin)return route.continue()
      if(/(?:r2\.dev|vercel\.app)$/.test(url.hostname)||url.hostname.endsWith('.supabase.co')){
        report.blockedLegacy.push({host:url.hostname,path:url.pathname})
        return route.abort()
      }
      if(/(?:^|\.)(?:mapbox\.com|youtube-nocookie\.com|youtube\.com|ytimg\.com|gstatic\.com)$/.test(url.hostname)
        &&!url.hostname.startsWith('events.'))return route.continue()
      return route.abort()
    })
    const page=await context.newPage()
    page.on('pageerror',error=>report.errors.push(error.message.slice(0,200)))
    page.on('response',response=>{
      const url=new URL(response.url())
      if(url.origin===origin)report.requests.push({path:url.pathname,status:response.status(),type:response.request().resourceType()})
    })
    for(const route of ['/','/en','/spot/turtle-alley-636','/en/spot/turtle-alley-636','/notes/malaysia-turtle-night-terengganu','/guide/china-dali-shangri-la-lijiang-11d10n']){
      const response=await page.goto(origin+route,{waitUntil:'networkidle',timeout:45000})
      await page.evaluate(()=>document.fonts.ready)
      const images=await page.evaluate(async()=>{
        const nodes=[...document.images].filter(img=>{
          const box=img.getBoundingClientRect()
          return box.width>0&&box.height>0&&box.left<innerWidth&&box.top<innerHeight&&box.right>0&&box.bottom>0
        })
        return Promise.all(nodes.map(async img=>{
          try{await img.decode();return {loaded:img.naturalWidth>0,src:new URL(img.currentSrc,location.origin).pathname}}
          catch{return {loaded:false,src:img.getAttribute('src')}}
        }))
      })
      const data=await page.evaluate(()=>({title:document.title,h1:document.querySelectorAll('h1').length,
        width:document.documentElement.scrollWidth,viewport:innerWidth,canonical:document.querySelector('link[rel=canonical]')?.href}))
      const row={route,viewport:viewport.width,http:response.status(),...data,images,passed:response.status()===200&&data.h1===1&&data.width<=data.viewport+1&&images.every(img=>img.loaded)}
      report.results.push(row)
      if(route==='/'||route.startsWith('/guide/'))await page.screenshot({path:path.join(folder,(route==='/'?'home':'guide')+'-'+viewport.width+'.png')})
    }
    await context.close()
  }
  report.passed=report.results.every(row=>row.passed)&&report.errors.length===0&&report.blockedLegacy.length===0&&report.requests.every(row=>row.status<400)
}catch(error){report.failure=String(error.message).slice(0,240)}
finally{
  await browser.close()
  report.finishedAt=new Date().toISOString()
  await writeFile(path.join(folder,'checks.json'),JSON.stringify(report,null,2))
}
console.log(JSON.stringify({passed:report.passed,pages:report.results.length,legacy:report.blockedLegacy.length,errors:report.errors,failed:report.results.filter(row=>!row.passed),failure:report.failure}))
if(!report.passed)process.exitCode=1
