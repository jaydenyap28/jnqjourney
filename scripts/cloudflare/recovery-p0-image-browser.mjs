import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
const root='artifacts/cloudflare-static-launch-p0'
const probe=JSON.parse(await readFile(root+'/image-recheck.json','utf8'))
const targets=[...new Set(probe.requests.filter(row=>row.status==='UNKNOWN').map(row=>row.url))]
assert.equal(targets.length,2)
const {chromium}=await import('../../artifacts/cloudflare-upload-fix/browser-tools/node_modules/playwright-core/index.mjs')
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true})
const report={checkedAt:new Date().toISOString(),browser:browser.version(),results:[]}
try {
  await Promise.all(targets.map(async url=>{
    const page=await browser.newPage(),row={url,status:'UNKNOWN'};report.results.push(row)
    page.on('requestfailed',request=>{if(request.url()===url)row.networkError=request.failure()?.errorText})
    try {
      const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:15000})
      row.status=response.status();row.type=response.headers()['content-type']
      if(response.ok()){await page.locator('img').first().evaluate(image=>image.decode(),{timeout:5000});row.decoded=await page.locator('img').first().evaluate(image=>({width:image.naturalWidth,height:image.naturalHeight}))}
    }catch(error){row.reason=error.name}
    await page.close()
  }))
}finally{await browser.close();await writeFile(root+'/image-browser.json',JSON.stringify(report,null,2))}
console.log(JSON.stringify(report))
