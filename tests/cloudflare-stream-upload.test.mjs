import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createWorker} from '../cloudflare/spot-loop/worker.mjs'
import {FixtureFixedLengthStream} from './helpers/cloudflare-fixed-length.mjs'

// This shim checks stream contracts only; native CPU is measured in Preview.
globalThis.FixedLengthStream=FixtureFixedLengthStream
const origin='https://stream-fixture.invalid',id='1'
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF5kAAAAASUVORK5CYII=','base64')
function fixture(){
  const objects=new Map(),deleted=[],writes=[];let fault=''
  const row={id:1,name:'Isolated fixture',description:'',images:[],status:'active',publication_status:'published',updated_at:'2026-11-08T00:00:00Z'}
  const head=key=>{const item=objects.get(key);return item?{key,size:item.bytes.length,etag:item.etag,version:item.version,httpMetadata:item.metadata}:null}
  const media={
    async put(key,value,options={}){
      if(key.startsWith('media/'))assert.ok(value instanceof ReadableStream,'Image data must use a stream, never Blob')
      const bytes=Buffer.from(await new Response(value).arrayBuffer())
      objects.set(key,{bytes,metadata:options.httpMetadata,etag:createHash('sha256').update(bytes).digest('hex'),version:crypto.randomUUID()})
      if((fault==='data'&&key.startsWith('media/'))||(fault==='receipt'&&key.startsWith('_candidate-validation/')))throw new Error('Injected R2 failure after write')
      return head(key)
    },
    async head(key){return head(key)},
    async get(key){const meta=head(key);if(!meta)return null;const bytes=objects.get(key).bytes;return {...meta,body:new Blob([bytes]).stream(),json:async()=>JSON.parse(bytes.toString())}},
    async delete(keys){for(const key of Array.isArray(keys)?keys:[keys]){deleted.push(key);objects.delete(key)}},
  }
  const env={ENVIRONMENT:'isolated-candidate',CANDIDATE_UPLOAD_MODE:'stream',CANDIDATE_SUPABASE_REF:'abcdefghijklmnopqrst',SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',SUPABASE_ANON_KEY:'fixture-anon',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',ADMIN_EMAILS:'admin@fixture.invalid',CANDIDATE_SPOTS:'{"1":"cloudflare-loop-fixture-1"}',CANDIDATE_WRITES_ENABLED:'true',TEST_MEDIA:media}
  const worker=createWorker(async(url,init)=>{
    if(url.endsWith('/auth/v1/user'))return Response.json({id:'admin',email:'admin@fixture.invalid',email_confirmed_at:'2026-01-01'})
    const query=new URL(url)
    assert.equal(query.origin,env.SUPABASE_URL)
    if(init.method==='PATCH'){
      if(query.searchParams.get('updated_at')!==`eq.${row.updated_at}`)return Response.json([])
      const data=JSON.parse(init.body);writes.push(data);Object.assign(row,data)
    }
    return Response.json([row])
  })
  function request(path,{auth=true,...init}={}){const headers=new Headers(init.headers);if(auth)headers.set('Cookie','__Host-jnq-candidate=fixture-access');if(init.method&&init.method!=='GET')headers.set('Origin',origin);return worker.fetch(new Request(origin+path,{...init,headers,...(init.body instanceof ReadableStream?{duplex:'half'}:{})}),env)}
  const upload=(body=png,{length=body.byteLength,type='image/png',auth=true}={})=>request('/api/candidate/spots/1/image',{method:'POST',auth,headers:{'Content-Type':type,...(length===null?{}:{'Content-Length':String(length)})},body})
  const save=(data,version=row.updated_at)=>request('/api/candidate/spots/1',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedUpdatedAt:version,data})})
  return {objects,deleted,writes,row,media,request,upload,save,fault:value=>fault=value}
}
test('stream finishes and binds receipt to size, MIME, etag and immutable version',async()=>{
  const f=fixture(),response=await f.upload()
  assert.equal(response.status,201)
  const uploaded=await response.json();assert.equal(uploaded.validated,true);assert.equal(uploaded.bytes,png.length)
  assert.equal(f.objects.size,2)
  const before=f.row.updated_at
  assert.equal((await f.save({image_url:uploaded.url,images:[uploaded.url]})).status,200)
  assert.equal((await f.save({description:'stale'},before)).status,409)
  const image=await f.request(uploaded.url,{auth:false});assert.equal(image.status,200);assert.deepEqual(Buffer.from(await image.arrayBuffer()),png)
  f.objects.get(uploaded.key).version='replaced-object'
  assert.equal((await f.save({image_url:uploaded.url})).status,400)
  assert.equal((await f.request(uploaded.url,{auth:false})).status,404)
})
test('unknown length, over-limit, MIME/signature mismatch and unauthenticated requests never create objects',async()=>{
  const f=fixture()
  assert.equal((await f.upload(png,{length:null})).status,411)
  assert.equal((await f.upload(png,{length:10485761})).status,413)
  assert.equal((await f.upload(png,{type:'image/jpeg'})).status,415)
  assert.equal((await f.upload(png,{type:'image/svg+xml'})).status,415)
  assert.equal((await f.upload(png,{auth:false})).status,401)
  assert.equal(f.objects.size,0)
})
test('declared lengths cannot bypass actual underflow/overflow enforcement',async()=>{
  for(const length of [png.length-1,png.length+1]){
    const f=fixture();const response=await f.upload(png,{length})
    assert.ok([400,503].includes(response.status));assert.equal(f.objects.size,0)
  }
})

test('overflow arriving after the validated prefix fails and cleans the attempted object',async()=>{
  const f=fixture(),body=new ReadableStream({start(controller){controller.enqueue(png.subarray(0,12));controller.enqueue(png.subarray(12));controller.enqueue(new Uint8Array([0]));controller.close()}})
  const response=await f.request('/api/candidate/spots/1/image',{method:'POST',headers:{'Content-Type':'image/png','Content-Length':String(png.length)},body})
  assert.equal(response.status,503);assert.equal(f.objects.size,0);assert.equal(f.deleted.length,2)
})
for(const stage of ['data','receipt'])test(`R2 ${stage} failure removes both keys and creates no publishable object`,async()=>{
  const f=fixture();f.fault(stage)
  assert.equal((await f.upload()).status,503)
  assert.equal(f.objects.size,0);assert.equal(f.deleted.length,2)
})
test('object existence alone is insufficient; hidden images still require admin',async()=>{
  const f=fixture(),key='media/candidate/1/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png'
  f.objects.set(key,{bytes:png,metadata:{contentType:'image/png'},etag:'etag',version:'version'})
  assert.equal((await f.save({image_url:`/${key}`})).status,400)
  assert.equal((await f.request(`/${key}`,{auth:false})).status,404)
  const uploaded=await (await f.upload()).json()
  await f.save({image_url:uploaded.url,images:[uploaded.url]})
  await f.save({publication_status:'hidden'})
  assert.equal((await f.request(uploaded.url,{auth:false})).status,401)
  assert.equal((await f.request(uploaded.url)).status,200)
})
