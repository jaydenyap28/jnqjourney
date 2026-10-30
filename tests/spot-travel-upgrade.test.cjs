const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { loader } = require('./helpers/spot-travel-loader.cjs')
const snapshot = JSON.parse(fs.readFileSync('public-data/fallback/2026-10-30.json','utf8'))
const load = loader()
const { getSpotDescription } = load('lib/content-display.ts')
const { spotSeo } = load('lib/spot-content.ts')

test('English prose omits Chinese paragraphs, keeps English and short original proper names', () => {
  const chinese = '这里是中文景点介绍，不应被冒充为英文正文。'
  assert.equal(getSpotDescription({description:chinese},'en'),'')
  assert.equal(getSpotDescription({description:chinese,review:'A museum beside the river.'},'en'),'A museum beside the river.')
  assert.equal(getSpotDescription({description:`${chinese}\n\nAn existing English paragraph.`},'en'),'An existing English paragraph.')
  const english = 'Visit 浅草寺 for the main hall and a walk around the temple grounds.'
  assert.equal(getSpotDescription({description:english},'en'),english)
  assert.equal(getSpotDescription({description:chinese}),chinese)
  assert.doesNotMatch(spotSeo({name:'Museum',description:chinese,seo_description_en:chinese},'en').description,/中文/)
  assert.equal(spotSeo({name:'Museum',description:chinese,experience_en:'Our saved English experience.'},'en').description,'Our saved English experience.')
})

test('names remove only exact repeated original phrases without changing identity', () => {
  const { resolveEntityDisplayName } = load('lib/entity-display-name.ts')
  const row = {id:838,name:'Oriental Village 东方村 / Oriental Village'}
  assert.deepEqual(resolveEntityDisplayName(row,'en'),{primary:'Oriental Village',secondary:'东方村'})
  assert.equal(row.name,'Oriental Village 东方村 / Oriental Village')
})

function renderSpot(location, locale='zh') {
  const { default: SpotContent } = load('components/SpotContent.tsx')
  const { PublicLocaleProvider } = load('components/PublicLocale.tsx')
  return renderToStaticMarkup(React.createElement(PublicLocaleProvider,{locale},React.createElement(SpotContent,{location,mode:'page'})))
}

test('rendered Spot has real shortcut targets, English missing-copy entry and no invented stay range', () => {
  const html = renderSpot({...snapshot.spots[411],description:'## 交通\n现有交通说明。\n\n## 建议停留时间\n编辑建议30分钟。',price_info:{currency:'JPY',transportBudget:'1200'}})
  assert.equal((html.match(/<h1\b/g)||[]).length,1)
  for(const match of html.matchAll(/href="#(spot-[^"]+)"/g)) assert.ok(html.includes(`id="${match[1]}"`),match[1])
  assert.match(html,/交通参考/); assert.match(html,/JPY 1200/)
  const english = renderSpot(snapshot.spots[411],'en')
  assert.doesNotMatch(english,/札幌时计台是市中心/)
  assert.match(english,/An English description is not available yet/)
  assert.match(english,/Read the Chinese page/)
  const named = renderSpot({...snapshot.spots[411],name:'已录入的中文原名',title:'Approved English Place Name'},'en')
  assert.match(named,/<h1[^>]*>[\s\S]*?Approved English Place Name[\s\S]*?<\/h1>/)
  const stay = renderSpot({...snapshot.spots[411],category:'accommodation',price_info:{currency:'JPY',accommodationBudget:'10500'}})
  assert.match(stay,/JPY 10500/);assert.doesNotMatch(stay,/16300|16275/)
})

test('hours show stored closed days in English and do not infer daily opening', () => {
  const { formatOpeningHoursDisplay } = load('lib/opening-hours.ts')
  assert.equal(formatOpeningHoursDisplay(JSON.stringify({open:'08:45',close:'17:10',closedDays:[]})).statusLabel,'')
  const hours = formatOpeningHoursDisplay(JSON.stringify({open:'08:45',close:'17:10',closedDays:[1],remarks:'待核实中文备注'}),'en')
  assert.equal(hours.statusLabel,'Closed: Mon');assert.equal(hours.remarks,'')
})

test('existing editorial checks gain verification, conflict and invalid-media review without mutation', () => {
  const { assessSpotContent } = load('lib/spot-content-quality.ts')
  const row = {name:'Museum',description:'## Museum\n门票免费。\n\n## Visit\ntext\n\n## Visit\nmore',images:['javascript:bad'],price_info:{admissionAdult:'350',isFree:true},opening_hours:JSON.stringify({open:'08:45',close:'17:10'})}
  const before = JSON.stringify(row)
  const codes = assessSpotContent(row).issues.map(x=>x.code)
  for(const code of ['duplicate','verification','conflict','media']) assert.ok(codes.includes(code),code)
  assert.equal(JSON.stringify(row),before)
})

