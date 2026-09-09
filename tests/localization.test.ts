import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import { getLocale, localizedPath, dictionary } from '../lib/locale.ts'
import { applyLocalization, isLocalizedTextPath, type LocalizationRecord, type LocalizationSnapshot } from '../lib/localization.ts'
import { localizedAlternates, localizedRobots } from '../lib/localized-metadata.ts'

test('language switching preserves entity, query and fragment in both directions',()=>{
  for(const path of ['/','/guide/malaysia-langkawi-5d4n#itinerary','/spot/golden-bamboo-cafe-829?q=coffee#gallery','/region/kuala-lumpur-2','/search?q=Kuala%20Lumpur']) {
    assert.equal(localizedPath(localizedPath(path,'en'),'zh'),path)
    assert.equal(getLocale(localizedPath(path,'en')),'en')
  }
  assert.equal(localizedPath('/regions/kuala-lumpur-2','en'),'/en/region/kuala-lumpur-2')
  assert.equal(localizedPath('https://example.com/x','en'),'https://example.com/x')
  assert.equal(getLocale('/english'),'zh')
})
test('dictionary keys match and English UI labels contain no Chinese',()=>{
  assert.deepEqual(Object.keys(dictionary.en).sort(),Object.keys(dictionary.zh).sort())
  for(const value of Object.values(dictionary.en)) assert.equal(/\p{Script=Han}/u.test(value),false)
})
const makeRecord=(fields:LocalizationRecord['fields']):LocalizationRecord=>({entityType:'guide',entityId:'test',locale:'en',canonicalPath:'/guide/test',translationStatus:'complete',source:{url:'test',capturedAt:'2026-09-08'},fields})
test('translations are text-only and do not mutate source, identity, money, bindings or media',()=>{
  const source={title:'旅程',days:[],itineraryMode:'unassigned',attractions:[{spotId:810,displayOrder:2}],images:['https://cdn.example/original.webp'],budget:'RM290',latitude:6.38}
  const original=structuredClone(source)
  const record=makeRecord({title:{source:'旅程',text:'Journey'},'attractions.0.spotId':{source:'810',text:'999'},'budget':{source:'RM290',text:'USD999'}})
  const result=applyLocalization(source,record)
  assert.equal(result.status,'partial')
  assert.deepEqual(result.value,{...original,title:'Journey'})
  assert.deepEqual(source,original)
  assert.equal(applyLocalization(source,record,'zh').value,source)
  for(const path of ['days.0.spotId','attractions.0.displayOrder','itineraryMode','days','images.0','budgetItems.0.amount','latitude','name','__proto__.title']) assert.equal(isLocalizedTextPath(path),false,path)
})
test('missing, stale and newly added source text cannot remain complete',()=>{
  assert.equal(applyLocalization({title:'旅程'},undefined).status,'missing')
  const record=makeRecord({title:{source:'旅程',text:'Journey'}})
  assert.equal(applyLocalization({title:'旅程'},record).status,'complete')
  assert.equal(applyLocalization({title:'改过的旅程'},record).status,'partial')
  assert.equal(applyLocalization({title:'旅程',summary:'新加入的事实'},record).status,'partial')
  assert.equal(applyLocalization({title:'旅程',regions:{description:'关联地区原文'}},record).status,'complete')
})
test('incomplete English has no hreflang and cannot be indexed',()=>{
  for(const status of ['missing','partial'] as const) {
    assert.deepEqual(localizedRobots('en',status),{index:false,follow:true})
    assert.equal(localizedAlternates('/spot/a-820','en',status).languages,undefined)
  }
  assert.deepEqual(localizedAlternates('/spot/a-820','en','complete'),{canonical:'/en/spot/a-820',languages:{zh:'/spot/a-820',en:'/en/spot/a-820','x-default':'/spot/a-820'}})
  assert.equal(localizedAlternates('/spot/a-820','zh','complete').canonical,'/spot/a-820')
})
test('curated pilot contains exactly 5 regions, 3 guides, 6 spots and only permitted text fields',()=>{
  const snapshot=JSON.parse(fs.readFileSync('public-data/i18n/en/records.json','utf8')) as LocalizationSnapshot
  assert.equal(snapshot.records.filter(r=>r.entityType==='region').length,5)
  assert.equal(snapshot.records.filter(r=>r.entityType==='guide').length,3)
  assert.equal(snapshot.records.filter(r=>r.entityType==='spot').length,6)
  for(const record of snapshot.records) for(const [path,field] of Object.entries(record.fields)) {
    assert.ok(isLocalizedTextPath(path),path)
    assert.equal(/\p{Script=Han}/u.test(field.text),false,`${record.entityId}.${path}`)
  }
})
test('public localization read never imports a database client or reads preference cookies',()=>{
  for(const file of ['lib/server/localization-snapshot.ts','lib/server/english-page-data.ts','pages/en/[[...path]].tsx']) {
    const code=fs.readFileSync(file,'utf8')
    assert.doesNotMatch(code,/@supabase|createClient\(|cookies\(|headers\(|no-store|AI_API/)
  }
})
test('the curated opening-hours translation preserves the recorded schedule',()=>{
  const snapshot=JSON.parse(fs.readFileSync('public-data/i18n/en/records.json','utf8')) as LocalizationSnapshot
  const hours=snapshot.records.find(r=>r.entityType==='spot'&&r.entityId==='829')!.fields.opening_hours
  const before=JSON.parse(hours.source),after=JSON.parse(hours.text)
  delete before.remarks;delete after.remarks
  assert.deepEqual(after,before)
})
test('English Pages Router client graph does not use App Router-only navigation hooks',()=>{
  const visited=new Set<string>()
  function visit(file:string) {
    if(visited.has(file)) return
    visited.add(file)
    const source=fs.readFileSync(file,'utf8')
    assert.doesNotMatch(source,/from ['"]next\/navigation['"]/,file)
    for(const match of source.matchAll(/import(?!\s+type\b)[^\n]*from ['"]([^'"]+)['"]/g)) {
      const name=match[1]
      if(!name.startsWith('@/')&&!name.startsWith('.')) continue
      const prefix=name.startsWith('@/')?name.slice(2):`${file.slice(0,file.lastIndexOf('/'))}/${name}`
      const target=[prefix,`${prefix}.tsx`,`${prefix}.ts`].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile())
      if(target&&/\.tsx?$/.test(target)) visit(target)
    }
  }
  visit('components/EnglishSite.tsx');visit('pages/_app.tsx')
})
