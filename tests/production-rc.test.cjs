const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {execFileSync}=require('node:child_process')
const {NextRequest}=require('next/server')
const {loader}=require('./helpers/spot-travel-loader.cjs')
const read=file=>fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n')
function persistentCache(){const values=new Map();return { unstable_cache:(fn,key,options)=>(...args)=>{
  const id=JSON.stringify([key,args]);if(values.has(id))return values.get(id).value
  const value=Promise.resolve().then(()=>fn(...args));values.set(id,{value,tags:options.tags});value.catch(()=>values.delete(id));return value
},expire:tag=>{for(const [key,entry]of values)if(entry.tags.includes(tag))values.delete(key)}}}

test('formal fonts, maps, WhatsApp, English rendering and specialty packages match main exactly',()=>{
  for(const file of ['app/layout.tsx','pages/_app.tsx','app/globals.css','components/MapView.tsx','components/WhatsAppButton.tsx','components/EnglishRouteAdapter.tsx',
    'components/HainanPackagesHub.tsx','components/BatamPackageDetail.tsx','app/packages/hainan/page.tsx','app/packages/hainan/[optionSlug]/page.tsx',
    'app/packages/[slug]/[optionSlug]/page.tsx','lib/spot-quality.ts','lib/server/travel-packages.ts','data/travel-packages-snapshot.json','data/spot-routing-snapshot.json']){
    const expected=execFileSync('git',['show',`bd656882c4eb13ad8a0a372ec84daf6100f4d608:${file}`],{encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true}).replace(/^\uFEFF/,'').replace(/\r\n/g,'\n')
    assert.equal(read(file),expected,file)
  }
  for(const dir of ['app','components','lib','pages']) {
    const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):[path.join(p,e.name)])
    for(const file of walk(dir).filter(p=>/\.(ts|tsx)$/.test(p)))assert.doesNotMatch(read(file),/rnamstwwbzknwbjwdgrf|preview-fixtures|preview-system-fonts|JNQ_PREVIEW_SUPABASE_PROJECT_REF/,file)
  }
})

test('Guide and Note selections share one collection read and failed CDN reads are retryable',async()=>{
  const cache=persistentCache();let reads=0,fail=false
  const load=loader({'next/cache':cache,react:{cache:fn=>fn},
    '@/lib/server/guides-store':{normalizeGuidePayload:x=>x,readGuides:()=>assert.fail('No stale collection fallback')},
    '@/lib/server/notes-store':{normalizeNotePayload:x=>x,readPublishedNotes:()=>assert.fail('No stale collection fallback')},
  },{process:{env:{PUBLIC_DATA_CDN_BASE_URL:'https://public.invalid'},cwd:process.cwd},fetch:async input=>{
    reads++;if(fail)return new Response('unavailable',{status:503})
    return new Response(JSON.stringify(String(input).includes('guides.json')?{schemaVersion:1,guides:[{slug:'a',title:'A'},{slug:'b',title:'B'}]}:{schemaVersion:1,notes:[{slug:'n',title:'N',published:true}]}))
  }})
  const store=load('lib/server/public-content-store.ts')
  assert.equal((await store.readPublicGuideBySlug('a')).title,'A');assert.equal((await store.readPublicGuideBySlug('b')).title,'B')
  await store.readPublicGuides();assert.equal(reads,1)
  await store.readPublicNoteBySlug('n');await store.readPublicNotes();assert.equal(reads,2)
  cache.expire('guides');fail=true;await assert.rejects(store.readPublicGuides(),/unavailable/)
  fail=false;assert.equal((await store.readPublicGuides()).length,2);assert.equal(reads,4)
})

test('Spot aliases share payload/quality work; publication tag forces a fresh read',async()=>{
  const cache=persistentCache();let requests=0,scores=0
  const spot={id:41,slug:'real-41',name:'Real',publication_status:'published',latitude:1,longitude:1}
  const store=loader({'next/cache':cache,react:{cache:fn=>fn},
    '@supabase/supabase-js':{createClient:()=>assert.fail('Redundant Supabase read')},
    '@/lib/spot-quality':{evaluateSpotQuality:()=>{scores++;return {indexable:true,score:7}}},
    './public-fallback-snapshot':{readFallbackSpot:()=>assert.fail('Unexpected fallback')},
  },{process:{env:{PUBLIC_DATA_CDN_BASE_URL:'https://public.invalid'},cwd:process.cwd},fetch:async input=>{
    requests++;return new Response(JSON.stringify(String(input).endsWith('index.json')?{schemaVersion:1,slugs:['real-41']}:{schemaVersion:1,spot}))
  }})('lib/server/public-spot-resolver.ts')
  assert.equal((await store.getPublicSpotBySlug('alias-41')).spot.id,41)
  assert.equal((await store.getPublicSpotBySlug('other-41')).spot.id,41)
  assert.equal(requests,2);assert.equal(scores,1)
  cache.expire('public-spots');await store.getPublicSpotBySlug('alias-41')
  assert.equal(requests,4);assert.equal(scores,2)
  assert.equal(await store.getPublicSpotBySlug('withdrawn-450'),null)
})