test('new version contains only active public records; captured quality is recomputed unchanged', () => {
  const { evaluateSpotQuality } = load('lib/spot-quality.ts')
  assert.equal(snapshot.locations.length,582)
  assert.equal(Object.keys(snapshot.spots).length,582)
  assert.ok(!snapshot.spots[450]);assert.ok(!snapshot.locations.some(x=>x.id===450))
  for(const [id,spot] of Object.entries(snapshot.spots)) {
    assert.ok([null,'published'].includes(spot.publication_status))
    assert.equal(snapshot.eligibility[id].status,'active')
    assert.equal(evaluateSpotQuality(spot).indexable,snapshot.eligibility[id].indexableAtCapture)
  }
  assert.equal(Object.values(snapshot.eligibility).filter(x=>!x.indexableAtCapture).length,48)
  assert.doesNotMatch(JSON.stringify(snapshot),/service_role|sb_secret_|access_token|refresh_token|klookWidgetCode/)
})

test('actual readers use the independent version under missing providers and never revive 450', async () => {
  const { getPublicSpotBySlug } = load('lib/server/public-spot-resolver.ts')
  const fresh = await getPublicSpotBySlug('any-alias-851')
  assert.equal(fresh.source,'static-fallback');assert.equal(fresh.spot.id,851)
  assert.equal(await getPublicSpotBySlug('old-450'),null)
  const data = await load('lib/server/public-data-resolver.ts').resolvePublicData()
  assert.equal(data.source,'static-fallback');assert.equal(data.locations.length,582)
  const bundled = load('lib/server/localization-snapshot.ts')
  assert.equal((await bundled.readBundledJson('public-data/locations.json')).locations.length,582)
  await assert.rejects(bundled.readBundledJson('public-data/spots/spot-450.json'),/absent/)
})

test('rollback disables the new layer without reusing unsafe legacy files', async () => {
  const disabled = loader({}, {process:{env:{JNQ_PUBLIC_FALLBACK:'disabled'},cwd:()=>process.cwd()}})
  await assert.rejects(disabled('lib/server/public-fallback-snapshot.ts').readPublicFallbackSnapshot(),/disabled/)
  await assert.rejects(disabled('lib/server/public-spot-resolver.ts').getPublicSpotBySlug('spot-411'),/unavailable/)
  await assert.rejects(disabled('lib/server/public-data-resolver.ts').resolvePublicData(),/disabled/)
  const { resolvePublicSpotSources } = load('lib/public-spot.ts')
  let called = false
  const result = await resolvePublicSpotSources({cdn:async()=>({status:'failure'}),supabase:async()=>({status:'not-found',authoritative:true}),fallback:async()=>{called=true;return {status:'found',spot:snapshot.spots[411]}}})
  assert.equal(result.status,'not-found');assert.equal(called,false)
})

test('fallback detail APIs stay noindex even for qualified records; routing outage stays 503', async () => {
  const api = load('app/api/spots/[slug]/route.ts')
  for(const id of [411,794]) {
    const response = await api.GET(new Request('https://example.test'),{params:{slug:`spot-${id}`}})
    assert.equal(response.status,200);assert.equal(response.headers.get('X-JNQ-SEO-Indexable'),'0')
  }
  const broken = loader({'@/lib/server/spot-routing':{readSpotRouting:async()=>{throw Error('offline')}}})
  const routing = await broken('app/api/spot-routing/[slug]/route.ts').GET(new Request('https://example.test'),{params:{slug:'spot-411'}})
  assert.equal(routing.status,503);assert.match(routing.headers.get('X-Robots-Tag'),/noindex/)
})

test('English Region body and SEO use matching language fallback and preserve valid translations', async () => {
  const region = {...snapshot.regions[0],id:62,slug:'sapporo-62',name:'札幌 / Sapporo',shortSummary:'整段中文地区介绍。'}
  const collection = {locations:snapshot.locations.filter(x=>x.id===411),regions:[region],guides:[],localization:{records:[]},snapshotSlugs:{}}
  const { englishPageData } = load('lib/server/english-page-data.ts')
  const {data} = await englishPageData(['region','sapporo-62'],false,{collection,includePackages:false})
  assert.doesNotMatch(data.description,/整段中文/)
  assert.equal(data.locations[0].shortSummary,null)
  const {regionEditorial} = load('lib/public-editorial.ts')
  assert.equal(regionEditorial({name:'Sapporo',description:data.region.shortSummary},data.locations.map(x=>load('lib/entity-display-name.ts').resolveEntityDisplayName(x,'en').primary),'en').description,data.description)
  collection.localization.records=[{entityType:'region',entityId:'62',locale:'en',translationStatus:'complete',fields:{shortSummary:{source:region.shortSummary,text:'Existing English city introduction.'}}}]
  const translated = await englishPageData(['region','sapporo-62'],false,{collection,includePackages:false})
  assert.equal(translated.data.description,'Existing English city introduction.')
  const description = '已核实的简短中文介绍。'
  collection.locations[0]={...collection.locations[0],shortSummary:load('lib/public-editorial.ts').spotCardExcerpt({description})}
  collection.localization.records.push({entityType:'spot',entityId:'411',locale:'en',translationStatus:'partial',fields:{description:{source:description,text:'Existing English museum description.'}}})
  const card = await englishPageData(['region','sapporo-62'],false,{collection,includePackages:false})
  assert.equal(card.data.locations[0].shortSummary,'Existing English museum description.')
  collection.localization.records[1].fields.description.source='A stale source.'
  const stale = await englishPageData(['region','sapporo-62'],false,{collection,includePackages:false})
  assert.equal(stale.data.locations[0].shortSummary,null)
})
