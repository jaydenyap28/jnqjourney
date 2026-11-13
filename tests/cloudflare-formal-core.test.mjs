import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { createFormalPreparedApi } from '../cloudflare/admin-preview/formal-api.mjs'
import { FORMAL_PRIVATE_SCOPE as scope, FORMAL_RELEASE_GATES } from '../cloudflare/admin-preview/formal-runtime.mjs'
import { formalMutationOnce } from '../cloudflare/admin-preview/formal-idempotency.mjs'
import { makeFormalPublication, verifyFormalJob, formalDigest } from '../cloudflare/admin-preview/formal-publication.mjs'
import { createFormalMediaChecks } from '../cloudflare/admin-preview/formal-media.mjs'
import { formalPublisherTick } from '../scripts/cloudflare/formal-publisher-core.mjs'
import { applyFormalPrivateBootstrap } from '../cloudflare/admin-preview/formal-bootstrap.mjs'
import { sha256 } from '../cloudflare/admin-preview/publication.mjs'
import { prepareFormalSlugEdit, projectFormalSlugs } from '../cloudflare/admin-preview/formal-slugs.mjs'
const require=createRequire(import.meta.url),load=require('./helpers/load-local-ts.cjs')
const {createScopedAdminStore}=load(path.resolve('cloudflare/admin-preview/store.ts'))
const {createFormalMutations}=load(path.resolve('cloudflare/admin-preview/formal-mutations.ts'))
const {createScopedDraftMedia}=load(path.resolve('cloudflare/admin-preview/media.ts'))
const {createFormalServices}=load(path.resolve('cloudflare/admin-preview/formal-services.ts'))
const editor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',publisher='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',ordinary='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const version='2026-11-13T00:00:00.000Z', id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const active=id=>({id,name:'Synthetic '+id,status:'active',publication_status:null,updated_at:version})
function memory(){const rows=new Map();return {rows,read:async key=>structuredClone(rows.get(key)??null),write:async(key,value)=>{rows.set(key,structuredClone(value))},createOnce:async(key,value)=>{if(!rows.has(key))rows.set(key,structuredClone(value));return structuredClone(rows.get(key))}}}
const request=(route,actor=editor,method='POST')=>new Request('https://example.invalid/functions/v1/jnq-admin-formal'+route,{method,headers:{Origin:scope.origin,Authorization:'Bearer '+actor,'Content-Type':'application/json'},...(method==='GET'?{}:{body:'{}'})})

test('compiled OFF cannot be overridden by all remote settings; no writer or media/queue port called',async()=>{
  let calls=0
  const api=createFormalPreparedApi({scope,settings:{writes:true,uploads:true,publication:true},editors:[editor],publishers:[publisher],getIdentity:async value=>value,load:async()=>({}),
    mutations:{spot:()=>{calls++}},media:{upload:()=>{calls++}},publication:()=>{calls++}})
  for(const route of ['/admin/locations','/admin/notes','/admin/guides','/upload/r2'])assert.equal((await api(request(route))).status,405)
  assert.equal((await api(request('/publication',publisher))).status,405)
  assert.equal(calls,0);assert.ok(Object.values(FORMAL_RELEASE_GATES).every(value=>value===false))
})
test('Editor and Publisher are independent server UUID roles; ordinary identities and forged metadata denied',async()=>{
  const api=createFormalPreparedApi({scope,settings:{writes:true,publication:true},gates:{writes:true,publication:true},editors:[editor],publishers:[publisher],getIdentity:async value=>[editor,publisher,ordinary].includes(value)?value:null,load:async()=>({}),mutations:{spot:async()=>({data:{id:1}})},media:{},publication:async()=>({state:'queued'})})
  assert.equal((await api(request('/publication',editor))).status,403)
  assert.equal((await api(request('/admin/locations',publisher))).status,403)
  assert.equal((await api(request('/admin/locations',ordinary))).status,403)
  assert.equal((await api(request('/admin/locations','forged'))).status,401)
  assert.equal((await api(request('/admin/locations'))).status,200)
})
test('same mutation is committed once; changed payload and uncertain outcomes cannot retry the database',async()=>{
  const queue=memory();let calls=0
  const intent={id,actor:editor,operation:'POST:spot',body:{name:'Synthetic'}}
  const action=async()=>{calls++;return {data:{id:700}}}
  assert.deepEqual(await formalMutationOnce(queue,intent,action),await formalMutationOnce(queue,intent,action))
  assert.equal(calls,1)
  await assert.rejects(formalMutationOnce(queue,{...intent,body:{name:'Other'}},action),/REUSED/)
  const unknown={...intent,id:publisher}
  await assert.rejects(formalMutationOnce(queue,unknown,async()=>{calls++;throw Error('network result unknown')}))
  await assert.rejects(formalMutationOnce(queue,unknown,action),/RECONCILE/)
  assert.equal(calls,2)
})
test('concurrent duplicate mutation reserves only one writer',async()=>{
  const queue=memory();let calls=0
  const results=await Promise.allSettled([1,2].map(()=>formalMutationOnce(queue,{id,actor:editor,operation:'save',body:{}},async()=>{calls++;return {saved:true}})))
  assert.equal(calls,1);assert.ok(results.some(result=>result.status==='fulfilled'))
  for(const result of results) if(result.status==='fulfilled')assert.deepEqual(result.value,{saved:true})
})