test('Spot middleware uses one routing request, hides rows, redirects aliases and fails closed',async()=>{
  let calls=0,state='visible'
  const next=loader({'@/lib/server/package-visibility':{packageVisibility:()=>204}}, {fetch:async()=>{
    calls++;if(state==='error')return new Response('failed',{status:503})
    return Response.json(state==='hidden'?{visible:false}:state==='redirect'?{visible:false,destination:'/spot/current-41',status:301}:{visible:true},{headers:{'X-JNQ-SEO-Indexable':'false'}})
  }})('middleware.ts').middleware
  const request=new NextRequest('https://jnq.test/spot/real-41')
  const response=await next(request);assert.equal(response.status,200);assert.match(response.headers.get('x-robots-tag'),/noindex/);assert.equal(calls,1)
  state='hidden';assert.equal((await next(request)).status,404)
  state='redirect';assert.equal((await next(request)).status,301)
  state='error';assert.equal((await next(request)).status,503)
})

test('Package guard has zero self-requests and preserves Hainan and legacy redirects',async()=>{
  let reads=0,status=204
  const middleware=loader({'@/lib/server/package-visibility':{packageVisibility:()=>{reads++;return status}}},{fetch:()=>assert.fail('Package self-request')})('middleware.ts').middleware
  assert.equal((await middleware(new NextRequest('https://jnq.test/packages/hainan/special'))).status,200);assert.equal(reads,0)
  assert.equal((await middleware(new NextRequest('https://jnq.test/packages/tioman-aman-resort-3d2n'))).status,308)
  const req=new NextRequest('https://jnq.test/packages/item/option')
  assert.equal((await middleware(req)).status,200);assert.equal(reads,1)
  status=404;assert.equal((await middleware(req)).status,404)
  status=503;assert.equal((await middleware(req)).status,503)
})

test('Package visibility prefers authoritative unpublished state and uses only verified outage backup',async()=>{
  let response='found',requests=0
  const snapshot=JSON.parse(read('data/travel-packages-snapshot.json'))
  const slug=snapshot.packages.find(p=>p.status==='published').slug
  const {packageVisibility}=loader({}, {process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://synthetic.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic'}},fetch:async(input,init)=>{
    requests++;assert.equal(new URL(input).searchParams.get('select'),'id');assert.ok(init.signal);assert.equal(init.cache,'no-store')
    if(response==='error')return new Response('unavailable',{status:503})
    return Response.json(response==='found'?[{id:1}]:response==='malformed'?{}:[])
  }})('lib/server/package-visibility.ts')
  assert.equal(await packageVisibility(slug),204)
  response='missing';assert.equal(await packageVisibility(slug),404)
  response='error';assert.equal(await packageVisibility(slug),204);assert.equal(await packageVisibility('unreviewed-package'),503)
  response='malformed';assert.equal(await packageVisibility(slug),503);assert.equal(requests,5)
})

test('withdrawn ID 450 cannot enter routing, English paths, fallback payload or sitemap',async()=>{
  const load=loader({'@supabase/supabase-js':{createClient:()=>assert.fail('Withdrawn ID must short circuit')}})
  assert.deepEqual(await load('lib/server/spot-routing.ts').readSpotRouting(450),{visible:false})
  assert.equal((await load('lib/server/public-fallback-reader.ts').readFallbackSpot(450)).status,'not-found')
  const snapshot=JSON.parse(read('public-data/fallback/2026-10-30.json'))
  assert.ok(snapshot.withdrawnIds.includes(450));assert.ok(!snapshot.locations.some(p=>p.id===450));assert.ok(!snapshot.spots['450'])
  assert.match(read('lib/server/public-location-data.ts'),/Number\(location.id\) !== 450/)
  assert.match(read('pages/en/[[...path]].tsx'),/id !== 450/)
})

test('ISR caches remain bounded and main publication handlers invalidate their dependencies',()=>{
  for(const [file,pattern]of [
    ['app/guide/[slug]/page.tsx',/revalidate\s*=\s*3600/],['app/notes/[slug]/page.tsx',/revalidate\s*=\s*3600/],['app/packages/[slug]/page.tsx',/revalidate\s*=\s*3600/],
    ['lib/server/spot-publication.ts',/revalidateTag\('public-spots'\)/],['app/api/admin/location-slugs/route.ts',/revalidateTag\(PUBLIC_LOCATION_SLUGS_TAG\)/],
    ['app/api/admin/travel-packages/route.ts',/revalidatePath\('\/packages\/\[slug\]', 'page'\)/],['app/api/admin/travel-package-options/route.ts',/revalidatePath\('\/packages\/\[slug\]', 'page'\)/],
  ])assert.match(read(file),pattern,file)
  assert.match(read('pages/en/[[...path]].tsx'),/await import\('@\/lib\/server\/english-page-data'\)/)
  assert.doesNotMatch(read('pages/en/[[...path]].tsx'),/import \{[^\n]*englishPageData[^\n]*\} from/)
})
