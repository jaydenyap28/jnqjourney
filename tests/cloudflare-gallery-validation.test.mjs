import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture,base} from './helpers/cloudflare-spot-fixture.mjs'

for(const count of [1,5,17,30])test(`${count} first-save and unchanged media retain validation; cover deduplicates`,async()=>{
  const f=fixture(),images=await f.seedMedia(count),data={image_url:images[0],images}
  for(const phase of ['first','unchanged']){
    const before=f.counts();assert.equal((await f.save(data)).status,200,phase)
    const after=f.counts();assert.equal(after.get-before.get,count)
    assert.equal(after.head-before.head,count===1?1:0)
    assert.equal(after.list-before.list,count===1?0:1)
  }
  assert.equal((await f.call(images[0],{auth:false})).status,200)
})

for(const fault of ['missing','damaged','oversize','foreignFixture','version','etag','mime','size','signature','objectDeleted'])test(`gallery refuses ${fault} before database PATCH`,async()=>{
  const f=fixture(),images=await f.seedMedia(5),key=images[2].slice(1)
  const receipt='_candidate-validation/'+key.slice('media/candidate/'.length)+'.json',entry=f.objects.get(receipt)
  if(fault==='missing')f.objects.delete(receipt)
  else if(fault==='damaged')entry.bytes=Buffer.from('{broken')
  else if(fault==='oversize')entry.bytes=Buffer.alloc(1025)
  else if(fault==='objectDeleted')f.objects.delete(key)
  else if(fault==='version')f.objects.get(key).version='replaced-version'
  else if(fault==='etag')f.objects.get(key).etag='replaced-etag'
  else if(fault==='mime')f.objects.get(key).metadata={contentType:'image/jpeg'}
  else if(fault==='size')f.objects.get(key).bytes=Buffer.alloc(100)
  else {const proof=JSON.parse(entry.bytes);if(fault==='foreignFixture')proof.fixtureId='2';else proof.signatureChecked=false;entry.bytes=Buffer.from(JSON.stringify(proof))}
  assert.equal((await f.save({images})).status,400)
  assert.equal(f.calls.filter(call=>call.method==='PATCH').length,0)
  assert.deepEqual(f.rows.get('1').images,[])
})

test('truncated list uses exact HEAD for unlisted references, never trusts absence',async()=>{
  const f=fixture(),images=await f.seedMedia(5),list=f.env.TEST_MEDIA.list
  f.env.TEST_MEDIA.list=async options=>({...await list(options),objects:[],truncated:true,cursor:'test'})
  assert.equal((await f.save({images})).status,200)
  assert.equal(f.counts().head,5)
  f.objects.delete(images[4].slice(1))
  assert.equal((await f.save({images})).status,400)
})

test('verified but unreferenced media remains private; stale save and withdrawal still protect',async()=>{
  const f=fixture(),images=await f.seedMedia(5),version=f.rows.get('1').updated_at
  assert.equal((await f.call(images[0],{auth:false})).status,401)
  assert.equal((await f.save({images})).status,200)
  assert.equal((await f.save({images},version)).status,409)
  assert.equal((await f.save({publication_status:'hidden'})).status,200)
  assert.equal((await f.call('/spot/cloudflare-loop-fixture-1',{auth:false})).status,404)
  assert.equal((await f.call(images[0],{auth:false})).status,401)
})

test('external mutation between validation and commit cannot expose substituted or deleted bytes',async()=>{
  const f=fixture(),images=await f.seedMedia(5),list=f.env.TEST_MEDIA.list
  f.env.TEST_MEDIA.list=async options=>{const snapshot=await list(options);f.objects.get(images[0].slice(1)).version='external-after-list';f.objects.delete(images[1].slice(1));return snapshot}
  // R2 and Postgres do not share a transaction. An external privileged writer
  // can invalidate the snapshot; the serving gate must recheck and fail closed.
  assert.equal((await f.save({images})).status,200)
  assert.equal((await f.call(images[0],{auth:false})).status,404)
  assert.equal((await f.call(images[1],{auth:false})).status,404)
})
