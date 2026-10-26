import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import { planPublication, validPublicationPath } from '../lib/publication-plan.ts'
import { mutationOutcome } from '../lib/mutation-outcome.ts'
import { spotPublicationVersion } from '../lib/publication-version.ts'
import { publicSpotFromSupabaseRow } from '../lib/public-spot.ts'
import { verifyHtmlValues } from '../lib/publication-html.ts'
const require=createRequire(import.meta.url)
const React=require('react'), {renderToStaticMarkup}=require('react-dom/server')
function load(file:string,mocks:Record<string,any>,globals:Record<string,any>={}) {
  const ctx={exports:{} as any,process,console,Buffer,URL,Request,Response,Headers,AbortSignal,setTimeout,clearTimeout,...globals,
    require:(name:string)=>name in mocks?mocks[name]:name==='@/lib/internal-http'?require('../lib/internal-http.ts'):name.startsWith('@/')?(()=>{throw Error(`Missing mock ${name}`)})():require(name)}
  vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,ctx)
  return ctx.exports
}
test('mutation receipts reject missing/duplicate/unexpected write responses and distinguish exact outcomes',()=>{
  assert.equal(mutationOutcome([1,2],[{id:1},{id:2}]).state,'complete')
  assert.equal(mutationOutcome([1,2],[{id:1}]).state,'partial')
  assert.deepEqual(mutationOutcome([1,2],[{id:1}]).missingIds,[2])
  assert.equal(mutationOutcome([1,2],[]).state,'failed')
  for(const rows of [null,[{id:1},{id:1}],[{id:9}],[{id:'invalid'}]]) assert.equal(mutationOutcome([1,2],rows).state,'unknown')
})
test('Spot content fingerprints change with any source field and are shared by locale/alias',()=>{
  const source={id:1,slug:'old-1',name:'Spot',description:'before',publication_status:'published',price_info:{fee:1},seo_title_en:'Old'}
  const version=spotPublicationVersion(source)
  assert.equal(spotPublicationVersion({...source,slug:'new-1',title:'Translated'}),version)
  for(const field of ['description','publication_status','price_info','seo_title_en']) assert.notEqual(spotPublicationVersion({...source,[field]:'changed'}),version)
  const raw={...source,name_cn:'',status:'active',updated_at:'not-public',description:' before ',latitude:'1.2',longitude:'2.3'}
  const dto=publicSpotFromSupabaseRow(raw,{slug:'published-1',region:null} as any)
  assert.equal(spotPublicationVersion(raw),spotPublicationVersion(dto as any))
})
test('HTML value assertions reject stale visible amounts and RSC-only evidence; escaped values round trip',()=>{
  const value={attribute:'data-jnq-price-amount',value:'MYR:12345',text:'MYR 123.45'}
  assert.equal(verifyHtmlValues('<script>data-jnq-price-amount="MYR:12345" MYR 123.45</script>',[value]),false)
  assert.equal(verifyHtmlValues('<span data-jnq-price-amount="MYR:12345">MYR 99.00</span>',[value]),false)
  assert.equal(verifyHtmlValues('<span data-jnq-price-amount="MYR:12345">MYR 123.45</span>',[value]),true)
  assert.equal(verifyHtmlValues('<section data-jnq-widget-code="&lt;b&gt;A&amp;B&lt;/b&gt;"></section>',[{attribute:'data-jnq-widget-code',value:'<b>A&B</b>'}]),true)
})
test('real widget SSR exposes the new code as escaped configuration and renders its new title',()=>{
  const Widget=load('components/KlookWidgetEmbed.tsx',{}).default
  const html=renderToStaticMarkup(React.createElement(Widget,{code:'<div data-test="new">RC widget</div>',title:'RC updated title',description:'new description'}))
  assert.ok(html.includes('RC updated title'));assert.ok(html.includes('new description'))
  assert.ok(verifyHtmlValues(html,[{attribute:'data-jnq-widget-code',value:'<div data-test="new">RC widget</div>'}]))
  assert.ok(!html.includes('<div data-test="new">')) // third-party execution remains a browser/preview check
})
test('R2 faults after each object preserve old scope, never invalidate early, and publication-only retry converges',async()=>{
  const faultEvidence:any[]=[]
  for(const failAt of [1,2,3]) {
    let attempt=0,fail=true;const events:string[]=[],objects=new Map<string,any>()
    const old={id:1,name:'One',slug:'old-1',region:{id:10}}, next={...old,slug:'new-1',region:{id:20}}
    const data={locations:[old,{id:2,name:'Old neighbour',slug:'neighbour-2',region:{id:10}}],regions:[{id:10,slug:'old-10'},{id:20,slug:'new-20'}]}
    let currentData=data
    const put=async(key:string,bytes:Buffer)=>{ attempt++;events.push(`put:${key}`);if(fail&&attempt===failAt)throw Error('Injected R2 failure');objects.set(key,JSON.parse(bytes.toString()));if(key==='locations.json')currentData={...data,locations:objects.get(key).locations} }
    const publisher=load('lib/server/publish-location-batch.ts',{
      'next/cache':{revalidateTag:(s:string)=>events.push(`tag:${s}`),revalidatePath:(s:string)=>events.push(`path:${s}`)},
      '@/lib/server/public-data-resolver':{resolvePublicData:async()=>currentData,resolvePublicSnapshotBundleUncached:async()=>({data:{...data,locations:[next]},spots:[{id:1,name:'One'}]})},
      '@/lib/server/public-content-store':{readPublicGuides:async()=>[],readPublicNotes:async()=>[]},
      '@/lib/publication-plan':{planPublication},'@/lib/server/location-slugs-store':{readLocationSlugMap:async()=>({}),buildCanonicalLocationPath:async()=>'/spot/new-1'},
      '@/lib/server/r2':{uploadPublicSpotSnapshot:(s:string,b:Buffer)=>put(`spots/${s}`,b),uploadPublicDataSnapshot:put,uploadPublicSpotIndex:(b:Buffer)=>put('index',b)},
    })
    let failure:any
    try{await publisher.publishLocationBatch([1]);assert.fail('Expected injected failure')}catch(error){failure=error}
    assert.equal(failure.stage,'snapshot');assert.equal(failure.completed.length,failAt-1)
    assert.ok(failure.change.previousPaths.includes('/spot/old-1'));assert.ok(failure.change.previousPaths.includes('/spot/neighbour-2'))
    assert.ok(!events.some(s=>s.startsWith('tag:')||s.startsWith('path:')))
    fail=false;events.length=0;attempt=0
    let recovered:any
    const route=load('app/api/admin/public-data/spots/batch/route.ts',{
      '@/lib/server/admin-auth':{requireAdminRequest:async()=>({ok:true})},'@/lib/server/publish-location-batch':publisher,'@/lib/publication-plan':{validPublicationPath},
      '@/lib/server/publication':{invalidatePublication:async(_r:any,change:any)=>{recovered=change;return{}},publicationResponse:(value:any)=>Response.json(value),publicationFailure:()=>assert.fail('Recovery must succeed')},
    })
    assert.equal((await route.POST(new Request('http://localhost/api/admin/public-data/spots/batch',{method:'POST',body:JSON.stringify(failure.change)}))).status,200)
    assert.ok(recovered.previousPaths.includes('/spot/old-1'));assert.ok(recovered.previousEnglishPaths.includes('/en/spot/neighbour-2'))
    assert.equal(objects.get('locations.json').locations[0].slug,'new-1');assert.deepEqual(objects.get('index').slugs,['new-1'])
    assert.ok(events.findIndex(s=>s.startsWith('tag:'))>events.indexOf('put:index'))
    faultEvidence.push({failedObject:failAt,completedBeforeFailure:[...failure.completed],retryStatus:200,preservedOldPaths:recovered.previousPaths,preservedEnglishPaths:recovered.previousEnglishPaths,finalIndex:objects.get('index').slugs,invalidationAfterIndex:true})
  }
  if(process.env.JNQ_OFFLINE_OUTPUT)writeFileSync(`${process.env.JNQ_OFFLINE_OUTPUT}/r2-fault-evidence.json`,JSON.stringify({runAt:new Date().toISOString(),cases:faultEvidence},null,2))
})
test('content-only Spot invalidation does not invalidate the global index or unrelated ID caches',()=>{
  const locations=[{id:1,name:'One',slug:'one-1',region:null},{id:2,name:'Two',slug:'two-2',region:null}] as any
  const catalog={locations,previousLocations:locations,regions:[],guides:[],notes:[]}
  const plan=planPublication({kind:'spot',ids:[1]},catalog)
  assert.ok(!plan.tags.includes('public-spots'));assert.ok(!plan.tags.includes('public-spot:spot-2'));assert.ok(!plan.paths.includes('/spot/two-2'))
  assert.ok(planPublication({kind:'spot',ids:[1]},{...catalog,locations:[locations[1]]}).tags.includes('public-spots'))
  const reader=readFileSync('lib/server/public-spot-resolver.ts','utf8')
  assert.match(reader,/tags: \[`public-spot:\$\{identity\}`\]/)
  const base={locations:[],regions:[],guides:[],notes:[]}
  const price=planPublication({kind:'price',priceSource:'highlights',slugs:['g']},base)
  assert.ok(price.tags.includes('guide-price-highlights'));assert.ok(!price.tags.includes('guide-trip-costs'))
  const budget=planPublication({kind:'price',priceSource:'trip-cost',slugs:['g']},base)
  assert.ok(!budget.tags.includes('guide-price-highlights'));assert.ok(budget.tags.includes('guide-trip-cost:g'))
  const affiliate=planPublication({kind:'affiliate',ids:[7]},base)
  assert.ok(affiliate.tags.includes('affiliate-link:7'));assert.ok(!affiliate.tags.includes('affiliate-link:8'))
})

