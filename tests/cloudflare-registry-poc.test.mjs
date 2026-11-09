import test from 'node:test'
import assert from 'node:assert/strict'
import {writeFile,mkdir,readFile} from 'node:fs/promises'
import {registryFixture} from './helpers/media-registry-poc-fixture.mjs'
import {fixture as originalFixture} from './helpers/cloudflare-spot-fixture.mjs'
const originalFetch=globalThis.fetch
let networkAttempts=0
globalThis.fetch=async()=>{networkAttempts++;throw Error('NETWORK_FORBIDDEN_IN_LOCAL_POC')}
const evidence={scope:'LOCAL_SYNTHETIC_ONLY',database:'In-memory serial transaction model; not Postgres or RLS validation',nativeCpuMeasured:false,remoteSqlExecuted:false,previewDeployed:false,albumCases:[],failureCases:[]}
const delta=(after,before)=>Object.fromEntries(Object.keys(after).map(k=>[k,after[k]-before[k]]))
const envelope=(f,data)=>({expectedUpdatedAt:f.legacy.rows.get('1').updated_at,data})
async function denied(promise,code){await assert.rejects(promise,error=>!code||error.code===code);if(code)evidence.failureCases.push(code)}

for(const count of [1,5,17,30])test(`registry: ${count} first and unchanged images, exact local port counts`,async()=>{
  const f=registryFixture(),images=await f.ready(count)
  assert.equal(f.model.calls.register,count)
  const data={image_url:images[0],images,image_metadata:Object.fromEntries(images.map(p=>[p,{alt_zh:'合成',alt_en:'Synthetic'}]))}
  for(const phase of ['first','unchanged']){
    const r2={...f.legacy.counts()},db={...f.model.calls}
    const row=await f.save(data)
    assert.equal(row.images.length,count)
    const r2Delta=delta(f.legacy.counts(),r2),dbDelta=delta(f.model.calls,db)
    assert.deepEqual(r2Delta,{get:0,head:0,list:2});assert.equal(dbDelta.commit,1);assert.equal(dbDelta.readSpot,0)
    evidence.albumCases.push({images:count,phase,r2SimulatedCalls:r2Delta,databaseSimulatedCalls:dbDelta,remoteOperationModel:3,nativeCpuMs:null})
  }
  const object=await f.poc.media('1',images[0].slice(1));await object.body.cancel()
})

test('browser cannot provide server proof, observation, role or invoke the registry port',async()=>{
  const f=registryFixture(),[image]=await f.ready(1),data={image_url:image,images:[image]}
  await denied(f.poc.save('1',{...envelope(f,data),snapshot:[{version:'forged'}]},f.model.principal),'INVALID_SAVE_ENVELOPE')
  await denied(f.poc.save('1',{...envelope(f,data),proofs:[{signatureChecked:true}]},f.model.principal),'INVALID_SAVE_ENVELOPE')
  await denied(f.save(data,undefined,{adminId:'synthetic-admin',role:'service_role'}),'ADMIN_OR_SERVICE_REQUIRED')
  await denied(f.model.db.registerVerified({}, {role:'service_role'}),'ADMIN_OR_SERVICE_REQUIRED')
})

test('R2 object and forged receipt without trusted complete registration are not publishable',async()=>{
  const f=registryFixture(),[image]=await f.legacy.seedMedia(1)
  await denied(f.save({image_url:image,images:[image]}),'MEDIA_NOT_REGISTERED_OR_ACTIVE')
  assert.deepEqual(f.legacy.rows.get('1').images,[])
})

test('pending, cancelled and bad-signature upload cannot become registry-ready',async()=>{
  const f=registryFixture(),key=await f.legacy.issue();await f.legacy.stage(key)
  await denied(f.save({image_url:'/'+key,images:['/'+key]}),'R2_OBJECT_MISSING')
  assert.equal((await f.legacy.finish(key,true)).status,200)
  assert.equal((await f.complete(key)).status,409);assert.equal(f.model.entries.size,0)
  const invalid=await f.legacy.issue();await f.r2.put(invalid.replace('media/candidate/','_candidate-staging/'),new Uint8Array(68),{httpMetadata:{contentType:'image/png'}})
  assert.equal((await f.complete(invalid)).status,415);assert.equal(f.model.entries.size,0)
})

test('expired upload ticket does not register or leave publishable final media',async()=>{
  const f=registryFixture(),key=await f.legacy.issue();await f.legacy.stage(key)
  const path='_candidate-tickets/'+key.slice('media/candidate/'.length)+'.json',entry=f.legacy.objects.get(path),ticket=JSON.parse(entry.bytes)
  ticket.expiresAt=0;entry.bytes=Buffer.from(JSON.stringify(ticket))
  assert.equal((await f.complete(key)).status,410);assert.equal(f.model.entries.size,0);assert.ok(!f.legacy.objects.has(key))
})