function feeds(){return {'database.json':{projectRef:scope.projectRef,locations:[active(1),active(2)],inventory:[active(1),active(2)],regions:[{id:1}],packages:[{id:1}]},'notes.json':{notes:[{slug:'note',title:'Note',updatedAt:version,published:true}]},'guides.json':{guides:[{slug:'guide',title:'Guide',updatedAt:version}]},'location-slugs.json':{},'english.json':{records:[]}}}
test('full publication keeps untouched records/modules and does not publish an unselected edit',async()=>{
  const original=feeds(),authority=feeds();authority['database.json'].locations[0].description='approved';authority['notes.json'].notes[0].title='unselected draft edit'
  authority['database.json'].locations[0].review_jayden='synthetic private remark'
  const options={authority,baseline:{revision:'baseline',feeds:original},selection:[{kind:'spot',key:'1',version,action:'publish'}],requestedBy:publisher}
  const job=await makeFormalPublication(options),again=await makeFormalPublication(options)
  assert.equal(job.id,again.id);assert.equal(job.payload.feeds['database.json'].locations.length,2)
  assert.equal(job.payload.feeds['notes.json'].notes[0].title,'Note')
  assert.deepEqual(job.payload.feeds['database.json'].packages,original['database.json'].packages)
  assert.ok(!JSON.stringify(job.payload.feeds).includes('synthetic private remark'))
  await verifyFormalJob(job,authority,'baseline')
  authority['database.json'].locations[1].updated_at='2026-11-13T01:00:00Z'
  await assert.rejects(verifyFormalJob(job,authority,'baseline'),/CHANGED/)
})
test('current hidden records cannot survive in retained baseline; exact withdrawal review required',async()=>{
  const original=feeds(),authority=feeds();authority['database.json'].locations[1].publication_status='hidden'
  const options={authority,baseline:{revision:'baseline',feeds:original},selection:[{kind:'spot',key:'1',version,action:'publish'}]}
  let review
  try{await makeFormalPublication(options)}catch(error){review=error}
  assert.deepEqual(review.removed,{spot:[2],note:[],guide:[]})
  const job=await makeFormalPublication({...options,approvedRemovalDigest:review.removalDigest})
  assert.deepEqual(job.payload.feeds['database.json'].locations.map(row=>row.id),[1])
})
test('forged approval versions and drafts are refused; unselected new ready records stay outside the public projection',async()=>{
  const authority=feeds(),baseline={revision:'baseline',feeds:feeds()}
  authority['database.json'].locations[0].description='new approved display text'
  authority['database.json'].locations.push(active(3));authority['database.json'].inventory.push(active(3))
  const selection=[{kind:'spot',key:'1',version,action:'publish'}]
  const job=await makeFormalPublication({authority,baseline,selection})
  assert.equal(job.payload.feeds['database.json'].inventory.find(row=>row.id===3).publication_status,'draft')
  await assert.rejects(makeFormalPublication({authority,baseline,selection:[{...selection[0],version:'forged'}]}),/STALE/)
  authority['database.json'].locations[0].publication_status='draft'
  await assert.rejects(makeFormalPublication({authority,baseline,selection}),/NOT_PUBLIC/)
})
test('re-publishing unchanged content does not create another build',async()=>{
  await assert.rejects(makeFormalPublication({authority:feeds(),baseline:{revision:'baseline',feeds:feeds()},selection:[{kind:'spot',key:'1',version,action:'publish'}]}),/NO_PUBLIC_CHANGES/)
})
test('new private references require actual verified media; old same-record references are preserved without a global scan',async()=>{
  const name='a'.repeat(64)+'.png',seen=[]
  const media=createFormalMediaChecks({get:async name=>{seen.push(name)}})
  const previous={image_url:'https://legacy.example/owned.png'}
  await media.verifyChanges({...previous,images:['/admin-draft-media/'+name]},previous)
  assert.deepEqual(seen,[name])
  await assert.rejects(media.verifyChanges({image_url:'https://unapproved.example/photo.png'},previous),/PRIVATE_UPLOAD/)
  await assert.rejects(media.verifyChanges({image_url:'/admin-draft-media/../secret'},previous),/NAME_INVALID/)
})

