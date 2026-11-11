// Observe the already-warmed synthetic no-store release. No cloud mutation.
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {readFile,writeFile} from 'node:fs/promises'
import {setTimeout as delay} from 'node:timers/promises'
import path from 'node:path'
import {FINAL_DIR,hash} from './recovery-media-inventory-final.mjs'

const branch='withdrawal-drill-mwbohuxp'
const directory=path.join(FINAL_DIR,branch)
const journal=JSON.parse(await readFile(path.join(directory,'drill-result.json'),'utf8'))
assert.equal(journal.branch,branch)
assert.equal(journal.cachePolicy,'no-store')
assert.equal(journal.deployments.length,2)
const [old,current]=journal.deployments
const alias=`https://${branch}.jnqjourney-static-recovery-candidate.pages.dev`
assert.equal(old.alias,alias)
assert.equal(current.alias,alias)
for(const item of [old,current]){
  assert.equal(item.environment,'preview')
  assert.match(item.url,/^https:\/\/[0-9a-f]+\.jnqjourney-static-recovery-candidate\.pages\.dev$/)
  assert.equal(item.after.productionCount,0)
}
const routes=new Map([
  ['/_publication.json',200],['/',200],['/public-data/locations.json',200],['/sitemap.xml',200],['/media/shared-fixture.png',200],
  ['/spot/drill-withdrawn',404],['/en/spot/drill-withdrawn',404],['/old-withdrawal-fixture',404],['/spot/drill-withdrawn.txt',404],
  ['/_next/data/drill/en/spot/drill-withdrawn.json',404],['/public-data/spots/drill-withdrawn.json',404],['/api/spots/drill-withdrawn',404],['/media/withdrawn-fixture.png',404],
])
const warm=['/spot/drill-withdrawn','/public-data/spots/drill-withdrawn.json','/media/withdrawn-fixture.png']
const withdrawal=Date.parse(journal.withdrawalStartedAt)
const deadline=withdrawal+30*60*1000
const started=Date.now()
const report={startedAt:new Date(started).toISOString(),withdrawalStartedAt:journal.withdrawalStartedAt,deadline:new Date(deadline).toISOString(),
  deployed:[old,current].map(({id,url,revision})=>({id,url,revision})),alias,network:[],browser:[],rounds:[],cloudWrites:0,
  simulation:'Loopback HTTP origin whose target is switched between the two verified fixed Preview deployments. No real custom domain, zone rules or production TLS.'}
const output=path.join(directory,'propagation-30m.json')
const save=()=>writeFile(output,JSON.stringify(report,null,2))
const reference=new Map()
const maxTimeout=10000
const suspect=/JNQ_SYNTHETIC_WITHDRAWAL_TARGET|drill-withdrawn|withdrawn-fixture\.png/
const signature=row=>`${row.status}:${row.sha256}:${row.locationPath||''}`
function identify(route,row){
  const matches=[old,current].filter(item=>reference.get(item.id)?.get(route)===signature(row))
  return matches.length===1?matches[0].id:matches.length===2?'IDENTICAL_BOTH_DEPLOYMENTS':'UNKNOWN'
}
async function capture(origin,route,source,query=''){
  const row={source,route,query,startedAt:new Date().toISOString(),elapsedMs:Date.now()-withdrawal,status:'UNKNOWN'}
  try {
    const response=await fetch(origin+route+query,{redirect:'manual',signal:AbortSignal.timeout(maxTimeout)})
    const bytes=Buffer.from(await response.arrayBuffer())
    const location=response.headers.get('location')
    Object.assign(row,{status:response.status,sha256:hash(bytes),locationPath:location?new URL(location,origin).pathname:null,
      cache:response.headers.get('cf-cache-status'),age:response.headers.get('age'),cacheControl:response.headers.get('cache-control'),
      ray:response.headers.get('cf-ray'),containsWithdrawn:!route.endsWith('.png')&&suspect.test(bytes.toString())})
  }catch(error){row.error=error.cause?.code||error.name}
  report.network.push(row)
  return row
}

for(const deployment of [old,current]){
  const byRoute=new Map()
  await Promise.all([...routes.keys()].map(async route=>{
    const row=await capture(deployment.url,route,`fixed-revision-${deployment.revision}`)
    row.deployment=deployment.id
    if(typeof row.status==='number')byRoute.set(route,signature(row))
  }))
  reference.set(deployment.id,byRoute)
}
const observedNew=report.network.filter(row=>row.source==='fixed-revision-2')
report.fixedNewPassed=observedNew.every(row=>row.status===routes.get(row.route)&&!row.containsWithdrawn)
assert.ok(report.fixedNewPassed,'FIXED_NEW_RELEASE_DOES_NOT_MATCH')
await save()