test('same ticket double complete and complete/cancel retain one copy and one identity',async()=>{
  const f=registryFixture(),key=await f.legacy.issue();await f.legacy.stage(key)
  const barrier=f.legacy.pauseCopy(),first=f.complete(key);await barrier.started
  assert.equal((await f.complete(key)).status,409);assert.equal((await f.legacy.finish(key,true)).status,409)
  barrier.release();assert.equal((await first).status,201);assert.equal((await f.complete(key)).status,201)
  assert.equal(f.legacy.copies(),1);assert.equal(f.model.entries.size,1);assert.ok(!f.legacy.deletes.includes(key))
})

test('different simultaneous completions do not lose entries; same-ticket CAS still has one owner',async()=>{
  const f=registryFixture(),keys=await Promise.all([f.legacy.issue(),f.legacy.issue()])
  await Promise.all(keys.map(key=>f.legacy.stage(key)))
  assert.deepEqual((await Promise.all(keys.map(key=>f.complete(key)))).map(r=>r.status),[201,201])
  assert.equal(f.model.entries.size,2)
  const key=await f.legacy.issue();await f.legacy.stage(key)
  assert.deepEqual((await Promise.all([f.complete(key),f.complete(key)])).map(r=>r.status).sort(),[201,409])
  assert.equal(f.model.entries.size,3)
})

test('first complete adds one modeled DB call and no additional R2 reads',async()=>{
  const f=registryFixture(),old=originalFixture(),key=await f.legacy.issue(),oldKey=await old.issue()
  await f.legacy.stage(key);await old.stage(oldKey)
  const before=f.legacy.counts(),oldBefore=old.counts()
  assert.equal((await f.complete(key)).status,201);assert.equal((await old.finish(oldKey)).status,201)
  const current=delta(f.legacy.counts(),before),baseline=delta(old.counts(),oldBefore)
  assert.deepEqual(current,baseline);assert.equal(f.model.calls.register,1)
  evidence.completeModel={baselineR2Reads:baseline,pocR2Reads:current,additionalDatabaseCalls:1,nativeCpuMs:null}
})

test('ambiguous receipt write is preserved and registration reconciles on trusted retry',async()=>{
  const f=registryFixture(),key=await f.legacy.issue();await f.legacy.stage(key);f.legacy.faultReceipt()
  assert.equal((await f.complete(key)).status,503);assert.equal(f.model.entries.size,0)
  assert.ok(f.legacy.objects.has(key));assert.ok(!f.legacy.deletes.includes(key))
  assert.equal((await f.complete(key)).status,201);assert.equal(f.model.entries.size,1)
})

for(const kind of ['before','after'])test(`registry ${kind}-commit failure preserves verified object; retry reconciles`,async()=>{
  const f=registryFixture(),key=await f.legacy.issue();await f.legacy.stage(key)
  if(kind==='before')f.model.failRegistrationBefore();else f.model.failRegistrationAfter()
  assert.equal((await f.complete(key)).status,503);assert.ok(f.legacy.objects.has(key));assert.ok(!f.legacy.deletes.includes(key))
  if(kind==='before')await denied(f.save({image_url:'/'+key,images:['/'+key]}),'MEDIA_NOT_REGISTERED_OR_ACTIVE')
  assert.equal((await f.complete(key)).status,201);assert.equal(f.model.entries.size,1);assert.equal(f.legacy.copies(),1)
  await f.save({image_url:'/'+key,images:['/'+key]})
})

for(const fault of ['replaceObject','deleteObject','corruptReceipt','deleteReceipt'])test(`${fault} after registration is rejected by batched identities`,async()=>{
  const f=registryFixture(),[image]=await f.ready(1),key=image.slice(1),receipt='_candidate-validation/'+key.slice('media/candidate/'.length)+'.json'
  if(fault==='replaceObject')await f.r2.put(key,new Uint8Array(68),{httpMetadata:{contentType:'image/png'}})
  if(fault==='deleteObject')await f.r2.delete(key)
  if(fault==='corruptReceipt')await f.r2.put(receipt,'{broken',{httpMetadata:{contentType:'application/json'}})
  if(fault==='deleteReceipt')await f.r2.delete(receipt)
  await denied(f.save({image_url:image,images:[image]}));assert.deepEqual(f.legacy.rows.get('1').images,[])
})

test('revocation is terminal; replay complete cannot resurrect, republish rejects',async()=>{
  const f=registryFixture(),[image]=await f.ready(1),key=image.slice(1)
  await f.save({image_url:image,images:[image]});await f.model.db.revoke('1',key,f.model.principal)
  assert.equal(f.legacy.rows.get('1').publication_status,'hidden')
  assert.equal((await f.complete(key)).status,503)
  await denied(f.save({image_url:image,images:[image],publication_status:'published'}),'MEDIA_NOT_REGISTERED_OR_ACTIVE')
  await denied(f.poc.media('1',key),'MEDIA_NOT_ACTIVE')
})

test('optional validity expiry is checked at commit and at media serving',async()=>{
  let time=Date.parse('2026-11-09T12:00:00Z')
  const f=registryFixture({clock:()=>time}),[image]=await f.ready(1),key=image.slice(1)
  f.model.setValidUntil(key,time+1);f.model.beforeCommit(async()=>{time+=2})
  await denied(f.save({image_url:image,images:[image]}),'MEDIA_EXPIRED_AT_COMMIT')
  await denied(f.poc.media('1',key),'MEDIA_NOT_ACTIVE')
})