function fakeBucket(){const objects=new Map([['_system/notes-latest.webp','_system/notes/1794441600000.webp'],['_system/notes/1794441600000.webp','[]']]);let uncertain=false
  return {objects,setUncertain:()=>{uncertain=true},download:async key=>objects.has(key)?{data:new Blob([objects.get(key)])}:{error:{status:404}},
    upload:async(key,value,options)=>{if(objects.has(key)&&!options.upsert)return {error:{status:409}};objects.set(key,value);if(uncertain&&key==='_system/notes-latest.webp')return {error:{status:503}};return {data:{path:key}}},remove:async keys=>{keys.forEach(key=>objects.delete(key));return {data:[]}}}}
test('reused private version store locks concurrent writers and retains its lock on uncertain pointer commit',async()=>{
  const bucket=fakeBucket(),db={storage:{from:()=>bucket}}
  const store=createScopedAdminStore(db,'synthetic-private')
  const results=await Promise.allSettled([1,2].map(value=>store.update('notes',rows=>[...rows,{slug:'note-'+value}])))
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1)
  assert.equal((await store.read('notes')).length,1)
  bucket.setUncertain();await assert.rejects(store.update('notes',rows=>rows))
  assert.ok(bucket.objects.has('_system/notes-write-lock.webp'))
  await assert.rejects(store.update('notes',rows=>rows))
})
test('public authority targets and failed privacy guard cannot receive a new version',async()=>{
  const bucket=fakeBucket(),db={storage:{from:()=>bucket}}
  assert.throws(()=>createScopedAdminStore(db,'location-images'))
  const store=createScopedAdminStore(db,'synthetic-private',async()=>{throw Error('public metadata')})
  await assert.rejects(store.update('notes',()=>[]));assert.equal(bucket.objects.size,2)
})
test('formal Spot adapter omits insert IDs and enforces the real conditional update after media checks',async()=>{
  const writes=[];let current={...active(10),updated_at:null},conflict=false
  const db={from:()=>{const q={select(){return q},eq(){return q},is(){q.nullVersion=true;return q},insert(values){writes.push({type:'insert',values});return q},update(values){writes.push({type:'update',values});return q},async single(){return {data:{id:701,updated_at:version}}},async maybeSingle(){return writes.length?{data:conflict?null:{id:10,updated_at:version}}:{data:current}}};return q}}
  let checked=0;const adapter=createFormalMutations({db,verifyPrivate:async()=>{},store:{},media:{verifyChanges:async()=>{checked++}}})
  await adapter.spot('POST',{data:{name:'Synthetic insert',status:'active'}})
  assert.ok(!Object.hasOwn(writes[0].values,'id'));assert.equal(writes[0].values.publication_status,'draft');assert.equal(checked,1)
  writes.length=0;await adapter.spot('PATCH',{id:10,expectedUpdatedAt:null,data:{description:'change'}})
  assert.equal(writes[0].type,'update')
  writes.length=0;conflict=true;await assert.rejects(adapter.spot('PATCH',{id:10,expectedUpdatedAt:null,data:{description:'change'}}),/VERSION_CONFLICT/)
})
test('scoped R2 getter verifies real supplied bytes, MIME, hash and signature using only a synthetic transport',async()=>{
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf1kAAAAASUVORK5CYII=','base64')
  const name=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex')+'.png'
  const original=globalThis.fetch;let mismatch=false
  globalThis.fetch=async(url,init)=>{assert.ok(String(url).includes('/synthetic-private/_admin-formal-drafts/'));assert.ok(init.headers.authorization.startsWith('AWS4-HMAC-SHA256'));return new Response(bytes,{headers:{'content-length':String(bytes.length),'content-type':mismatch?'image/jpeg':'image/png'}})}
  try{const media=createScopedDraftMedia(()=> 'synthetic-only', {bucket:'synthetic-private',prefix:'_admin-formal-drafts',mediaPrefix:'/admin-draft-media/',accessName:'synthetic-access',secretName:'synthetic-secret'});assert.deepEqual(Buffer.from((await media.get(name)).bytes),bytes);mismatch=true;await assert.rejects(media.get(name))}finally{globalThis.fetch=original}
})
test('PostgREST network uncertainty stays 503; definite SQL rejection does not masquerade as an uncertain insert',async()=>{
  let code=''
  const db={from:()=>({insert(){return this},select(){return this},async single(){return {data:null,error:{code}}}})}
  const adapter=createFormalMutations({db,store:{},verifyPrivate:async()=>{},media:{verifyChanges:async()=>{}}})
  await assert.rejects(adapter.spot('POST',{data:{name:'Synthetic'}}),error=>error.status===503&&/UNCONFIRMED/.test(error.code))
  code='23503'
  await assert.rejects(adapter.spot('POST',{data:{name:'Synthetic'}}),error=>error.status===422&&/REJECTED/.test(error.code))
})
test('server media receipt plus current HEAD identity gates references; previews still re-hash bytes and revoked objects stop before R2',async()=>{
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf1kAAAAASUVORK5CYII=','base64')
  const hash=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex'),name=hash+'.png',etag='"'+'a'.repeat(32)+'"'
  const receipt={bucket:scope.mediaBucket,key:scope.mediaPrefix+'/'+name,sha256:hash,size:bytes.length,etag,rightsEvidence:'Synthetic test owner',revoked:false}
  const bucket={download:async()=>({data:new Blob([JSON.stringify(receipt)])})}
  const service=createFormalServices({db:{storage:{from:()=>bucket}},anonKey:'synthetic',scope,settings:{privateMediaReady:true},env:()=> 'synthetic'})
  const previous=global.fetch;let changed=false,calls=0
  global.fetch=async(_url,init)=>{calls++;return new Response(init.method==='HEAD'?null:bytes,{headers:{'content-length':String(bytes.length),'content-type':'image/png',etag:changed?'"'+'b'.repeat(32)+'"':etag}})}
  try{
    await service.media.verifyChanges({image_url:'/admin-draft-media/'+name},null)
    assert.equal(calls,1)
    assert.deepEqual(Buffer.from((await service.media.get(name)).bytes),bytes)
    changed=true;await assert.rejects(service.media.verifyChanges({image_url:'/admin-draft-media/'+name},null),/IDENTITY_CHANGED/)
    const before=calls;receipt.revoked=true;await assert.rejects(service.media.get(name),/NOT_VERIFIED/);assert.equal(calls,before)
  }finally{global.fetch=previous}
})

