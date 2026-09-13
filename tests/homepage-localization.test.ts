import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import { applyLocalization, type LocalizationSnapshot } from '../lib/localization.ts'
import { localizeHomepageNote, localizeHomepagePackage, packageCardSource } from '../lib/homepage-localization.ts'
import type { LongformNote } from '../lib/notes.ts'
import type { TravelPackage } from '../lib/server/travel-packages.ts'

const snapshot = JSON.parse(fs.readFileSync('public-data/i18n/en/records.json','utf8')) as LocalizationSnapshot
test('homepage Note overlay matches source and does not change the Chinese note or body',()=>{
  const record = snapshot.records.find(r=>r.entityId==='notes/malaysia-turtle-night-terengganu')!
  const note = {slug:'malaysia-turtle-night-terengganu',title:record.fields.title.source,
    shortTitle:record.fields.shortTitle.source,tagline:'',summary:'',blocks:[{type:'paragraph',content:'原文'}],coverImage:'original.webp'} as LongformNote
  const original=structuredClone(note)
  const value=localizeHomepageNote(note,snapshot)
  assert.equal(/\p{Script=Han}/u.test(value.title+value.shortTitle),false)
  assert.deepEqual(note,original)
  assert.deepEqual(value.blocks,note.blocks)
  assert.equal(value.coverImage,note.coverImage)
  assert.equal(localizeHomepageNote({...note,title:'已改源文'},snapshot).title,'已改源文')
})
test('package overlay translates prose while preserving canonical facts and rejecting price changes',()=>{
  const record=snapshot.records.find(r=>r.entityId==='packages/tioman-3d2n')!
  const item={id:5,slug:'tioman-3d2n',title_zh:'中文标题',title_en:'Tioman Package',status:'published',
    destination:'Pulau Tioman',duration:record.fields.duration.source,short_description:record.fields.shortSummary.source,
    price_display:record.fields.priceDisplay.source,whatsapp_message:record.fields.whatsappMessage.source,
    cover_image:'original.webp',region_id:90,sort_order:2} as TravelPackage
  const original=structuredClone(item)
  const value=localizeHomepagePackage(item,snapshot)
  assert(Object.values(packageCardSource(value)).every(text=>! /\p{Script=Han}/u.test(text)))
  assert.equal(value.price_display,'From RM509 per person')
  assert.deepEqual(item,original)
  for(const key of ['id','slug','title_zh','cover_image','region_id','sort_order'] as const) assert.equal(value[key],item[key])
  for(const text of ['From RM999 per person','From USD509 per person']) {
    const changed=structuredClone(record);changed.fields.priceDisplay.text=text
    const result=applyLocalization(packageCardSource(item),changed)
    assert.equal(result.value.priceDisplay,item.price_display)
    assert.equal(result.status,'partial')
  }
})
test('all seven live Guide card projections in the localization draft have English prose',()=>{
  const records=snapshot.records.filter(r=>r.entityType==='guide')
  assert.equal(records.length,7)
  for(const record of records) {
    for(const [key,field] of Object.entries(record.fields)) {
      if(['title','shortTitle','duration','travelStyle','tagline','summary'].includes(key)||/^route\.\d+\.(name|stopLabel)$/.test(key))
        assert.equal(/\p{Script=Han}/u.test(field.text),false,`${record.entityId}:${key}`)
    }
    assert(record.fields.title && record.fields.shortTitle && record.fields.tagline)
  }
  assert.equal(records.find(r=>r.entityId==='china-jiangnan-autumn-15d14n')!.fields.shortTitle.text,'Autumn in Jiangnan')
})