test('registration identity is immutable, cross-Spot reference rejected, stale save cannot win',async()=>{
  const f=registryFixture(),[image]=await f.ready(1),entry=f.model.entries.get(image.slice(1)),version=f.legacy.rows.get('1').updated_at
  await denied(f.model.db.registerVerified({...entry,version:'forged-version'},f.model.principal),'REGISTRATION_IDENTITY_CONFLICT')
  await denied(f.save({image_url:image.replace('/1/','/2/'),images:[] }),'INVALID_MEDIA_REFERENCE')
  await f.save({image_url:image,images:[image]})
  await denied(f.save({image_url:image,images:[image]},version),'SPOT_VERSION_CONFLICT')
})

test('save/revoke serializations never leave a revoked referenced Spot publicly live',async()=>{
  for(const revokeFirst of [true,false]){
    const f=registryFixture(),[image]=await f.ready(1),key=image.slice(1)
    const save=()=>f.save({image_url:image,images:[image]}),revoke=()=>f.model.db.revoke('1',key,f.model.principal)
    if(revokeFirst){await revoke();await denied(save(),'MEDIA_NOT_REGISTERED_OR_ACTIVE')}
    else{
      let entered,release
      const started=new Promise(resolve=>{entered=resolve}),barrier=new Promise(resolve=>{release=resolve})
      f.model.beforeCommit(async()=>{entered();await barrier})
      const saving=save();await started;const revoking=revoke();release()
      await saving;await revoking
    }
    assert.ok(f.legacy.rows.get('1').publication_status==='hidden'||!f.legacy.rows.get('1').images.includes(image))
    await denied(f.poc.media('1',key),'MEDIA_NOT_ACTIVE')
  }
})

test('receipt mutation after the R2 snapshot is also refused when served',async()=>{
  const f=registryFixture(),[image]=await f.ready(1),key=image.slice(1),receipt='_candidate-validation/'+key.slice('media/candidate/'.length)+'.json'
  f.model.beforeCommit(async()=>{await f.r2.put(receipt,JSON.stringify({untrusted:true}),{httpMetadata:{contentType:'application/json'}})})
  await f.save({image_url:image,images:[image]})
  await denied(f.poc.media('1',key),'LIVE_RECEIPT_CHANGED')
})

test('post-snapshot privileged replacement/deletion still fails closed when served',async()=>{
  for(const mutation of ['replace','delete']){
    const f=registryFixture(),[image]=await f.ready(1),key=image.slice(1)
    f.model.beforeCommit(async()=>{if(mutation==='replace')await f.r2.put(key,new Uint8Array(68),{httpMetadata:{contentType:'image/png'}});else await f.r2.delete(key)})
    await f.save({image_url:image,images:[image]})
    await denied(f.poc.media('1',key),'LIVE_OBJECT_CHANGED')
  }
})

test('unreferenced/private, withdrawal without R2, deletion and partial edits preserve protection',async()=>{
  const f=registryFixture(),[image]=await f.ready(1),key=image.slice(1)
  await denied(f.poc.media('1',key),'MEDIA_PRIVATE')
  const preview=await f.poc.media('1',key,f.model.principal);await preview.body.cancel()
  await f.save({image_url:image,images:[image]})
  const before=f.model.calls.readSpot;await f.save({name:'Partial update'});assert.equal(f.model.calls.readSpot-before,1)
  const list=f.r2.list;f.r2.list=async()=>{throw Error('R2 outage')}
  await f.save({publication_status:'hidden'});await denied(f.poc.media('1',key),'MEDIA_PRIVATE');f.r2.list=list
  await f.model.db.deleteSpot('1',f.legacy.rows.get('1').updated_at,f.model.principal)
  await denied(f.poc.media('1',key),'SPOT_MISSING');assert.ok(f.legacy.objects.has(key))
})

test('truncated listings use bounded exact HEAD and never approve missing identities',async()=>{
  const f=registryFixture(),images=await f.ready(5),list=f.r2.list
  f.r2.list=async options=>({...await list(options),objects:[],truncated:true})
  const before=f.legacy.counts();await f.save({images,image_url:images[0]});const counts=delta(f.legacy.counts(),before)
  assert.deepEqual(counts,{get:0,head:10,list:2})
  await f.r2.delete(images[2].slice(1));await denied(f.save({images,image_url:images[0]}),'R2_OBJECT_MISSING')
})

test('deployable Worker, upload signer and packager do not import local PoC',async()=>{
  for(const file of ['cloudflare/spot-loop/worker.mjs','scripts/cloudflare/package-spot-loop.mjs'])assert.doesNotMatch(await readFile(file,'utf8'),/trusted-media-registry|registryModel|AsyncLocalStorage/)
  assert.equal(networkAttempts,0)
})

test.after(async()=>{
  globalThis.fetch=originalFetch;evidence.networkAttempts=networkAttempts
  await mkdir('artifacts/cloudflare-media-registry-poc',{recursive:true})
  await writeFile('artifacts/cloudflare-media-registry-poc/local-results.json',JSON.stringify(evidence,null,2))
})
