import { spawn } from 'node:child_process'
import { readFile, writeFile, appendFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

if (!process.env.NODE_OPTIONS?.includes('offline-network-guard')) throw new Error('Run through validate-offline.mjs runtime')
const out = process.env.JNQ_OFFLINE_OUTPUT || 'artifacts/rc1.2'
const json = async file => JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''))
const guides = await json('data/guides.json'), notes = await json('data/notes.json')
const locations = await json('public-data/locations.json'), regions = await json('public-data/regions.json')
const index = await json('public-data/spots/index.json'), aliases = await json('data/location-slugs.json')
const localization=await json('public-data/i18n/en/records.json'), costs=await json('public-data/guide-trip-costs.json')
const slug = index.slugs.find(slug => slug.endsWith('-449'))
const spot = (await json(`public-data/spots/${slug}.json`)).spot
const fixtureFile = path.resolve(out, 'runtime-fixture.json')
const initialPrice=(await json('data/guide-price-highlights.json'))[0]
const initialNote=notes.find(note=>note.published)
const state = { spots:[{...spot, status:'active', publication_status:'published'}], failRouting:false,
  prices:[{...initialPrice,id:'rc-price',guideSlug:guides[0].slug,titleZh:'RC_PRICE_BEFORE',optionLabelZh:'RC_OPTION',amountMinor:12345}],
  widgets:[{id:'rc-widget',title:'RC_WIDGET_BEFORE',description:'RC widget description',htmlCode:'<div>RC_WIDGET_BEFORE</div>',locationIds:[],regionIds:[],noteSlugs:[initialNote.slug],isActive:true,sortOrder:0,createdAt:'2026-10-18T00:00:00Z',updatedAt:'2026-10-18T00:00:00Z'}],
  affiliates:[{id:9001,title:'RC_AFFILIATE_BEFORE',description:'RC affiliate description',provider:'klook',link_type:'ticket',url:'https://booking.invalid/before',is_active:true,preview_image_url:null,image_url:null}],
}
const syncState = () => writeFile(fixtureFile, JSON.stringify(state))
await syncState()
await writeFile(`${fixtureFile}.requests.jsonl`, '')
const collections = { guides:structuredClone(guides), notes:structuredClone(notes) }
collections.notes.find(note=>note.slug===initialNote.slug).blocks.push({id:'rc-affiliate',type:'affiliate',title:'RC links',affiliateIds:[9001]})
const cdnCalls = []
const cdn = http.createServer((request,response) => {
  const pathname = new URL(request.url,'http://localhost').pathname
  let value
  if (pathname === '/public-data/guides.json') value = {schemaVersion:1,guides:collections.guides}
  else if (pathname === '/public-data/notes.json') value = {schemaVersion:1,notes:collections.notes.filter(note => note.published)}
  else if (pathname === '/public-data/locations.json') value=locations
  else if (pathname === '/public-data/regions.json') value=regions
  else if (pathname === '/public-data/spots/index.json') value=index
  else if (pathname === '/public-data/i18n/en/records.json') value=localization
  else if (pathname === '/public-data/guide-trip-costs.json') value=state.freezePublicCost && !new URL(request.url,'http://localhost').searchParams.has('publication') ? state.frozenCosts : costs
  else if (pathname === `/public-data/spots/${slug}.json`) value={schemaVersion:1,spot:state.freezePublicSpot?state.frozenSpot:state.spots[0]}
  cdnCalls.push({pathname,guideTitle:value?.guides?.[0]?.title,noteTitle:value?.notes?.[0]?.title,count:value?.guides?.length ?? value?.notes?.length})
  if (!value) { response.writeHead(404); response.end(); return }
  response.writeHead(200, {'Content-Type':'application/json','Cache-Control':'no-store'})
  response.end(JSON.stringify(value))
})
await new Promise(resolve => cdn.listen(0,'127.0.0.1',resolve))
const cdnBase = `http://127.0.0.1:${cdn.address().port}`
const env = {...process.env, JNQ_OFFLINE_RUNTIME_FIXTURE:fixtureFile, SUPABASE_SERVICE_ROLE_KEY:'offline-runtime-fixture',
  ADMIN_EMAILS:'offline-admin@example.test', PUBLIC_DATA_CDN_BASE_URL:cdnBase}
