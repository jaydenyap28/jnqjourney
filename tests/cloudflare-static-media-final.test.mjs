import test from 'node:test'
import assert from 'node:assert/strict'
import {CDN} from '../scripts/cloudflare/recovery-sources.mjs'
import {localizeLegacyFeedLinks} from '../scripts/cloudflare/recovery-delivery-feeds.mjs'
import {hash} from '../scripts/cloudflare/recovery-media-inventory-final.mjs'
import {assertApprovedImageBytes,assertNoLegacyDelivery,isNonContentSdkReference,validateMediaApproval} from '../scripts/cloudflare/recovery-media-release-gate.mjs'
import {assertNoLegacyImageLiteral,mediaPlan,verifyCachedMedia} from '../scripts/cloudflare/recovery-media-staging.mjs'
import {mkdtemp,readdir,rmdir,unlink,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

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
test('the player telemetry literal is only recognized in its optional SDK chunk',()=>{
  const url='https://img.litix.io/a.gif'
  assert.ok(isNonContentSdkReference('_next/static/chunks/reactPlayerMux.abc123.js',url))
  assert.equal(isNonContentSdkReference('index.html',url),false)
  assert.equal(isNonContentSdkReference('public-data/locations.json',url),false)
  assert.equal(isNonContentSdkReference('_next/static/chunks/reactPlayerMux.abc123.js',url+'?copy=1'),false)
})

test('final staging rewrites exact shared media before rendering and uses an explicit missing-image state',()=>{
  const a=CDN+'/locations/exact.png'
  const b='https://i.ibb.co/example/unavailable.png'
  const rows=[{identity:a,sha256:hash(a),owners:['guide:public','spot:1']},{identity:b,sha256:hash(b),owners:['spot:2']}]
    .map(row=>({...row,status:'REVIEW_REQUIRED',closedOwners:[]}))
  const inventory={summary:{inventorySha256:'captured',files:3621},records:rows}
  const approved=rows.map(row=>({identitySha256:row.sha256,approvedBy:'Fixture only',rightsEvidence:'Synthetic approval',contentOwners:row.owners}))
  const id=hash('synthetic png'),target='/media/static/'+id+'.png'
  const plan=mediaPlan(inventory,{inventorySha256:'captured',decisions:[
    {...approved[0],disposition:'static-copy',bytes:68,approvedBytesSha256:id,path:target},
    {...approved[1],disposition:'exclude'},
  ]})
  assert.equal(plan.pending.length,0)
  assert.equal(plan.addedBytes,68)
  const input={html:`<img src="${a}#focus=12,34">`,css:`url(${a})`,seo:{image:a},feed:{images:[a,b]},metadata:{[a]:{alt:'shared'},[b]:{alt:'retired'}}}
  assert.deepEqual(plan.rewriteValue(input),{html:`<img src="${target}#focus=12,34">`,css:`url(${target})`,seo:{image:target},feed:{images:[target,'/placeholder-image.jpg']},metadata:{[target]:{alt:'shared'}}})
  assert.equal(input.feed.images[0],a)
  assert.throws(()=>assertNoLegacyImageLiteral(`url(${CDN}/locations/unapproved.png)`),/MISSING_MEDIA_DECISION/)
  assert.throws(()=>mediaPlan({...inventory,summary:{...inventory.summary,files:20000}},{inventorySha256:'captured',decisions:[
    {...approved[0],disposition:'static-copy',bytes:68,approvedBytesSha256:id,path:target},
  ]}),/PAGES_FILE_COUNT_LIMIT/)
})

test('video thumbnails may retain the exact provider URL or use the approved missing state',()=>{
  const url='https://i.ytimg.com/vi/abcDEF01234/hqdefault.jpg'
  const row={identity:url,sha256:hash(url),owners:['guide:example'],closedOwners:[],status:'REVIEW_REQUIRED'}
  const inventory={summary:{inventorySha256:'video',files:8},records:[row]}
  const decision={identitySha256:row.sha256,contentOwners:row.owners,approvedBy:'Fixture only',rightsEvidence:'Synthetic decision'}
  assert.equal(mediaPlan(inventory,{inventorySha256:'video',decisions:[]}).pending.length,1)
  assert.equal(mediaPlan(inventory,{inventorySha256:'video',decisions:[{...decision,disposition:'provider-reference'}]}).videoPosters.abcDEF01234,url)
  assert.equal(mediaPlan(inventory,{inventorySha256:'video',decisions:[{...decision,disposition:'exclude'}]}).videoPosters.abcDEF01234,'/placeholder-image.jpg')
})

test('cached objects must match approved length, digest and image signature',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'jnq-cutover-media-'))
  try {
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSGUAAAAASUVORK5CYII=','base64')
    const sha=hash(png)
    for(const extension of ['png','webp'])await writeFile(path.join(directory,`${sha}.${extension}`),png)
    const decision={disposition:'static-copy',bytes:png.length,approvedBytesSha256:sha,path:`/media/static/${sha}.png`}
    await verifyCachedMedia(directory,decision)
    await assert.rejects(verifyCachedMedia(directory,{...decision,path:`/media/static/${sha}.webp`}),/SIGNATURE_EXTENSION/)
    await assert.rejects(verifyCachedMedia(directory,{...decision,approvedBytesSha256:hash('wrong')}),/DIGEST_MISMATCH/)
  } finally {
    for(const file of await readdir(directory))await unlink(path.join(directory,file))
    await rmdir(directory)
  }
})