test('publisher disabled performs no I/O; unknown upload is never submitted a second time',async()=>{
  assert.deepEqual(await formalPublisherTick({ports:new Proxy({}, {get(){throw Error('must not touch ports')}})}),{state:'disabled'})
  let submits=0,releases=0
  const result=await formalPublisherTick({enabled:true,ports:{lock:async()=>({release:async()=>{releases++}}),pending:async()=>({id:'pending'}),findDeployment:async()=>null,submit:async()=>{submits++}}})
  assert.equal(result.state,'verifying');assert.equal(submits,0);assert.equal(releases,1)
})
test('publisher journals before upload and confirms only after actual deployment verification + atomic live receipt',async()=>{
  const order=[],job={id:'job'},ports={lock:async()=>({release:async()=>order.push('release')}),pending:async()=>null,latest:async()=>job,state:async()=>({state:'queued'}),ledger:async()=>[],verifyAuthority:async()=>order.push('authority'),recordAttempt:async()=>order.push('budget'),progress:async(_job,state)=>order.push(state.state),build:async()=>({output:'synthetic'}),prepareSubmission:async()=>({id:'job',attempt:1}),savePending:async()=>order.push('journal'),submit:async()=>{order.push('submit');throw Error('timeout')}}
  assert.equal((await formalPublisherTick({enabled:true,ports})).state,'verifying');assert.ok(order.indexOf('journal')<order.indexOf('submit'))
  order.length=0;Object.assign(ports,{pending:async()=>job,findDeployment:async()=>({id:'deployment',latest_stage:{status:'success'}}),verifyDeployment:async()=>order.push('verify-bytes'),alreadyCommitted:async()=>false,commit:async()=>order.push('atomic-live'),clearPending:async()=>order.push('clear')})
  assert.equal((await formalPublisherTick({enabled:true,ports})).state,'succeeded');assert.ok(order.indexOf('verify-bytes')<order.indexOf('atomic-live'));assert.ok(order.indexOf('atomic-live')<order.indexOf('succeeded'))
})
test('publisher retains 8/day and cooldown budget without building; interrupted pre-submit builds recover to a new attempt',async()=>{
  let built=0,progress
  const base={lock:async()=>({release:async()=>{}}),pending:async()=>null,latest:async()=>({id:'job'}),state:async()=>({state:'queued'}),ledger:async()=>[{startedAt:'2026-11-13T00:00:00Z'}],build:async()=>{built++},progress:async(_job,value)=>{progress=value}}
  const result=await formalPublisherTick({enabled:true,ports:base,now:Date.parse('2026-11-13T00:01:00Z')});assert.equal(result.state,'queued');assert.equal(built,0)
  await formalPublisherTick({enabled:true,ports:{...base,state:async()=>({state:'building',attempt:1})}});assert.equal(progress.attempt,2)
})
test('stale preflight gets an explicit failed receipt rather than remaining queued forever',async()=>{
  let progress
  const ports={lock:async()=>({release:async()=>{}}),pending:async()=>null,latest:async()=>({id:'job'}),state:async()=>({state:'queued'}),ledger:async()=>[],verifyAuthority:async()=>{throw Error('stale')},progress:async(_job,value)=>{progress=value}}
  assert.equal((await formalPublisherTick({enabled:true,ports})).state,'failed')
  assert.equal(progress.retryable,false)
})

