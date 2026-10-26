import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import { cleanSpotEditorialDraft, spotContentIssues } from '../lib/spot-content-quality.ts'
import { packageHeadlinePrice, optionPrice, packageCanonicalUrl, packageUploadCountry } from '../lib/package-presentation.ts'
import { buildWhatsAppMessage, buildWhatsAppUrl } from '../lib/whatsapp.ts'
import { spotSeo } from '../lib/spot-content.ts'
const require=createRequire(import.meta.url),React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
function load(file:string,mocks:Record<string,any>,globals:Record<string,any>={}) {
  const ctx={exports:{} as any,process,console,URL,Request,Response,Headers,Buffer,AbortSignal,setTimeout,clearTimeout,...globals,
    require:(id:string)=>id in mocks?mocks[id]:id==='@/lib/package-presentation'?require('../lib/package-presentation.ts'):id==='@/lib/internal-http'?require('../lib/internal-http.ts'):id.startsWith('@/')?(()=>{throw Error(`Missing ${id}`)})():require(id)}
  vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,ctx)
  return ctx.exports
}
const option=(id:number,patch:any={})=>({id,package_id:1,slug:`option-${id}`,name_zh:`方案 ${id}`,accommodation_name:'既有住宿',price_from:800,price_currency:'MYR',price_unit:'person',price_display:'MYR 800 起',included_items:['既有项目'],excluded_items:['未包含项目'],notes:['以最终确认为准'],source_code:`SOURCE-${id}`,whatsapp_message:'你好，想了解行程。',validity_label:'以现有报价为准',gallery:[{url:'https://media.invalid/poster.jpg'}],sort_order:id,status:'active',...patch})
const parent=()=>({id:1,slug:'hainan-5d4n',title_zh:'海南主配套',destination:'海南',region_id:9,status:'published',short_description:'既有海南路线',cover_image:'https://media.invalid/cover.jpg',itinerary_days:[{title:'原行程'}],price_note:'请确认最新报价',source_code:'HAINAN',whatsapp_message:'海南询价',gallery:[],included_items:[],excluded_items:[]})

test('editorial cleanup removes exact duplicates/wrappers without rewriting experiences, headings, quotes or code',()=>{
  const actual='我们在雨天到访，保留当天的真实体验。'
  assert.equal(cleanSpotEditorialDraft(`${actual}\n\n${actual}`),actual)
  assert.equal(cleanSpotEditorialDraft(`以下是为你整理的介绍：\n\n${actual}`),actual)
  for(const value of [`## 体验\n\n${actual}\n\n## 体验\n\n另一段独有体验。`,`> 原话\n\n> 原话`,'```\n重复\n\n重复\n```'])assert.equal(cleanSpotEditorialDraft(value),value)
  assert.ok(spotContentIssues('作为AI，我没有旅行体验。').some(x=>x.includes('AI')))
  assert.equal(cleanSpotEditorialDraft(actual),actual)
})
test('SEO falls through empty rich description to real review and avoids untranslated English fallback',()=>{
  const review='这是一段已经记录的真实旅行体验，包含当日实际观察与路线。'
  assert.equal(spotSeo({name:'Actual',description:'<p> </p>',review},'zh').description,review)
  assert.ok(spotSeo({name:'Actual',description:review.repeat(2)},'en').description.startsWith('Explore Actual'))
  assert.equal(spotSeo({name:'Actual',seo_description_en:'Approved English description',description:review},'en').description,'Approved English description')
})
test('prices never compare rooms with people or silently convert currencies; zero and unknown remain distinct',()=>{
  assert.equal(packageHeadlinePrice({price_display:'请询价'},[option(1,{price_from:999,price_display:'MYR 999'}),option(2,{price_unit:'room',price_from:1})]).text,'MYR 999')
  assert.equal(packageHeadlinePrice({price_display:'主配套说明'},[option(1),option(2,{price_currency:'CNY'})]).text,'主配套说明')
  assert.equal(optionPrice(option(1,{price_display:'',price_from:null})),'请查询最新报价')
  assert.equal(optionPrice(option(1,{price_display:'',price_from:0})),'MYR 0 起')
  assert.equal(packageUploadCountry('海南','hainan-5d4n'),'China');assert.equal(packageUploadCountry('Batam','batam-3d2n'),'Indonesia')
})
test('package canonical keeps its own URL and strips noise without trusting external or script origins',()=>{
  for(const canonical_url of ['javascript:alert(1)','https://other.invalid/packages/hainan-5d4n','/packages/other','//other.invalid'])assert.equal(packageCanonicalUrl({slug:'hainan-5d4n',canonical_url},'https://site.invalid'),'https://site.invalid/packages/hainan-5d4n')
  assert.equal(packageCanonicalUrl({slug:'hainan-5d4n',canonical_url:'/packages/hainan-5d4n/?utm=1#price'},'https://site.invalid'),'https://site.invalid/packages/hainan-5d4n')
})
test('WhatsApp preserves supplier text and appends option/source once, with safe URL encoding',()=>{
  const opts={pageType:'package' as const,packageName:'海南',optionName:'舒适 A & B',source:'HAINAN-A',message:'保留供应商原文。'}
  const text=buildWhatsAppMessage(opts);assert.ok(text.startsWith(opts.message));assert.ok(text.includes('方案：舒适 A & B'));assert.ok(text.includes('来源：HAINAN-A'))
  const url=new URL(buildWhatsAppUrl(opts));assert.equal(url.origin,'https://wa.me');assert.equal(url.searchParams.get('text'),text)
  assert.equal(buildWhatsAppMessage({...opts,message:text}),text)
})

