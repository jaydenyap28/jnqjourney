import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {fixture,base,png} from './helpers/cloudflare-spot-fixture.mjs'

test('real statuses, nullable version and full editorial fields retain their types',async()=>{
  const f=fixture();f.rows.get('1').updated_at=null
  const data={category:'景点',latitude:1.2,longitude:103.5,region_id:7,description:null,review:'A',review_jayden:'B',review_qing:'C',price_info:{currency:'MYR',adult:10},tags:['family'],visit_date:'2026-11-09',is_visited:false,opening_hours:null,google_maps_url:'https://maps.example.invalid/place',video_url:null,facebook_video_url:null,related_note_slugs:['cloudflare-loop-note'],publication_status:null,image_metadata:null,images:null}
  assert.equal((await f.save(data,null)).status,200)
  assert.deepEqual(f.rows.get('1').price_info,data.price_info)
  assert.equal((await f.save({name:'stale'},null)).status,409)
  for(const status of ['temporarily_closed','permanently_closed',null,'inactive']){
    assert.equal((await f.save({status})).status,200)
    assert.equal((await f.call('/spot/cloudflare-loop-fixture-1',{auth:false})).status,404)
  }
  assert.equal((await f.save({status:'active'})).status,200)
  assert.equal((await f.call('/spot/cloudflare-loop-fixture-1',{auth:false})).status,200)
  for(const data of [{latitude:91},{longitude:181},{id:2},{updated_at:null},{publication_status:'deleted'},{tags:{}},{image_metadata:{x:{script:'bad'}}},{images:['https://production.invalid/a.png']},{visit_date:'2026-02-31'}])assert.equal((await f.save(data)).status,400)
})

test('safe numeric-string IDs are supported and missing/unknown source state fails closed',async()=>{
  const f=fixture();f.rows.get('1').id='1'
  assert.equal((await f.call(base)).status,200)
  f.rows.get('1').id=9007199254740992
  assert.equal((await f.call(base)).status,503)
  f.rows.get('1').id=1;f.rows.get('1').status='unknown'
  assert.equal((await f.call(base)).status,503)
  f.rows.get('1').status='active';delete f.rows.get('1').updated_at
  assert.equal((await f.call(base)).status,503)
})

for(const count of [17,30])test(`${count}-image gallery uses unique validation reads and preserves all metadata`,async()=>{
  const f=fixture(),images=await f.seedMedia(count),before=f.reads()
  const metadata={[images[0]]:{alt_zh:'中文 ALT',alt_en:'English ALT',caption:'Caption <unsafe>'}}
  assert.equal((await f.save({image_url:images[0],images,image_metadata:metadata})).status,200)
  assert.equal(f.reads()-before,count+1)
  const response=await f.call('/spot/cloudflare-loop-fixture-1',{auth:false}),html=await response.text()
  assert.equal((html.match(/<img /g)||[]).length,count)
  assert.match(html,/中文 ALT/);assert.match(html,/Caption &lt;unsafe&gt;/)
  assert.equal((await f.call(images[0],{auth:false})).status,200)
})

test('deleted fixtures and unreferenced private media are unavailable to anonymous clients',async()=>{
  const f=fixture(),[image]=await f.seedMedia(1)
  assert.equal((await f.call(image,{auth:false})).status,401)
  assert.equal((await f.call(image)).status,200)
  assert.equal((await f.save({image_url:image})).status,200)
  const version=f.rows.get('1').updated_at
  assert.equal((await f.call(base,{method:'DELETE',body:{expectedUpdatedAt:'2020-01-01T00:00:00Z'}})).status,409)
  assert.equal((await f.call(base,{method:'DELETE',body:{expectedUpdatedAt:version}})).status,200)
  assert.equal((await f.call('/spot/cloudflare-loop-fixture-1',{auth:false})).status,404)
  assert.equal((await f.call(image,{auth:false})).status,404)
  assert.ok(f.objects.has(image.slice(1)),'Deletion must not delete potentially shared assets')
})

test('bounded redirects preserve first 302, reject cycles and block hidden final targets',async()=>{
  const f=fixture()
  Object.assign(f.rows.get('1'),{status:'permanently_closed',redirect_url:'/spot/cloudflare-loop-fixture-2',redirect_type:302})
  f.rows.get('2').redirect_url='/spot/cloudflare-loop-fixture-3'
  let response=await f.call('/en/spot/old-name-1',{auth:false})
  assert.equal(response.status,302);assert.equal(response.headers.get('Location'),'/spot/cloudflare-loop-fixture-3')
  f.rows.get('3').publication_status='hidden'
  assert.equal((await f.call('/spot/cloudflare-loop-fixture-1',{auth:false})).status,404)
  f.rows.get('3').publication_status=null;f.rows.get('3').redirect_url='/spot/cloudflare-loop-fixture-1'
  assert.equal((await f.call('/spot/cloudflare-loop-fixture-1',{auth:false})).status,503)
  f.rows.get('3').redirect_url=null
  f.rows.get('1').redirect_url=null
  assert.equal((await f.save({redirect_url:'/notes/cloudflare-loop-note',redirect_type:301})).status,200)
  response=await f.call('/spot/cloudflare-loop-fixture-1',{auth:false})
  assert.equal(response.status,301);assert.equal(response.headers.get('Location'),'/notes/cloudflare-loop-note')
  assert.equal((await f.save({redirect_url:'/notes/production-note'})).status,503)
})