test('Pages failure after writer commit stays partial; an independent publication retry can recover',async()=>{
  let fail=true,readbacks=0;const calls:string[]=[]
  const endpoint=load('app/api/admin/publication-verify/route.ts',{
    '@/lib/server/admin-auth':{requireAdminRequest:async()=>({ok:true})},
    '@/lib/server/publication':{publicationOrigin:()=> 'http://localhost',verifyPublication:async()=>{readbacks++;return{ok:true,results:[{passed:true}]}},readPublicationCatalog:async()=>({locations:[],regions:[],guides:[],notes:[]})},
    '@/lib/publication-plan':{validPublicationPath,planPublication},'@/lib/server/publication-values':{publicationValueChecks:async()=>[]},
  },{fetch:async(url:string)=>{calls.push(url);return Response.json({ok:!fail},{status:fail?503:200})}})
  const request=()=>new Request('http://localhost/api/admin/publication-verify',{method:'POST',body:JSON.stringify({checks:[{path:'/guide/g',status:200}],englishPaths:['/en/guide/g']})})
  assert.equal((await endpoint.POST(request())).status,503);assert.equal(readbacks,0)
  fail=false;assert.equal((await endpoint.POST(request())).status,200);assert.equal(readbacks,1)
  assert.deepEqual(calls,['http://localhost/api/admin/publication-revalidate','http://localhost/api/admin/publication-revalidate'])
  const noConsumer=await endpoint.POST(new Request('http://localhost/api/admin/publication-verify',{method:'POST',body:JSON.stringify({checks:[],sourceOnly:{kind:'widget',widgetIds:['unbound']}})}))
  assert.equal((await noConsumer.json()).coverage,'no-html-consumers');assert.equal(calls.length,2)
})

