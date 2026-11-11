import test from 'node:test'
import assert from 'node:assert/strict'
import {CDN} from '../scripts/cloudflare/recovery-sources.mjs'
import {localizeLegacyFeedLinks} from '../scripts/cloudflare/recovery-delivery-feeds.mjs'
import {hash} from '../scripts/cloudflare/recovery-media-inventory-final.mjs'
import {assertApprovedImageBytes,assertNoLegacyDelivery,validateMediaApproval} from '../scripts/cloudflare/recovery-media-release-gate.mjs'

test('delivery feed resolves the current canonical by verified entity ID and keeps the input untouched',()=>{
  const old=CDN+'/public-data/spots/spot-446.json'
  const snapshot={records:[{entityType:'spot',entityId:'446',source:{url:old,contentHash:'historical',capturedAt:'2026-10-30'}}]}
  const authority={spotSlugs:new Map([['446','canonical-446']]),guideSlugs:new Set(),regionIds:new Set()}
  const next=localizeLegacyFeedLinks(snapshot,authority)
  assert.deepEqual(next.records[0].source,{url:'/public-data/spots/canonical-446.json',capturedAt:'2026-10-30'})
  assert.equal(snapshot.records[0].source.url,old)
  assert.throws(()=>localizeLegacyFeedLinks({records:[{...snapshot.records[0],entityId:'447'}]},authority),/UNREVIEWED/)
})

test('closed objects and changed shared-owner lists cannot enter a copy approval',()=>{
  const bytes=Buffer.from('fixture bytes'),digest=hash(bytes)
  const row={sha256:'identity',identity:CDN+'/locations/fixture.webp',status:'REVIEW_REQUIRED',closedOwners:[],owners:['note:public','spot:visible']}
  const inventory={summary:{inventorySha256:'inventory-v1'},records:[row]}
  const decision={identitySha256:'identity',rightsEvidence:'Synthetic fixture',approvedBy:'Test',contentOwners:row.owners,
    disposition:'static-copy',bytes:bytes.length,approvedBytesSha256:digest,path:`/media/static/${digest}.webp`}
  const approval={inventorySha256:'inventory-v1',decisions:[decision]}
  assert.equal(validateMediaApproval(inventory,{...approval,decisions:[]}).pending.length,1)
  assert.equal(validateMediaApproval(inventory,approval).authorized.size,1)
  assert.throws(()=>validateMediaApproval(inventory,{...approval,inventorySha256:'stale'}),/INVENTORY_MISMATCH/)
  assert.throws(()=>validateMediaApproval(inventory,{...approval,decisions:[{...decision,contentOwners:['spot:visible']}]}),/OWNERS_MISMATCH/)
  assert.throws(()=>validateMediaApproval({...inventory,records:[{...row,closedOwners:['spot:withdrawn']}]},approval),/NOT_ELIGIBLE/)
  assertApprovedImageBytes(decision,bytes)
  assert.throws(()=>assertApprovedImageBytes(decision,Buffer.alloc(bytes.length)),/DIGEST_MISMATCH/)
})

test('local release validation rejects old R2 host and Supabase public object links',()=>{
  assertNoLegacyDelivery('{"image":"/media/static/example.webp"}')
  assert.throws(()=>assertNoLegacyDelivery(`{"source":"${CDN}/public-data/notes.json"}`),/LEGACY_R2/)
  assert.throws(()=>assertNoLegacyDelivery('https:\\/\\/vrufunuomioczocdsoer.supabase.co\\/storage/v1/object/public/location-images/x.webp'),/LEGACY_STORAGE/)
})