test('complete owns one conditional ticket and competing complete/cancel cannot delete its result',async()=>{
  const f=fixture(),key=await f.issue();await f.stage(key)
  const barrier=f.pauseCopy(),first=f.finish(key)
  await barrier.started
  assert.equal((await f.finish(key)).status,409)
  assert.equal((await f.finish(key,true)).status,409)
  barrier.release()
  assert.equal((await first).status,201)
  const version=f.objects.get(key).version
  assert.equal((await f.save({image_url:'/'+key})).status,200)
  assert.equal((await f.finish(key)).status,201)
  assert.equal(f.copies(),1);assert.equal(f.objects.get(key).version,version)
  assert.equal((await f.finish(key,true)).status,409)
  assert.equal((await f.call('/'+key,{auth:false})).status,200)
  assert.ok(!f.deletes.includes(key))
})

test('cancel wins before complete and never runs an R2 copy',async()=>{
  const f=fixture(),key=await f.issue();await f.stage(key)
  assert.equal((await f.finish(key,true)).status,200)
  assert.equal((await f.finish(key)).status,409)
  assert.equal(f.copies(),0);assert.ok(!f.objects.has(key))
})

test('simultaneous same-ticket completion has one owner even before either sees processing',async()=>{
  const f=fixture(),key=await f.issue();await f.stage(key)
  const responses=await Promise.all([f.finish(key),f.finish(key)])
  assert.deepEqual(responses.map(response=>response.status).sort(),[201,409])
  assert.equal(f.copies(),1);assert.ok(!f.deletes.includes(key))
})

test('30-image metadata above 64 KiB fits the bounded save contract',async()=>{
  const f=fixture(),images=await f.seedMedia(30)
  const image_metadata=Object.fromEntries(images.map(image=>[image,{alt_zh:'合'.repeat(500),alt_en:'description'.repeat(100),caption:'caption'.repeat(100)}]))
  const data={image_url:images[0],images,image_metadata}
  assert.ok(Buffer.byteLength(JSON.stringify(data))>65536)
  assert.equal((await f.save(data)).status,200)
  assert.deepEqual(f.rows.get('1').image_metadata,image_metadata)
})

test('ambiguous receipt write cannot erase a verified object; retry is idempotent',async()=>{
  const f=fixture(),key=await f.issue();await f.stage(key);f.faultReceipt()
  assert.equal((await f.finish(key)).status,503)
  assert.ok(f.objects.has(key));assert.ok(!f.deletes.includes(key))
  assert.equal((await f.finish(key)).status,201)
  assert.equal(f.copies(),1)
  assert.equal((await f.save({image_url:'/'+key})).status,200)
  assert.equal(createHash('sha256').update(f.objects.get(key).bytes).digest('hex'),createHash('sha256').update(png).digest('hex'))
})

test('canonical bilingual aliases stay noindex and unconfigured Notes remain gated',async()=>{
  const f=fixture()
  let response=await f.call('/en/spot/old-name-1.html',{auth:false})
  assert.equal(response.status,301);assert.equal(response.headers.get('Location'),'/en/spot/cloudflare-loop-fixture-1')
  response=await f.call('/en/spot/cloudflare-loop-fixture-1',{auth:false})
  assert.match(await response.text(),/rel="canonical" href="https:\/\/www.jnqjourney.com\/en\/spot\/cloudflare-loop-fixture-1"/)
  assert.match(response.headers.get('X-Robots-Tag'),/noindex/)
  f.env.CANDIDATE_ENGLISH_VERSIONS=JSON.stringify({'1':f.rows.get('1').updated_at})
  response=await f.call('/spot/cloudflare-loop-fixture-1',{auth:false})
  assert.match(await response.text(),/hreflang="en"/)
  await f.save({description:'source changed'})
  response=await f.call('/spot/cloudflare-loop-fixture-1',{auth:false})
  assert.doesNotMatch(await response.text(),/hreflang="en"/)
  f.rows.get('1').redirect_url='/notes/not-in-fixtures'
  assert.equal((await f.call('/spot/cloudflare-loop-fixture-1',{auth:false})).status,503)
  delete f.env.ADMIN_EMAILS
  assert.equal((await f.save({name:'forbidden'})).status,503)
})
