// Read-only continuation after the alias returns a stale response. Never redeploy.
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {FINAL_DIR,hash} from './recovery-media-inventory-final.mjs'
import {RECOVERY_BASE} from './recovery-sources.mjs'
const branch=process.argv[2]
assert.match(branch||'',/^withdrawal-drill-[a-z0-9]+$/)
const folder=path.join(FINAL_DIR,branch)
const first=JSON.parse(await readFile(path.join(folder,'drill-result.json'),'utf8'))
assert.equal(first.branch,branch);assert.equal(first.deployments.length,2)
const [old,current]=first.deployments
const expectedAlias=`https://${branch}.jnqjourney-static-recovery-candidate.pages.dev`
assert.equal(current.alias,expectedAlias)
for(const deployment of [old,current])assert.match(deployment.url,/^https:\/\/[a-f0-9]+\.jnqjourney-static-recovery-candidate\.pages\.dev$/)
const original=JSON.parse(await readFile(path.join(RECOVERY_BASE,'deployment.json'),'utf8'))
assert.match(original.url,/^https:\/\/[a-f0-9]+\.jnqjourney-static-recovery-candidate\.pages\.dev$/)
const checks=new Map([
  ['/_publication.json',200],['/',200],['/spot/drill-shared',200],['/public-data/locations.json',200],['/public-data/spots/drill-shared.json',200],['/api/locations',200],['/sitemap.xml',200],['/media/shared-fixture.png',200],
  ['/spot/drill-withdrawn',404],['/en/spot/drill-withdrawn',404],['/old-withdrawal-fixture',404],['/spot/drill-withdrawn.txt',404],['/_next/data/drill/en/spot/drill-withdrawn.json',404],['/public-data/spots/drill-withdrawn.json',404],['/api/spots/drill-withdrawn',404],['/media/withdrawn-fixture.png',404],
])
const report={checkedAt:new Date().toISOString(),branch,alias:expectedAlias,deployment:current.url,originalFailure:first.failure,initialStale:first.requests.filter(row=>row.group==='postwithdrawal'&&row.url==='/spot/drill-withdrawn'),rounds:[],remoteWrites:0}
const banned=/JNQ_SYNTHETIC_WITHDRAWAL_TARGET|drill-withdrawn|withdrawn-fixture\.png/
async function probe(origin,url,expected){
  const row={url,expected,observedAt:new Date().toISOString(),status:'UNKNOWN',passed:false}
  try {
    const response=await fetch(origin+url,{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(12000)})
    const bytes=Buffer.from(await response.arrayBuffer())
    Object.assign(row,{status:response.status,cache:response.headers.get('cf-cache-status'),age:response.headers.get('age'),noindex:response.headers.get('x-robots-tag'),sha256:hash(bytes)})
    const revisionOk=url!=='/_publication.json'||origin!==expectedAlias||JSON.parse(bytes).revision===2
    row.passed=row.status===expected&&/noindex/.test(row.noindex||'')&&revisionOk&&(origin!==expectedAlias||!banned.test(bytes.toString()))
  }catch(error){row.error=error.cause?.code||error.name}
  return row
}
for(let attempt=0;attempt<3;attempt++){
  const results=await Promise.all([...checks].map(([url,status])=>probe(expectedAlias,url,status)))
  report.rounds.push(results)
  if(results.every(row=>row.passed)){
    report.firstAllPassedAt=new Date().toISOString()
    report.observedUpperBoundMs=Date.parse(report.firstAllPassedAt)-Date.parse(first.withdrawalStartedAt)
    report.within30Minutes=report.observedUpperBoundMs<=1800000
    break
  }
  if(attempt<2)await new Promise(resolve=>setTimeout(resolve,5000))
}
const [oldObject,oldPage,frozen,newFixed]=await Promise.all([
  probe(old.url,'/media/withdrawn-fixture.png',200),probe(old.url,'/spot/drill-withdrawn',200),
  probe(original.url,'/_publication.json',200),probe(current.url,'/media/withdrawn-fixture.png',404),
])
report.oldImmutable={oldObject,oldPage,bytesStillAvailable:oldObject.passed&&oldObject.sha256===first.requests.find(row=>row.group==='prewithdrawal'&&row.url===oldObject.url)?.sha256}
report.frozenPreserved=frozen.passed&&frozen.sha256===first.requests.find(row=>row.group==='frozen-before')?.sha256
report.newFixed=newFixed
const {chromium}=await import('../../artifacts/cloudflare-upload-fix/browser-tools/node_modules/playwright-core/index.mjs')
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true})
try {
  const page=await browser.newPage()
  await page.route('**/*',route=>new URL(route.request().url()).origin===expectedAlias?route.continue():route.abort())
  const decoded=await page.goto(expectedAlias+'/spot/drill-shared',{waitUntil:'load',timeout:12000})
  assert.equal(decoded.status(),200)
  report.chrome=await page.locator('img').evaluate(async image=>{await image.decode();return {width:image.naturalWidth,height:image.naturalHeight}})
} catch(error){report.chrome={error:error.name}} finally {await browser.close()}
report.passed=Boolean(report.within30Minutes&&report.frozenPreserved&&newFixed.passed&&report.chrome?.width>0)
await writeFile(path.join(folder,'read-only-observation.json'),JSON.stringify(report,null,2))
console.log(JSON.stringify({passed:report.passed,upperBoundMs:report.observedUpperBoundMs,oldImmutable:report.oldImmutable.bytesStillAvailable,frozenPreserved:report.frozenPreserved,chrome:report.chrome,results:report.rounds.at(-1).map(row=>[row.url,row.status,row.passed])}))
if(!report.passed)process.exitCode=1
