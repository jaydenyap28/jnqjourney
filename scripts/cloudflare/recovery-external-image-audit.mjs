// Direct Chrome loads of the observed non-R2 public image references only.
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {CDN,SUPABASE} from './recovery-sources.mjs'
import {FINAL_DIR,hash} from './recovery-media-inventory-final.mjs'
const {records}=JSON.parse(await readFile(path.join(FINAL_DIR,'inventory.private.json'),'utf8'))
const targets=records.filter(row=>row.status==='REVIEW_REQUIRED'&&!row.identity.startsWith(CDN+'/'))
const allow=new Set(['https://i.ibb.co','https://i.ytimg.com','https://img.youtube.com',SUPABASE])
assert.ok(targets.length<=120)
for(const {identity} of targets){
  const url=new URL(identity)
  assert.ok(allow.has(url.origin)&&!url.search)
  if(url.origin===SUPABASE)assert.ok(url.pathname.startsWith('/storage/v1/object/public/location-images/'))
}
const {chromium}=await import('../../artifacts/cloudflare-upload-fix/browser-tools/node_modules/playwright-core/index.mjs')
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true})
const context=await browser.newContext({serviceWorkers:'block'})
const allowedPaths=new Set(targets.map(row=>row.identity))
await context.route('**/*',route=>route.request().method()==='GET'&&allowedPaths.has(route.request().url())&&!route.request().redirectedFrom()?route.continue():route.abort())
const results=new Array(targets.length)
let cursor=0
try {
  await Promise.all(Array.from({length:5},async()=>{
    const page=await context.newPage()
    while(cursor<targets.length){
      const index=cursor++,target=targets[index],url=new URL(target.identity)
      const row={identitySha256:target.sha256,host:url.host,status:'UNKNOWN',source:target.sourceUrls.length>0,decode:false}
      results[index]=row
      try {
        const response=await page.goto(target.identity,{waitUntil:'load',timeout:15000})
        row.status=response.status();row.type=response.headers()['content-type']
        if(!response.ok()||!row.type?.startsWith('image/'))continue
        const length=Number(response.headers()['content-length'])
        if(length>25*1024*1024){row.bytes=length;row.error='PAGES_FILE_LIMIT';continue}
        row.dimensions=await page.locator('img').first().evaluate(async image=>{await image.decode();return {width:image.naturalWidth,height:image.naturalHeight}})
        row.decode=row.dimensions.width>0&&row.dimensions.height>0
        // These bytes are used for in-memory verification only.
        const bytes=await response.body()
        row.bytes=bytes.length;row.sha256=hash(bytes)
      }catch(error){row.error=error.name}
    }
    await page.close()
  }))
}finally{await browser.close()}
const summary={checkedAt:new Date().toISOString(),requests:targets.length,sourceIdentities:results.filter(row=>row.source).length,
  statusCounts:results.reduce((acc,row)=>(acc[row.status]=(acc[row.status]||0)+1,acc),{}),decoded:results.filter(row=>row.decode).length,
  knownBytes:results.reduce((n,row)=>n+(row.bytes||0),0),largestKnownBytes:Math.max(0,...results.map(row=>row.bytes||0)),over25MiB:results.filter(row=>row.bytes>25*1024*1024).length,
  hostingRights:'NOT_ESTABLISHED',publishedCopies:0}
await writeFile(path.join(FINAL_DIR,'external-image-audit.json'),JSON.stringify({summary,results},null,2))
console.log(JSON.stringify(summary))
