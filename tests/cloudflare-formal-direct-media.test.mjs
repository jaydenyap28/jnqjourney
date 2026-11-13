import test from 'node:test'
import assert from 'node:assert/strict'
import {createFormalDirectMedia} from '../cloudflare/admin-preview/formal-direct-media.mjs'
import {createFormalR2,mediaSha} from '../cloudflare/admin-preview/formal-r2-direct.mjs'
import {createFormalMediaChecks} from '../cloudflare/admin-preview/formal-media.mjs'
const actor='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222'
const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf1kAAAAASUVORK5CYII=','base64'),sha=await mediaSha(bytes)
const binding={kind:'spot',target:853,expectedVersion:'2026-11-13T00:00:00Z'}
function fixture(){
 const data=new Map(),objects=new Map();let clock=1000,failComplete=false
 const queue={async read(k){return data.get(k)||null},async createOnce(k,v){if(failComplete&&k.endsWith('-complete.json'))throw Error('uncertain');if(!data.has(k))data.set(k,structuredClone(v));return data.get(k)}}
 const meta={size:bytes.length,type:'image/png',etag:'"'+'a'.repeat(32)+'"'}
 const r2={async presign(k){return {putUrl:'https://synthetic.invalid/'+k}},async head(k){return objects.has(k)?meta:null},async get(k,p){assert.ok(objects.has(k));if(await mediaSha(objects.get(k))!==p.sha256)throw Error('invalid SHA');return {...meta,bytes:objects.get(k)}},async copy(from,to){objects.set(to,objects.get(from))}}
 const media=createFormalDirectMedia({queue,env:()=>'',r2,now:()=>clock,verifyPrivate:async()=>{},verifyBinding:async b=>{assert.deepEqual(b,binding);return binding}})
 const start=()=>media.start({type:'image/png',size:bytes.length,sha256:sha,rightsEvidence:'Synthetic generated test',binding},actor)
 async function uploaded(){const t=await start();objects.set('_admin-formal-drafts/_staging/'+t.ticket+'.png',bytes);return t}
 return {data,objects,media,start,uploaded,setClock:v=>clock=v,setFailure:()=>failComplete=true}
}
test('short PUT signs exact MIME, size, create-only condition and fixed staging scope',async()=>{
 const r2=createFormalR2(n=>n.includes('ACCESS_KEY_ID')?'synthetic-access':'synthetic-secret')
 const p=await r2.presign('_admin-formal-drafts/_staging/11111111-1111-4111-8111-111111111111.png','image/png',bytes.length)
 const u=new URL(p.putUrl);assert.equal(u.searchParams.get('X-Amz-Expires'),'120');assert.equal(u.searchParams.get('X-Amz-SignedHeaders'),'content-length;content-type;host;if-none-match')
 await assert.rejects(r2.presign('_admin-formal-drafts/'+sha+'.png','image/png',bytes.length))
 await assert.rejects(r2.presign('_admin-formal-drafts/_staging/11111111-1111-4111-8111-111111111111.png','image/png',10485761))
})
test('real-byte proof precedes master, owner, context receipt; other owner rejected',async()=>{
 const f=fixture(),t=await f.uploaded(),saved=await f.media.finish(t,actor)
 assert.equal(saved.url,'/admin-draft-media/'+sha+'.png')
 await assert.rejects(f.media.finish(t,other),e=>e.status===403)
 await assert.rejects(f.media.get(sha+'.png',other),e=>e.status===403)
 await f.media.verifyIdentity(sha+'.png',{actor,binding,proofs:{[sha+'.png']:saved.proof}},true)
 await assert.rejects(f.media.verifyIdentity(sha+'.png',{actor,binding:{...binding,expectedVersion:'stale'},proofs:{[sha+'.png']:saved.proof}},true),e=>e.status===409)
})
test('concurrent complete claims once; retry confirms; cancel never deletes verified bytes',async()=>{
 const f=fixture(),t=await f.uploaded(),results=await Promise.allSettled([f.media.finish(t,actor),f.media.finish(t,actor)])
 assert.equal(results.filter(v=>v.status==='fulfilled').length,1);assert.equal(results.filter(v=>v.status==='rejected').length,1)
 const saved=await f.media.finish(t,actor);await assert.rejects(f.media.finish(t,actor,true),e=>e.status===409)
 assert.ok(f.objects.has('_admin-formal-drafts/'+sha+'.png'));assert.ok(saved.verified)
})
test('expiry, missing upload and hash mismatch cannot register or report success',async()=>{
 const f=fixture(),t=await f.start();f.setClock(122001);await assert.rejects(f.media.finish(t,actor),e=>e.status===410)
 const g=fixture(),s=await g.start();await assert.rejects(g.media.finish(s,actor));assert.ok(!g.data.has('_media/'+sha+'.png'))
 const h=fixture(),x=await h.uploaded();h.objects.set('_admin-formal-drafts/_staging/'+x.ticket+'.png',Buffer.from('not the image'));await assert.rejects(h.media.finish(x,actor));assert.ok(!h.data.has('_media/'+sha+'.png'))
})
test('uncertain complete keeps processing claim/final object, never retries copy as success',async()=>{
 const f=fixture(),t=await f.uploaded();f.setFailure();await assert.rejects(f.media.finish(t,actor));assert.ok(f.objects.has('_admin-formal-drafts/'+sha+'.png'));await assert.rejects(f.media.finish(t,actor),e=>e.status===409)
})
test('revoked masters, forged context proofs and focus fragments are checked before reference save',async()=>{
 const f=fixture(),t=await f.uploaded(),s=await f.media.finish(t,actor),m=createFormalMediaChecks(f.media)
 await assert.rejects(m.verifyChanges({image_url:s.url},null,{actor,binding,proofs:{}}),e=>e.status===403)
 await m.verifyChanges({image_url:s.url+'#focus=50,50'},null,{actor,binding,proofs:{[sha+'.png']:s.proof}})
 f.data.get('_media/'+sha+'.png'+'.json').revoked=true
 await assert.rejects(m.verifyChanges({image_url:s.url},{image_url:s.url},{actor,binding}),e=>e.status===404)
})