test('approved private bootstrap is create-only, byte-verified, idempotent and never changes source pointers',async()=>{
  const data=feeds(),bucket=fakeBucket();bucket.objects.clear()
  const source={projectRef:scope.projectRef,slugMap:{}}
  for(const kind of ['notes','guides']){const bytes=JSON.stringify(data[kind+'.json'][kind]);source[kind]={pointer:`_system/${kind}/1794441600000.webp`,bytes,sha256:await sha256(bytes)}}
  const options={target:{supabaseUrl:`https://${scope.projectRef}.supabase.co`,storage:{from:()=>bucket}},source,
    baseline:{feeds:data,revision:await formalDigest(data),deploymentId:'synthetic-accepted'},verifyPrivate:async()=>{}}
  await assert.rejects(applyFormalPrivateBootstrap(options),/NOT_APPROVED/);assert.equal(bucket.objects.size,0)
  const before=JSON.stringify(source)
  assert.equal((await applyFormalPrivateBootstrap({...options,approved:true})).copied,8)
  assert.equal((await applyFormalPrivateBootstrap({...options,approved:true})).sourceWrites,0)
  assert.equal(JSON.stringify(source),before)
  bucket.objects.set('_publication/live.json','conflicting existing state')
  await assert.rejects(applyFormalPrivateBootstrap({...options,approved:true}),/CONFLICT_OR_UNKNOWN/)
  assert.equal(bucket.objects.get('_publication/live.json'),'conflicting existing state')
})
test('slug saves retain original ID mappings and refuse conflicting writes for the same Spot version',()=>{
  const spot=active(1),body={id:1,slug:'synthetic-custom',expectedUpdatedAt:version}
  const records=prepareFormalSlugEdit([],body,spot)
  assert.equal(projectFormalSlugs({'2':'keep-original'},records,[spot],[spot])['2'],'keep-original')
  assert.equal(projectFormalSlugs({},records,[spot],[])['1'],'synthetic-custom')
  assert.throws(()=>prepareFormalSlugEdit(records,{...body,slug:'conflicting'},spot),/VERSION_CONFLICT/)
  assert.throws(()=>projectFormalSlugs({},[],[spot],[]),/VERSION_PENDING/)
})
