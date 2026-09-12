import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { editSpotTranslation, type SpotTranslationEdits } from '../lib/spot-localization-authoring.ts'
import { applyLocalization, localizationRecord, type LocalizationSnapshot } from '../lib/localization.ts'
import { readAuthoritativeLocalization, saveAndPublishLocalization, localizationPointer, localizationPublicKey } from '../lib/server/localization-publisher.mjs'

const snapshot = JSON.parse(fs.readFileSync('public-data/i18n/en/records.json','utf8')) as LocalizationSnapshot
const spot = {id:829,name:'Golden Bamboo Cafe',name_cn:null,description:'竹主题咖啡馆。',review:null,address:'Jalan Lye, Langkawi'}
const edits:SpotTranslationEdits = {
  description:{source:spot.description,text:'A bamboo-themed cafe.'},
  review:{source:'',text:''},address:{source:spot.address,text:spot.address},
}

// Exercise the real /en/spot route-data implementation with isolated external transports.
function publicPageData(published:LocalizationSnapshot, canonical:typeof spot) {
  const slug='golden-bamboo-cafe-829'
  const snapshotTransport={
    readLocalizationSnapshot:async()=>published,
    readBundledJson:async()=>({'829':'golden-bamboo-cafe'}),
    readBilingualSnapshot:async(key:string)=>key==='locations.json'?{locations:[{...canonical,slug}]}:key==='regions.json'?{regions:[]}:key==='guides.json'?{guides:[]}:{spot:{...canonical,slug}},
  }
  const modules:Record<string,unknown>={
    '@/data/guide-price-highlights.json':[],
    '@/lib/server/travel-packages':{readPublishedPackagesUncached:async()=>[]},
    '@/lib/guide-price-highlights':{}, '@/lib/guide-budget':{},
    '@/lib/localization':{applyLocalization,localizationRecord},
    '@/lib/entity-display-name':{resolveEntityDisplayName:()=>({primary:canonical.name})},
    '@/lib/public-region-media':{resolvePublicRegionMedia:(regions:unknown)=>regions},
    '@/lib/server/public-content-media':{resolveGuidePublicMedia:(guide:unknown)=>guide},
    './localization-snapshot':snapshotTransport,
  }
  const compiled=ts.transpileModule(fs.readFileSync('lib/server/english-page-data.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
  const context={exports:{} as {englishPageData?:(parts:string[])=>Promise<any>},structuredClone,require:(name:string)=>{assert.ok(name in modules,name);return modules[name]}}
  vm.runInNewContext(compiled,context)
  return context.exports.englishPageData!(['spot',slug])
}

function fakeIO() {
  const storage = new Map<string,Buffer>([[localizationPointer,Buffer.from('_system/i18n/en/test-start.webp')],['_system/i18n/en/test-start.webp',Buffer.from(JSON.stringify(snapshot))]])
  const publicObjects = new Map<string,Buffer>()
  let locked=false, failPublication=false
  return {
    storage, publicObjects, fail:()=>{failPublication=true}, recover:()=>{failPublication=false},
    read:async(key:string)=>{const bytes=storage.get(key);if(!bytes)throw Error('missing');return bytes},
    write:async(key:string,bytes:Buffer,upsert:boolean)=>{if(!upsert&&storage.has(key))throw Error('exists');storage.set(key,bytes)},
    lock:async()=>{if(locked)throw Error('locked');locked=true},unlock:async()=>{locked=false},
    publish:async(key:string,bytes:Buffer)=>{if(failPublication)throw Error('R2 unavailable');publicObjects.set(key,bytes)},
    publicRead:async()=>publicObjects.get(localizationPublicKey)!,
  }
}

test('Spot Save/Publish -> authoritative version -> existing public snapshot -> English overlay; Chinese unchanged',async()=>{
  const io=fakeIO(), canonical=structuredClone(spot)
  const before=await readAuthoritativeLocalization(io)
  const result=await saveAndPublishLocalization(io,before.revision,(current:LocalizationSnapshot)=>editSpotTranslation(current,spot,'/spot/golden-bamboo-cafe-829',edits,'complete','test-save'))
  const published=JSON.parse((await io.publicRead()).toString()) as LocalizationSnapshot
  assert.deepEqual(published,(await readAuthoritativeLocalization(io)).snapshot)
  const record=localizationRecord(published,'spot',829)!
  assert.equal(record.locale,'en');assert.equal(record.entityId,'829');assert.equal(record.entityType,'spot')
  assert.equal(applyLocalization(spot,record).value.description,edits.description.text)
  assert.equal((await publicPageData(published,spot)).data.spot.description,edits.description.text)
  assert.deepEqual(applyLocalization(spot,record,'zh').value,canonical)
  assert.deepEqual(spot,canonical)
  assert.deepEqual(published.records.filter(r=>r.entityType!=='spot'||r.entityId!=='829'),snapshot.records.filter(r=>r.entityType!=='spot'||r.entityId!=='829'))
  const changed={...spot,description:'原文已修改。'}
  assert.equal(applyLocalization(changed,record).status,'partial')
  assert.equal(applyLocalization(changed,record).value.description,changed.description)
  assert.equal((await publicPageData(published,changed)).data.status,'partial')
  assert.equal((await publicPageData(published,changed)).data.spot.description,changed.description)
  const again=editSpotTranslation(published,changed,record.canonicalPath,edits,'complete','test-resave')
  assert.equal(localizationRecord(again,'spot',829)!.fields.description.source,spot.description)
  assert.equal(localizationRecord(again,'spot',829)!.translationStatus,'partial')
  await assert.rejects(saveAndPublishLocalization(io,before.revision,()=>published),/another session/)
  assert.equal((await readAuthoritativeLocalization(io)).revision,result.revision)
})

test('rejects name/identity edits and edits based on an outdated source',()=>{
  assert.throws(()=>editSpotTranslation(snapshot,spot,'/spot/a-829',{...edits,name:{text:'Invented',source:spot.name}} as SpotTranslationEdits,'complete','test'),/Only/)
  assert.throws(()=>editSpotTranslation(snapshot,spot,'/spot/a-829',{...edits,description:{text:'New translation',source:'outdated'}},'complete','test'),/Source changed/)
})

test('failed publication retains authority and supports explicit reload/retry without a second source',async()=>{
  const io=fakeIO(),before=await readAuthoritativeLocalization(io)
  io.fail()
  await assert.rejects(saveAndPublishLocalization(io,before.revision,(current:LocalizationSnapshot)=>editSpotTranslation(current,spot,'/spot/a-829',edits,'partial','test-retry')),/R2/)
  const saved=await readAuthoritativeLocalization(io)
  assert.notEqual(saved.revision,before.revision)
  io.recover()
  await saveAndPublishLocalization(io,saved.revision,(current:LocalizationSnapshot)=>current)
  assert.deepEqual(JSON.parse((await io.publicRead()).toString()),saved.snapshot)
})

test('empty optional source can be translated without losing stale matching',()=>{
  const next=editSpotTranslation(snapshot,spot,'/spot/a-829',{...edits,review:{source:'',text:'A short review.'}},'partial','test-null')
  const record=localizationRecord(next,'spot',829)
  assert.equal(applyLocalization(spot,record).value.review,'A short review.')
  assert.equal(applyLocalization({...spot,review:'新增中文'},record).value.review,'新增中文')
})

test('Admin uses authentication; canonical form remains separate; Pages ISR refresh uses the same overlay',()=>{
  const api=fs.readFileSync('pages/api/admin/spot-localization/[id].ts','utf8')
  assert.match(api,/requireAdminRequest/);assert.match(api,/saveAndPublishLocalization/)
  assert.doesNotMatch(api,/\.update\(|\.insert\(|\.upsert\(/)
  const form=fs.readFileSync('components/AdminLocationForm.tsx','utf8')
  assert.match(form,/<form hidden=\{editingLanguage==='en'\} onSubmit=\{handleSubmit\}/)
  const route=fs.readFileSync('pages/en/[[...path]].tsx','utf8')
  assert.match(route,/revalidateReason === 'on-demand'/)
  assert.match(fs.readFileSync('lib/server/english-page-data.ts','utf8'),/applyLocalization\(source,localizationRecord\(localization,'spot',source.id\)\)/)
})