const checks=[], responses=[], publicationStates=[], restartEvidence={}, refreshDiagnostics=[], publicationReceipts=[]
let warmProviderReads
let server, base, serverLog=''
const check = async (name, fn) => {
  try { await fn(); checks.push({name,passed:true}) }
  catch (error) { checks.push({name,passed:false,error:error.message}); console.error(`${name}: ${error.message}`) }
}
async function start() {
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','0'],{env,stdio:['ignore','pipe','pipe']})
  await new Promise((resolve,reject) => {
    const timer=setTimeout(()=>reject(new Error('Local start timeout')),45000)
    let log=''
    const collect=bytes=> {
      log+=bytes; serverLog+=bytes
      void appendFile(`${out}/runtime-live.log`,bytes)
      const match=log.match(/http:\/\/127\.0\.0\.1:(\d+)/)
      if(match) base=`http://127.0.0.1:${match[1]}`
      if(log.includes('Ready in')) {clearTimeout(timer);resolve()}
    }
    server.stdout.on('data',collect);server.stderr.on('data',collect)
    server.once('error',error=>{clearTimeout(timer);reject(error)})
    server.once('exit',code=>{clearTimeout(timer);reject(new Error(`Local server exited ${code}`))})
  })
}
async function stop() {
  if (!server || server.exitCode !== null) return
  await new Promise(resolve=>{server.once('exit',resolve);server.kill()})
}
async function get(url,stage) {
  const response=await fetch(`${base}${url}`,{redirect:'manual',signal:AbortSignal.timeout(30000)})
  const body=await response.text()
  const result={stage,url,status:response.status,cache:response.headers.get('x-nextjs-cache'),cacheControl:response.headers.get('cache-control'),
    robots:response.headers.get('x-robots-tag'),indexable:response.headers.get('x-jnq-seo-indexable'),location:response.headers.get('location'),bytes:Buffer.byteLength(body),
    canonical:body.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/)?.[1] || null}
  result.version=response.headers.get('x-jnq-content-version') || body.match(/name="jnq-content-version"[^>]+content="([^"]+)"/)?.[1] || null
  result.markers=[...new Set(body.match(/OFFLINE_ACCEPTANCE_[A-Z_0-9]+/g) || [])]
  result.metaNoindex=/<meta[^>]+name="robots"[^>]+content="[^"]*noindex/.test(body)
  responses.push(result)
  return {...result,body}
}
const guideSlug=guides[0].slug,noteSlug=notes.find(note=>note.published).slug
const spotSlug=`${aliases['449'] || 'spot'}-449`
const paths={guide:`/guide/${guideSlug}`,note:`/notes/${noteSlug}`,spot:`/spot/${spotSlug}`}
async function refresh(kind) {
  const api=kind==='spot'?'/api/admin/public-data/spots/449':`/api/admin/${kind==='guide'?'guides':'notes'}`
  const response=await fetch(`${base}${api}`,{method:'POST',headers:{authorization:'Bearer offline-runtime-token','Content-Type':'application/json'},
    body:JSON.stringify({action:'revalidate-public',slug:kind==='guide'?guideSlug:noteSlug})})
  const payload=await response.json()
  assert.equal(response.status,200,JSON.stringify(payload))
  assert.equal(payload.publication.state,'verification-required')
  publicationReceipts.push({kind,...payload.publication})
  // Separate request after writer completion, matching the Pages phase of
  // adminFetch's verifier. Never prewarm the Chinese API before its HTML test.
  if (payload.publication.plan.englishPaths.length) {
    const pages=await fetch(`${base}/api/admin/publication-revalidate`,{method:'POST',headers:{authorization:'Bearer offline-runtime-token','Content-Type':'application/json'},body:JSON.stringify({paths:payload.publication.plan.englishPaths})})
    assert.equal(pages.status,200,await pages.text())
  }
  return payload.publication
}
async function refreshEnglishSpot() {
  const response=await fetch(`${base}/api/admin/spot-content-revalidate/449`,{method:'POST',headers:{authorization:'Bearer offline-runtime-token'}})
  assert.equal(response.status,200,await response.text())
}
async function publication(change) {
  const response=await fetch(`${base}/api/admin/publication-retry`,{method:'POST',headers:{authorization:'Bearer offline-runtime-token','Content-Type':'application/json'},body:JSON.stringify(change)})
  const payload=await response.json(); assert.equal(response.status,200,JSON.stringify(payload))
  publicationReceipts.push({kind:change.kind,...payload.publication})
  return payload.publication
}
async function verifyReceipt(receipt) {
  const response=await fetch(`${base}/api/admin/publication-verify`,{method:'POST',headers:{authorization:'Bearer offline-runtime-token','Content-Type':'application/json'},body:JSON.stringify({checks:receipt.checks,englishPaths:receipt.plan.englishPaths})})
  const payload=await response.json(); refreshDiagnostics.push({kind:receipt.change.kind,verificationStatus:response.status,result:payload})
  return {status:response.status,...payload}
}
async function waitFor(kind,expected,stage) {
  let result
  for(let i=0;i<8;i++) {
    result=await get(paths[kind],stage)
    if(expected(result)) return result
    await new Promise(resolve=>setTimeout(resolve,100))
  }
  assert.ok(expected(result),`${kind}: state not observed without TTL wait (${JSON.stringify({...result,body:undefined})})`)
}
async function guideCacheDiagnostics() {
  const entries=[]
  for(const file of await readdir('.next/cache/fetch-cache')) {
    try {
      const data=await json(`.next/cache/fetch-cache/${file}`)
      if(data.kind==='FETCH' && data.tags?.includes('guides')) {
        const value=JSON.parse(data.data.body)
        entries.push({key:file,tags:data.tags,firstTitle:Array.isArray(value)?value[0]?.title:value.guides?.[0]?.title,
          mtime:(await stat(`.next/cache/fetch-cache/${file}`)).mtimeMs})
      }
    } catch { /* Unrelated binary payloads are not part of this diagnostic. */ }
  }
  const manifest=await json('.next/cache/fetch-cache/tags-manifest.json')
  return {entries,guideTag:manifest.items?.guides,routeTag:manifest.items?.[`_N_T_${paths.guide}`]}
}
async function cacheFiles(dir) {
  const files={}
  for(const entry of await readdir(dir,{withFileTypes:true}).catch(()=>[])) {
    const file=path.join(dir,entry.name)
    if(entry.isDirectory()) Object.assign(files,await cacheFiles(file))
    else { const info=await stat(file); files[file]={bytes:info.size,mtime:info.mtimeMs} }
  }
  return files
}
async function restartCacheEvidence() {
  const pages = {}
  for (const [kind,url] of Object.entries(paths)) {
    pages[kind] = {}
    for (const suffix of ['.html','.rsc','.meta']) {
      const file = `.next/server/app${url}${suffix}`
      try { const bytes=await readFile(file);const info=await stat(file);pages[kind][suffix]={bytes:bytes.length,mtime:info.mtimeMs,sha256:createHash('sha256').update(bytes).digest('hex')} } catch {pages[kind][suffix]=null}
    }
  }
  return { pages, data:await cacheFiles('.next/cache/fetch-cache') }
}
try {
  await start()
  for(const kind of Object.keys(paths)) await check(`${kind} first generation and HIT`,async()=>{
    await refresh(kind)
    const first=await get(paths[kind],'cold')
    assert.equal(first.status,200)
    assert.equal(first.cache,'MISS')
    assert.match(first.cacheControl || '',/s-maxage=3600/)
    const hit=await waitFor(kind,r=>r.cache==='HIT','warm')
    assert.equal(hit.status,200)
  })
  await check('hidden Spot overrides warmed page immediately',async()=>{
    state.spots[0].publication_status='hidden';await syncState()
    const hidden=await get(paths.spot,'hidden')
    assert.equal(hidden.status,404);assert.equal(hidden.indexable,'false');assert.match(hidden.robots || '',/noindex/)
    state.spots[0].publication_status='published';await syncState()
  })
  await check('old alias redirects live before a warmed page',async()=>{
    const previousType=state.spots[0].redirect_type
    state.spots[0].redirect_url=`/notes/${noteSlug}`;state.spots[0].redirect_type=301;await syncState()
    const redirect=await get('/spot/old-alias-449','redirect')
    assert.equal(redirect.status,301);assert.ok(redirect.location?.endsWith(`/notes/${noteSlug}`));assert.equal(redirect.indexable,'false')
    delete state.spots[0].redirect_url
    if(previousType===undefined)delete state.spots[0].redirect_type;else state.spots[0].redirect_type=previousType
    await syncState()
  })
  await check('routing outage fails closed despite warm fallback',async()=>{
    state.failRouting=true;await syncState()
    const denied=await get(paths.spot,'outage')
    assert.equal(denied.status,503);assert.match(denied.robots || '',/noindex/)
    state.failRouting=false;await syncState()
  })
  // The Note refresh above also invalidates Guides that render related notes.
  // Settle every dependency before measuring restart; otherwise a Guide MISS
  // conflates explicit invalidation during setup with a cold-process defect.
  for(const kind of Object.keys(paths)) await waitFor(kind,r=>r.cache==='HIT','before-restart')
  await new Promise(resolve=>setTimeout(resolve,1200)) // exceed Next's missing-timing fallback of 1s, not the 3600s application TTL
  restartEvidence.before=await restartCacheEvidence()
  const restartCdnCalls=cdnCalls.length
  await stop();await start()
  restartEvidence.afterStart=await restartCacheEvidence()
  for(const kind of Object.keys(paths)) await check(`${kind} Next 14 cold-process STALE is bounded and version-stable`,async()=>{
    const response=await get(paths[kind],'restart')
    assert.equal(response.status,200)
    const previous=responses.filter(r=>r.stage==='before-restart' && r.url===paths[kind]).at(-1)
    assert.equal(response.version,previous.version)
    // Installed Next 14 next start loses runtime-generated timing (?? 1).
    // Observe normal SWR regeneration rather than requiring a fictional HIT.
    assert.equal(response.cache,'STALE')
    assert.equal(response.cacheControl,null)
    const recovered=await waitFor(kind,r=>r.cache==='HIT','restart-recovered')
    assert.equal(recovered.status,200);assert.equal(recovered.version,previous.version)
    assert.match(recovered.cacheControl || '',/s-maxage=3600/)
  })
  await check('restart preserves Data Cache; only cold Spot gate dependencies reload',async()=>{
    assert.deepEqual(restartEvidence.afterStart,restartEvidence.before)
    for(const kind of Object.keys(paths)) {
      const recovered=await waitFor(kind,r=>r.cache==='HIT','restart-recovered')
      assert.match(recovered.cacheControl || '',/s-maxage=3600/)
    }
    restartEvidence.cdnReads=cdnCalls.slice(restartCdnCalls)
    // The cold routing API separately resolves Spot details and localization.
    // Their module/process caches differ from the HTML cache. Guide/Note
    // collection Data Cache must survive and must not re-download content.
    assert.ok(restartEvidence.cdnReads.every(read=>/\/public-data\/(?:i18n\/en\/records\.json|spots\/)/.test(read.pathname)))
    assert.ok(restartEvidence.cdnReads.length<=3)
    restartEvidence.afterRecovery=await restartCacheEvidence()
  })
  await check('English Guide fixture is warm before publication',async()=>{
    assert.equal((await get(`/en${paths.guide}`,'english-before')).status,200)
    assert.equal((await get(`/en${paths.guide}`,'english-before-hit')).cache,'HIT')
  })
  for(const kind of Object.keys(paths)) await check(`${kind} explicit refresh shows new source without TTL wait`,async()=>{
    const marker=`OFFLINE_ACCEPTANCE_${kind.toUpperCase()}`
    if(kind==='guide') collections.guides[0].title=marker
    if(kind==='note') collections.notes.find(note=>note.slug===noteSlug).title=marker
    if(kind==='spot') {state.spots[0].description=marker;await syncState()}
    const receipt=await refresh(kind)
    try {
      await waitFor(kind,r=>r.status===200 && r.body.includes(marker),'refreshed')
    } finally {
      // Diagnose AFTER the HTML assertion. Warming the API first would hide a
      // publication ordering bug in the independently cached HTML renderer.
      if(kind==='guide') {
        const beforeApi=await guideCacheDiagnostics()
        const api=await get(`/api/guides?slug=${encodeURIComponent(guideSlug)}`,'refreshed-api')
        refreshDiagnostics.push({kind,status:api.status,title:JSON.parse(api.body).guide?.title,beforeApi})
      }
    }
    await waitFor(kind,r=>r.cache==='HIT','refreshed-hit')
    const ownChecks=receipt.checks.filter(check=>check.path.includes('slug=') || check.path===paths[kind] || check.path===`/en${paths[kind]}` || (kind==='spot' && (/^\/(?:en\/)?spot\/[^/]+-449$/.test(check.path) || check.path==='/api/spots/spot-449')))
    assert.ok(ownChecks.length>0,'Independent verification must not pass on an empty path selection')
    const verification=await fetch(`${base}/api/admin/publication-verify`,{method:'POST',headers:{authorization:'Bearer offline-runtime-token','Content-Type':'application/json'},body:JSON.stringify({checks:ownChecks})})
    assert.equal(verification.status,200,await verification.text())
  })
  await check('Guide publication also refreshes the warmed English detail',async()=>{
    const response=await get(`/en${paths.guide}`,'english-guide-after-publication')
    assert.equal(response.status,200)
    assert.ok(response.body.includes('OFFLINE_ACCEPTANCE_GUIDE'),'English Guide retained the old source after App Router publication')
  })
  await check('English Spot on-demand refresh bypasses all snapshot Maps and shows new source',async()=>{
    await refreshEnglishSpot()
    const alias=await get(`/en${paths.spot}`,'english-spot-refreshed-alias')
    // The retained collection snapshot and bundled custom-slug map deliberately
    // differ. Assert the actual canonical redirect, then verify its HTML.
    const publishedSlug=locations.locations.find(location=>location.id===449).slug
    assert.equal(alias.status,308)
    assert.equal(new URL(alias.location,base).pathname,`/en/spot/${publishedSlug}`)
    const response=await get(`/en/spot/${publishedSlug}`,'english-spot-refreshed')
    assert.equal(response.status,200)
    assert.ok(response.body.includes('OFFLINE_ACCEPTANCE_SPOT'))
  })
  for(const kind of ['guide','note']) {
    const key=kind==='guide'?'guides':'notes',existing=collections[key]
    if(kind==='note') await check('English Note fallback is warm before unpublish',async()=>{
      assert.equal((await get(`/en${paths.note}`,'english-note-before')).status,200)
      assert.equal((await get(`/en${paths.note}`,'english-note-before-hit')).cache,'HIT')
    })
    await check(`${kind} unpublish returns HTTP 404 after refresh`,async()=>{
      try {
        collections[key]=existing.filter(item=>item.slug!==(kind==='guide'?guideSlug:noteSlug))
        publicationStates.push({kind,slugs:collections[key].map(item=>item.slug)})
        await refresh(kind)
        const api=await get(`/api/${key}?slug=${encodeURIComponent(kind==='guide'?guideSlug:noteSlug)}`,'unpublished-api')
        assert.equal(api.status,404)
        const html=await waitFor(kind,r=>r.status===404,'unpublished')
        assert.equal(html.metaNoindex,true)
        assert.ok(!html.canonical?.endsWith(paths[kind]))
        const cached=await waitFor(kind,r=>r.status===404 && r.cache==='HIT','unpublished-hit')
        assert.equal(cached.metaNoindex,true)
        if(kind==='note') await check('Note unpublish also expires the warmed English fallback',async()=>{
          assert.equal((await get(`/en${paths.note}`,'english-note-unpublished')).status,404)
        })
      } finally { collections[key]=existing }
    })
    await check(`${kind} republish becomes available immediately`,async()=>{
      await refresh(kind);await waitFor(kind,r=>r.status===200 && !r.metaNoindex,'republished');await waitFor(kind,r=>r.cache==='HIT','republished-hit')
    })
  }
  await check('Spot hide and republish verify API, HTML and locale versions without waiting for TTL',async()=>{
    state.spots[0].publication_status='hidden';await syncState()
    const hidden=await refresh('spot')
    assert.equal((await verifyReceipt(hidden)).status,200)
    assert.equal((await get('/api/spots/spot-449','spot-hidden-api')).status,404)
    state.spots[0].publication_status='published';state.spots[0].description='OFFLINE_ACCEPTANCE_SPOT_REPUBLISHED';await syncState()
    const restored=await refresh('spot')
    assert.equal((await verifyReceipt(restored)).status,200)
    const html=await get(paths.spot,'spot-republished-version')
    assert.equal(html.status,200);assert.ok(html.version);assert.ok(html.body.includes('OFFLINE_ACCEPTANCE_SPOT_REPUBLISHED'))
  })
  await check('Spot stale published source fails the generic version read-back',async()=>{
    state.frozenSpot=structuredClone(state.spots[0]);state.freezePublicSpot=true
    state.spots[0].description='OFFLINE_ACCEPTANCE_SPOT_VERSION_AFTER';await syncState()
    const result=await verifyReceipt(await refresh('spot'))
    assert.equal(result.status,503);assert.ok(result.results.some(row=>!row.passed))
  })
  await check('Spot publication-only refresh recovers the submitted version',async()=>{
    state.freezePublicSpot=false;await syncState()
    assert.equal((await verifyReceipt(await refresh('spot'))).status,200)
    assert.ok((await get(paths.spot,'spot-version-recovered')).body.includes('OFFLINE_ACCEPTANCE_SPOT_VERSION_AFTER'))
  })
  for(const kind of ['price','widget','affiliate']) {
    const change=kind==='price'?{kind,priceSource:'highlights',slugs:[guideSlug]}:kind==='widget'?{kind,widgetIds:['rc-widget'],slugs:[noteSlug]}:{kind,ids:[9001]}
    await check(`${kind} stale HTML values fail independent verification despite successful invalidation`,async()=>{
      state.frozenAux=structuredClone({prices:state.prices,widgets:state.widgets,affiliates:state.affiliates});state.freezePublicAux=true
      if(kind==='price'){state.prices[0].amountMinor=23456;state.prices[0].titleZh='RC_PRICE_AFTER'}
      if(kind==='widget'){state.widgets[0].htmlCode='<div>RC_WIDGET_AFTER</div>';state.widgets[0].title='RC_WIDGET_AFTER'}
      if(kind==='affiliate'){state.affiliates[0].title='RC_AFFILIATE_AFTER';state.affiliates[0].url='https://booking.invalid/after'}
      await syncState()
      const receipt=await publication(change)
      assert.ok(receipt.checks.some(check=>check.values?.length),'Value-level HTML checks are required')
      const result=await verifyReceipt(receipt)
      assert.equal(result.status,503);assert.ok(result.results?.some(item=>!item.passed))
    })
    await check(`${kind} publication-only retry recovers current visible HTML values`,async()=>{
      state.freezePublicAux=false;await syncState()
      const result=await verifyReceipt(await publication(change))
      assert.equal(result.status,200,JSON.stringify(result))
      const html=await get(kind==='price'?paths.guide:paths.note,`rc-${kind}-recovered`)
      assert.ok(html.body.includes(`RC_${kind.toUpperCase()}_AFTER`))
      if(kind==='price') assert.ok(html.body.includes('234.56'))
    })
    await check(`${kind} removal/deactivation removes stale public values`,async()=>{
      if(kind==='price')state.prices=[]
      if(kind==='widget')state.widgets[0].isActive=false
      if(kind==='affiliate')state.affiliates[0].is_active=false
      await syncState()
      assert.equal((await verifyReceipt(await publication(change))).status,200)
      const html=await get(kind==='price'?paths.guide:paths.note,`rc-${kind}-removed`)
      const visible=html.body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
      assert.ok(!visible.includes(`RC_${kind.toUpperCase()}_AFTER`))
    })
  }
  const costChange={kind:'price',priceSource:'trip-cost',slugs:[guideSlug]}
  await check('Trip Cost stale HTML fails monetary value read-back',async()=>{
    state.frozenCosts=structuredClone(costs);state.freezePublicCost=true
    const cost=costs.tripCosts.find(row=>row.slug===guideSlug).tripCost
    cost.categories[0].amountCents+=200;cost.totalCents+=200
    cost.perPersonCents=cost.travellers?Math.round(cost.totalCents/cost.travellers):null
    await syncState()
    const result=await verifyReceipt(await publication(costChange))
    assert.equal(result.status,503);assert.ok(result.results.some(row=>!row.passed))
  })
  await check('Trip Cost publication-only retry restores the new total in both locales',async()=>{
    state.freezePublicCost=false;await syncState()
    assert.equal((await verifyReceipt(await publication(costChange))).status,200)
  })
  await check('Trip Cost hide removes the rendered budget and old total',async()=>{
    costs.tripCosts.find(row=>row.slug===guideSlug).tripCost={source:'hidden',currency:'RM',totalCents:0,travellers:null,perPersonCents:null,transactionCount:null,categories:[]}
    assert.equal((await verifyReceipt(await publication(costChange))).status,200)
    const html=await get(paths.guide,'trip-cost-hidden')
    assert.ok(!html.body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').includes('data-jnq-trip-total'))
  })
  await check('Sitemap repeat HIT performs no repeat provider or CDN reads',async()=>{
    const first=await get('/sitemap.xml','sitemap-first')
    assert.equal(first.status,200)
    const providers=await readFile(`${fixtureFile}.requests.jsonl`,'utf8'),count=cdnCalls.length
    const hit=await get('/sitemap.xml','sitemap-hit')
    assert.equal(hit.cache,'HIT')
    assert.equal(await readFile(`${fixtureFile}.requests.jsonl`,'utf8'),providers)
    assert.equal(cdnCalls.length,count)
  })
  await check('warm reads do not repeatedly write page or fetch cache files',async()=>{
    for(const kind of Object.keys(paths)) await waitFor(kind,r=>r.cache==='HIT','stable')
    const before={...await cacheFiles('.next/server/app'),...await cacheFiles('.next/cache/fetch-cache')}
    const initialCdnCalls=cdnCalls.length
    const priorReads=(await readFile(`${fixtureFile}.requests.jsonl`,'utf8')).trim().split('\n').filter(Boolean).length
    for(let i=0;i<3;i++) for(const kind of Object.keys(paths)) assert.equal((await get(paths[kind],'repeat')).cache,'HIT')
    const after={...await cacheFiles('.next/server/app'),...await cacheFiles('.next/cache/fetch-cache')}
    assert.deepEqual(after,before)
    assert.equal(cdnCalls.length,initialCdnCalls)
    const reads=(await readFile(`${fixtureFile}.requests.jsonl`,'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line))
    warmProviderReads=reads.slice(priorReads)
    assert.equal(warmProviderReads.length,3) // one live visibility read per Spot request
    assert.ok(warmProviderReads.every(read=>read.method==='GET' && read.pathname==='/rest/v1/locations'))
  })
} finally {
  await stop();await new Promise(resolve=>cdn.close(resolve))
  await writeFile(`${out}/runtime-summary.json`,JSON.stringify({checks,responses,cdnCalls,warmProviderReads,publicationStates,restartEvidence,refreshDiagnostics,publicationReceipts,scope:'Actual local Next handlers/readers; synthetic Auth/PostgREST and loopback CDN only. No production requests or writes.'},null,2))
  await writeFile(`${out}/runtime-server.log`,serverLog)
  console.log(JSON.stringify({checks,passed:checks.filter(x=>x.passed).length,total:checks.length},null,2))
  if(checks.some(x=>!x.passed)) process.exitCode=1
}