function sdkFixture(){
  const {createClient}=require('@supabase/supabase-js')
  const state={packages:[parent()] as any[],options:[option(1),option(2)] as any[],writes:[] as any[],events:[] as string[],failCache:false,zeroDelete:false}
  const transport=async(input:any,init:any)=>{
    const req=new Request(input,init),url=new URL(req.url),table=url.pathname.split('/').pop()!
    let rows=table==='regions'?[{id:9,name:'Hainan',name_cn:'海南',country:'China'}]:table==='travel_packages'?state.packages:state.options
    for(const key of ['id','package_id','slug','status'])if(url.searchParams.has(key)){const value=url.searchParams.get(key)!.replace(/^eq\./,'');rows=rows.filter((r:any)=>String(r[key])===value)}
    if(req.method!=='GET'){
      state.writes.push({table,method:req.method})
      if(req.method==='PATCH'){const body=await req.json();rows.forEach((r:any)=>Object.assign(r,body))}
      if(req.method==='POST'){const row={...(await req.json()),id:99};(table==='travel_packages'?state.packages:state.options).push(row);rows=[row]}
      if(req.method==='DELETE'){if(state.zeroDelete)rows=[];else {const ids=rows.map((r:any)=>r.id);if(table==='travel_packages')state.packages=state.packages.filter(r=>!ids.includes(r.id));else state.options=state.options.filter(r=>!ids.includes(r.id))}}
    }
    return Response.json((req.headers.get('accept')||'').includes('vnd.pgrst.object')?rows[0]||null:rows)
  }
  const publication=load('lib/server/package-publication.ts',{'next/cache':{revalidateTag:(s:string)=>{state.events.push(`tag:${s}`)},revalidatePath:(s:string)=>{state.events.push(s);if(state.failCache)throw Error('Injected cache error')} }})
  const env={NEXT_PUBLIC_SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic',VERCEL_ENV:''}
  const mocks={'@/lib/server/admin-auth':{requireAdminRequest:async()=>({ok:true})},'@/lib/tioman-packages':{isTiomanPackage:(s:string)=>s.startsWith('tioman-'),isTiomanRegion:()=>true},'@/lib/server/package-publication':publication,'@supabase/supabase-js':{createClient:(url:string,key:string,opts:any)=>createClient(url,key,{...opts,global:{fetch:transport}})}}
  const globals={process:{env}}
  return{state,parentAPI:load('app/api/admin/travel-packages/route.ts',mocks,globals),optionAPI:load('app/api/admin/travel-package-options/route.ts',mocks,globals)}
}
const req=(body:any,method='POST')=>new Request('https://fixture.invalid/api/admin/travel-packages',{method,body:JSON.stringify(body),headers:{'Content-Type':'application/json'}})
test('real SDK package detail includes Hainan options without creating extra parent packages',async()=>{
  const {state,parentAPI}=sdkFixture();const response=await parentAPI.GET(new Request('https://fixture.invalid/api/admin/travel-packages?id=1'))
  assert.equal(response.status,200);assert.equal((await response.json()).options.length,2);assert.equal(state.packages.length,1);assert.equal(state.writes.length,0)
})
test('Hainan publication validates exactly two existing active options without splitting its parent',async()=>{
  const {state,parentAPI}=sdkFixture();assert.equal((await parentAPI.POST(req({...parent(),action:'validate'}))).status,200)
  state.options.push(option(3));assert.equal((await parentAPI.POST(req({...parent(),action:'validate'}))).status,400)
  assert.equal(state.packages.length,1);assert.equal(state.writes.length,0)
})
test('option price writes expire only package paths and blank prices remain null',async()=>{
  const {state,optionAPI}=sdkFixture();const response=await optionAPI.POST(req({...option(1),price_from:''}))
  assert.equal(response.status,200);assert.equal(state.options[0].price_from,null)
  assert.ok(state.events.includes('/packages/hainan-5d4n'));assert.ok(!state.events.includes('/packages'));assert.ok(!state.events.includes('tag:travel-packages'));assert.ok(!state.events.includes('/'))
  const writes=state.writes.length;assert.equal((await optionAPI.POST(req({...option(1),price_from:-1}))).status,400);assert.equal(state.writes.length,writes)
})
test('committed write plus cache failure is partial; retry invalidates without repeating SDK mutation',async()=>{
  const {state,optionAPI,parentAPI}=sdkFixture();state.failCache=true
  const failed=await optionAPI.POST(req({...option(1),price_display:'MYR 1234'}));assert.equal(failed.status,503)
  const payload=await failed.json();assert.equal(payload.persisted,true);assert.equal(payload.publication.state,'partial');assert.equal(state.options[0].price_display,'MYR 1234')
  const writes=state.writes.length;state.failCache=false
  const recovered=await parentAPI.POST(req(payload.publication.retry.body));assert.equal(recovered.status,200);assert.equal(state.writes.length,writes)
})
test('zero-row option deletion is never success; deleting a parent retains a safe invalidation-only retry',async()=>{
  const a=sdkFixture();a.state.zeroDelete=true;assert.equal((await a.optionAPI.DELETE(req({id:1},'DELETE'))).status,409)
  const b=sdkFixture();b.state.failCache=true;const failed=await b.parentAPI.DELETE(req({id:1,confirmSlug:'hainan-5d4n'},'DELETE'));assert.equal(failed.status,503)
  const payload=await failed.json(),writes=b.state.writes.length;assert.equal(b.state.packages.length,0);b.state.failCache=false
  assert.equal((await b.parentAPI.POST(req(payload.publication.retry.body))).status,200);assert.equal(b.state.writes.length,writes)
})
test('generic public options render two Hainan choices, units and no inactive/cross-parent leaks',()=>{
  const component=load('components/PackageOptionsSection.tsx',{
    '@/components/WhatsAppButton':(p:any)=>React.createElement('a',{href:buildWhatsAppUrl(p)},p.label),
    '@/components/FallbackImage':({fill,priority,...p}:any)=>React.createElement('img',p),
  }).default
  const html=renderToStaticMarkup(React.createElement(component,{item:parent(),options:[option(1),option(2,{price_unit:'room'}),option(3,{status:'inactive',name_zh:'隐藏方案'}),option(4,{package_id:99,name_zh:'其他主配套'})]}))
  assert.equal((html.match(/<article/g)||[]).length,2);assert.ok(html.includes('每人'));assert.ok(html.includes('每房'));assert.ok(html.includes('<details'))
  assert.ok(!html.includes('隐藏方案'));assert.ok(!html.includes('其他主配套'));assert.ok(html.includes('option-')===false)
})
test('empty option editor returns its empty state instead of dereferencing an undefined row',()=>{
  let index=0;const values=[[],null,false,'',false,null]
  const Editor=load('components/TiomanOptionsEditor.tsx',{'react':{...React,useState:()=>[values[index++],()=>{}],useEffect:()=>{},useCallback:(f:any)=>f},'@/lib/admin-fetch':{},'@/lib/whatsapp':{buildWhatsAppUrl}}).default
  assert.ok(renderToStaticMarkup(React.createElement(Editor,{packageId:1,packageName:'海南'})).includes('尚未建立'))
})

test('public Hainan page fetches its two options and JSON-LD cannot close a script element',async()=>{
  const item={...parent(),title_zh:'海南 </script><script>alert(1)</script>',canonical_url:'https://other.invalid/route'}
  let reads=0,displayed:any
  const page=load('app/packages/[slug]/page.tsx',{
    '@/components/PackageViewTracker':()=>null,'@/components/SiteFooter':()=>null,'@/components/WhatsAppFloatingButton':()=>null,
    '@/components/TiomanPackageDetail':()=>assert.fail('Hainan must not become Tioman'),
    '@/components/TravelPackageDetail':(p:any)=>{displayed=p;return React.createElement('h1',null,p.item.title_zh)},
    '@/lib/server/travel-packages':{readPublishedPackage:async()=>item,readPublishedPackageOptions:async()=>{reads++;return[option(1),option(2)]}},
    '@/lib/server/package-relations':{packageRelatedLinks:async()=>[]},'@/lib/site':{absoluteUrl:(p:string)=>new URL(p,'https://site.invalid').href},
    'next/navigation':{notFound:()=>assert.fail('Published fixture missing')},'next/link':({children,...p}:any)=>React.createElement('a',p,children),
  })
  const metadata=await page.generateMetadata({params:{slug:item.slug}});assert.equal(metadata.alternates.canonical,'https://site.invalid/packages/hainan-5d4n')
  const html=renderToStaticMarkup(await page.default({params:{slug:item.slug}}))
  assert.equal(reads,1);assert.equal(displayed.options.length,2);assert.ok(!html.includes('</script><script>'))
  const graphs=[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]))
  assert.equal(graphs.length,3);assert.equal(graphs[0].name,item.title_zh)
})
test('related package links use public records, omit missing items, deduplicate and read only requested sources',async()=>{
  const calls:string[]=[]
  const related=load('lib/server/package-relations.ts',{
    '@/lib/server/public-content-store':{readPublicGuides:async()=>{calls.push('guides');return[{slug:'g',title:'既有攻略'}]},readPublicNotes:async()=>{calls.push('notes');return[{slug:'n',title:'已公开游记'}]}},
    '@/lib/server/public-data-resolver':{resolvePublicData:async()=>{calls.push('data');return{locations:[{id:1,slug:'spot-1',name:'景点'}],regions:[{id:9,name:'Hainan'}]}}},
    '@/lib/region-routing':{buildRegionPath:()=>'/region/hainan-9'},
  })
  assert.equal((await related.packageRelatedLinks({...parent(),region_id:null})).length,0);assert.equal(calls.length,0)
  const links=await related.packageRelatedLinks({...parent(),related_guide_slugs:['g'],related_note_slugs:['n','missing','n'],related_location_ids:[1,99]})
  assert.equal(links.length,4);assert.equal(calls.join(','),'guides,notes,data');assert.ok(!links.some((l:any)=>l.href.includes('missing')))
})
test('Tioman hero uses current option data instead of a fixed RM509 quote',()=>{
  const component=load('components/TiomanPackageDetail.tsx',{
    'next/link':({children,...p}:any)=>React.createElement('a',p,children),
    '@/components/WhatsAppButton':()=>null,'@/components/FallbackImage':()=>null,'@/lib/analytics':{},
  }).default
  const html=renderToStaticMarkup(React.createElement(component,{item:{...parent(),slug:'tioman-3d2n'},options:[option(1,{price_from:999,price_display:'MYR 999 起'})]}))
  assert.ok(html.includes('MYR 999'));assert.ok(!html.includes('RM509'));assert.ok(html.includes('aria-pressed="true"'))
})
test('quality export distinguishes omitted fields from empty SEO and cannot claim a live database audit',()=>{
  const dir=mkdtempSync(path.join('artifacts/rc1.2/','quality-contract-')),input=path.join(dir,'input.json'),output=path.join(dir,'report')
  const description='合成测试资料，绝非实际旅行记录。'.repeat(10)
  writeFileSync(input,JSON.stringify([{id:1,name:'Fixture',description},{id:2,name:'Fixture2',description,seo_title_zh:'',seo_description_zh:''}]))
  const result=spawnSync(process.execPath,['--experimental-strip-types','scripts/audit-spot-quality.mjs','--input',input,'--source','snapshot','--output',output],{encoding:'utf8'})
  assert.equal(result.status,0,result.stderr)
  const report=JSON.parse(readFileSync(path.join(output,'quality.json'),'utf8')),drafts=JSON.parse(readFileSync(path.join(output,'drafts.json'),'utf8')).drafts
  assert.equal(report.isCurrentSupabaseEvidence,false);assert.equal(report.databaseWrites,0);assert.equal(drafts.length,1);assert.equal(drafts[0].id,2)
  assert.ok(!('seo_description_en' in drafts[0].patch))
})
test('Sitemap deduplicates completed translations, keeps hreflang and ignores invalid dates without additional provider reads',async()=>{
  let reads=0
  const sitemap=load('app/sitemap.ts',{
    '@/lib/region-routing':{buildRegionPath:()=>'/region/r-1'},'@/lib/site':{absoluteUrl:(s:string)=>`https://site.invalid${s}`},
    '@/lib/server/location-slugs-store':{readLocationSlugMap:async()=>{reads++;return{}},buildCanonicalLocationPath:async()=>'/spot/s-1'},
    '@/lib/server/public-content-store':{readPublicGuides:async()=>[],readPublicNotes:async()=>[]},
    '@/lib/server/public-location-data':{fetchAllLocationsForSitemap:async()=>[{id:1,name:'S',updated_at:'invalid'}],fetchAllRegionsForSitemap:async()=>[]},
    '@/lib/server/travel-packages':{readPublishedPackages:async()=>[]},
    '@/lib/server/english-page-data':{readEnglishCollections:async()=>{reads++;return{localization:{records:[{canonicalPath:'/spot/s-1',translationStatus:'complete'},{canonicalPath:'/spot/s-1',translationStatus:'complete'}]}}},englishPageData:async()=>({data:{status:'complete'}})},
  }).default
  const rows=await sitemap();assert.equal(new Set(rows.map((r:any)=>r.url)).size,rows.length);assert.equal(reads,2)
  const chinese=rows.find((r:any)=>r.url==='https://site.invalid/spot/s-1');assert.equal(chinese.lastModified,undefined);assert.equal(chinese.alternates.languages.en,'https://site.invalid/en/spot/s-1')
})