let simulatorTarget=old
const server=createServer(async (request,response)=>{
  const route=new URL(request.url,'http://127.0.0.1').pathname
  if(request.method!=='GET'||!routes.has(route)){response.writeHead(404).end();return}
  const selected=simulatorTarget
  try {
    const upstream=await fetch(selected.url+route,{redirect:'manual',signal:AbortSignal.timeout(maxTimeout)})
    const bytes=Buffer.from(await upstream.arrayBuffer())
    const headers={'Content-Type':upstream.headers.get('content-type')||'application/octet-stream',
      'Cache-Control':upstream.headers.get('cache-control')||'no-store','X-JnQ-Simulated-Deployment':selected.id}
    response.writeHead(upstream.status,headers).end(bytes)
  }catch{response.writeHead(503,{'Cache-Control':'no-store'}).end()}
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const simulation=`http://127.0.0.1:${server.address().port}`
const {chromium}=await import('../../artifacts/cloudflare-upload-fix/browser-tools/node_modules/playwright-core/index.mjs')
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true})
async function chromeProbe(page,origin,route,label){
  const cdp=await page.context().newCDPSession(page)
  const network=[]
  const browserCache=new Set()
  await cdp.send('Network.enable')
  cdp.on('Network.requestServedFromCache',event=>browserCache.add(event.requestId))
  cdp.on('Network.responseReceived',event=>{
    if(event.response.url===origin+route)network.push(event)
  })
  const row={label,route,observedAt:new Date().toISOString(),status:'UNKNOWN'}
  try{
    const response=await page.goto(origin+route,{waitUntil:'load',timeout:12000})
    const bytes=await response.body(),headers=response.headers(),event=network.at(-1)
    row.status=response.status();row.sha256=hash(bytes)
    row.deployment=headers['x-jnq-simulated-deployment']||identify(route,row)
    row.cache=headers['cf-cache-status'];row.age=headers.age;row.ray=headers['cf-ray']
    row.browserCache=event?Boolean(event.response.fromDiskCache||event.response.fromPrefetchCache||browserCache.has(event.requestId)):'UNKNOWN'
    row.serviceWorker=event?Boolean(event.response.fromServiceWorker):'UNKNOWN'
    row.transferSize=await page.evaluate(()=>performance.getEntriesByType('navigation')[0]?.transferSize??null)
  }catch(error){row.error=error.name}
  finally{await cdp.detach()}
  report.browser.push(row)
  return row
}
try {
  const browserContext=await browser.newContext({serviceWorkers:'block'})
  const page=await browserContext.newPage()
  const before=await chromeProbe(page,simulation,warm[0],'simulated-host-before')
  simulatorTarget=current
  const after=await chromeProbe(page,simulation,warm[0],'simulated-host-after-same-browser')
  report.simulatedHostPassed=before.status===200&&before.deployment===old.id&&after.status===404&&after.deployment===current.id
  await chromeProbe(page,alias,warm[0],'alias-same-browser-first')
  await chromeProbe(page,alias,warm[0],'alias-same-browser-repeat')
  const samples=[Date.now(),Math.min(Date.now()+60000,deadline-15000),Math.min(Date.now()+5*60000,deadline-15000),deadline-15000]
  for(const time of [...new Set(samples)].sort((a,b)=>a-b)){
    if(time<Date.now()-15000||time>=deadline-10000)continue
    if(time>Date.now())await delay(time-Date.now())
    const due=deadline-10000
    if(Date.now()>=due)break
    const complete=report.rounds.length===0||time===samples.at(-1)
    const selected=complete?[...routes.keys()]:['/_publication.json',...warm]
    const results=await Promise.all(selected.map(route=>capture(alias,route,'alias')))
    for(const row of results)row.deployment=identify(row.route,row)
    const pass=results.every(row=>row.status===routes.get(row.route)&&!row.containsWithdrawn)
    if(complete&&pass&&!report.firstCompleteAliasPassMs)report.firstCompleteAliasPassMs=Date.now()-withdrawal
    // A cache-busting URL is a diagnostic, never part of the acceptance checks.
    if(!pass&&report.rounds.length===0&&Date.now()<due){
      const sample=await capture(alias,warm[0],'alias-query-diagnostic',`?drill-observation=${started}`)
      sample.deployment=identify(sample.route,sample)
    }
    report.rounds.push({at:new Date().toISOString(),elapsedMs:Date.now()-withdrawal,complete,passed:pass,
      failures:results.filter(row=>row.status!==routes.get(row.route)||row.containsWithdrawn).map(row=>({route:row.route,status:row.status,deployment:row.deployment,age:row.age,cache:row.cache}))})
    await save()
    console.log(JSON.stringify({round:report.rounds.length,elapsedMs:report.rounds.at(-1).elapsedMs,failures:report.rounds.at(-1).failures}))
    if(complete&&pass)break
  }
  report.oldImmutableReachable=report.network.some(row=>row.source==='fixed-revision-1'&&row.route===warm[2]&&row.status===200)
  report.aliasPassedWithinWindow=Boolean(report.firstCompleteAliasPassMs&&report.firstCompleteAliasPassMs<=1800000)
  report.result=report.aliasPassedWithinWindow&&!report.oldImmutableReachable?'PASS':'BLOCKED'
}finally{
  await browser.close()
  await new Promise(resolve=>server.close(resolve))
  report.finishedAt=new Date().toISOString()
  await save()
}
console.log(JSON.stringify({result:report.result,firstCompleteAliasPassMs:report.firstCompleteAliasPassMs,oldImmutableReachable:report.oldImmutableReachable,simulatedHostPassed:report.simulatedHostPassed,output}))