test('highlight and total-cost verification read only the changed source, without coupling unrelated availability',async()=>{
  let priceReads=0,costReads=0
  const values=load('lib/server/publication-values.ts',{
    '@supabase/supabase-js':{},'@/lib/server/guide-price-highlights-store':{readPublicationPriceHighlights:async()=>{priceReads++;return[]}},
    '@/lib/server/klook-widgets-store':{},'@/lib/guide-price-highlights':{},'@/lib/guide-budget':{normalizePublicGuideTripCost:(value:any)=>value},
  },{fetch:async()=>{costReads++;return Response.json({schemaVersion:1,tripCosts:[{slug:'g',tripCost:{source:'hidden',totalCents:0}}]})}})
  const catalog:any={guides:[{slug:'g'}]},plan:any={paths:['/guide/g']}
  const highlight=await values.publicationValueChecks({kind:'price',priceSource:'highlights'},catalog,plan)
  assert.equal(priceReads,1);assert.equal(costReads,0);assert.equal(highlight[0].values[0].attribute,'data-jnq-prices')
  const budget=await values.publicationValueChecks({kind:'price',priceSource:'trip-cost'},catalog,plan)
  assert.equal(priceReads,1);assert.equal(costReads,1);assert.equal(budget[0].values[0].attribute,'data-jnq-trip-cost')
})

test('real Storage SDK read-back preserves authentication Headers and separates ISR/fresh fetch options',async()=>{
  const requests:Array<{path:string;cache:unknown;fresh:string|null}>=[]
  const globals={process:{cwd:()=>process.cwd(),env:{NEXT_PUBLIC_SUPABASE_URL:'https://storage-test.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture'}},fetch:async(input:any,init:any)=>{
    const request=new Request(input,init)
    assert.equal(request.headers.get('apikey'),'fixture');assert.equal(request.headers.get('authorization'),'Bearer fixture')
    requests.push({path:new URL(request.url).pathname,cache:init.cache,fresh:request.headers.get('X-JNQ-Publication-Read')})
    return new Response(request.url.includes('latest.webp')?'_system/klook-widgets/fixture.webp':'[]')
  }}
  const price=load('lib/server/guide-price-highlights-store.ts',{'@supabase/supabase-js':require('@supabase/supabase-js'),'@/lib/guide-price-highlights':{toPublicGuidePriceHighlight:(value:any)=>value}},globals)
  assert.equal((await price.readPublicationPriceHighlights('g')).length,0)
  const widget=load('lib/server/klook-widgets-store.ts',{'@supabase/supabase-js':require('@supabase/supabase-js'),'next/cache':{unstable_cache:(fn:any)=>fn}},globals)
  assert.equal((await widget.readPublicationWidgets()).length,0)
  assert.equal((await widget.readKlookWidgets()).length,0)
  assert.ok(requests.slice(0,3).every(r=>r.cache==='no-store'&&r.fresh==='authoritative'))
  assert.ok(requests.slice(3).every(r=>r.cache!=='no-store'&&r.fresh===null))
  assert.equal(requests.length,5) // pointer then immutable object; no Storage list
})
