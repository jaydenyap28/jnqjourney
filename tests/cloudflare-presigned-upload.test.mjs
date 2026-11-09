import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash,createHmac} from 'node:crypto'
import {createWorker,signCandidatePut} from '../cloudflare/spot-loop/worker.mjs'
const origin='https://codex-cloudflare-free-migrat.jnqjourney-spot-loop-migration-candidate.pages.dev'
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF5kAAAAASUVORK5CYII=','base64')
const keys={CANDIDATE_R2_ACCESS_KEY_ID:'fixture-access-id',CANDIDATE_R2_SECRET_ACCESS_KEY:'fixture-secret-not-real'}
function fixture(){
  const objects=new Map();let copies=0,copyFailure=false
  const row={id:1,name:'Isolated fixture',status:'active',publication_status:'published',updated_at:'2026-11-08T00:00:00Z',images:[]}
  const head=key=>{const item=objects.get(key);return item?{key,size:item.size??item.bytes.length,etag:item.etag,version:item.version,httpMetadata:item.metadata}:null}
  const media={
    async put(key,value,options={}){if(options.onlyIf&&objects.get(key)?.etag!==options.onlyIf.etagMatches)return null;const bytes=Buffer.from(await new Response(value).arrayBuffer());objects.set(key,{bytes,metadata:options.httpMetadata,version:crypto.randomUUID(),etag:createHash('sha256').update(bytes).digest('hex')});return head(key)},
    async head(key){return head(key)},
    async get(key,options={}){const meta=head(key);if(!meta)return null;const bytes=objects.get(key).bytes,body=options.range?bytes.subarray(options.range.offset,options.range.offset+options.range.length):bytes;return {...meta,body:new Blob([body]).stream(),arrayBuffer:async()=>Uint8Array.from(body).buffer,json:async()=>JSON.parse(bytes.toString())}},
    async delete(list){for(const key of Array.isArray(list)?list:[list])objects.delete(key)},
  }
  const env={...keys,ENVIRONMENT:'isolated-candidate',CANDIDATE_SUPABASE_REF:'abcdefghijklmnopqrst',SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',SUPABASE_ANON_KEY:'fixture-anon',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',ADMIN_EMAILS:'admin@fixture.invalid',CANDIDATE_SPOTS:'{"1":"cloudflare-loop-fixture-1"}',CANDIDATE_WRITES_ENABLED:'true',TEST_MEDIA:media,ASSETS:{fetch:async()=>new Response('Not Found',{status:404})}}
  const worker=createWorker(async(url,init)=>{
    if(new URL(url).hostname.endsWith('.r2.cloudflarestorage.com')){
      copies++;const destination=new URL(url).pathname.split('/').slice(2).join('/'),source=init.headers['x-amz-copy-source'].split('/').slice(2).join('/')
      await media.put(destination,objects.get(source).bytes,{httpMetadata:objects.get(source).metadata})
      return new Response(copyFailure?'failed':'<CopyObjectResult/>',{status:copyFailure?500:200})
    }
    assert.equal(new URL(url).origin,env.SUPABASE_URL)
    if(url.endsWith('/auth/v1/user'))return Response.json({id:'fixture-admin',email:'admin@fixture.invalid',email_confirmed_at:'2026-01-01'})
    if(init.method==='PATCH'){if(new URL(url).searchParams.get('updated_at')!==`eq.${row.updated_at}`)return Response.json([]);Object.assign(row,JSON.parse(init.body))}
    return Response.json([row])
  })
  const call=(path,body,auth=true)=>worker.fetch(new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{...(auth?{Cookie:'__Host-jnq-candidate=fixture-access'}:{}),Origin:origin,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),env)
  const issue=()=>call('/api/candidate/spots/1/image/presign',{size:png.length,type:'image/png'})
  const complete=key=>call('/api/candidate/spots/1/image/complete',{key})
  const stage=async(key,bytes=png,type='image/png')=>media.put(key.replace('media/candidate/','_candidate-staging/'),bytes,{httpMetadata:{contentType:type}})
  const save=(key,version=row.updated_at)=>worker.fetch(new Request(origin+'/api/candidate/spots/1',{method:'PATCH',headers:{Cookie:'__Host-jnq-candidate=fixture-access',Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({expectedUpdatedAt:version,data:{image_url:`/${key}`}})}),env)
  return {objects,row,env,call,issue,complete,stage,save,copies:()=>copies,failCopy:()=>copyFailure=true}
}
test('SigV4 is limited to one staging object, PUT, size, MIME and 120 seconds',async()=>{
  const key='_candidate-staging/1/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png'
  const signed=await signCandidatePut(keys,key,'image/png',68,null,new Date('2026-11-08T12:00:00Z'))
  const url=new URL(signed.url),query=url.searchParams
  assert.equal(query.get('X-Amz-Expires'),'120');assert.equal(query.get('X-Amz-SignedHeaders'),'content-length;content-type;host')
  assert.ok(url.pathname.includes('/jnqjourney-spot-loop-isolated-media/_candidate-staging/1/'))
  const enc=s=>encodeURIComponent(s).replace(/[!'()*]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  function verify(method,type,length){
    const params=[...query].filter(([key])=>key!=='X-Amz-Signature').sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${enc(k)}=${enc(v)}`).join('&')
    const canonical=[method,url.pathname,params,`content-length:${length}\ncontent-type:${type}\nhost:${url.host}\n`,'content-length;content-type;host','UNSIGNED-PAYLOAD'].join('\n')
    const scope='20261108/auto/s3/aws4_request',text=`AWS4-HMAC-SHA256\n20261108T120000Z\n${scope}\n${createHash('sha256').update(canonical).digest('hex')}`
    let key=Buffer.from('AWS4'+keys.CANDIDATE_R2_SECRET_ACCESS_KEY)
    for(const value of ['20261108','auto','s3','aws4_request'])key=createHmac('sha256',key).update(value).digest()
    return createHmac('sha256',key).update(text).digest('hex')
  }
  assert.equal(query.get('X-Amz-Signature'),verify('PUT','image/png',68))
  assert.notEqual(query.get('X-Amz-Signature'),verify('GET','image/png',68))
  assert.notEqual(query.get('X-Amz-Signature'),verify('PUT','image/jpeg',68))
  assert.notEqual(query.get('X-Amz-Signature'),verify('PUT','image/png',69))
  assert.ok(!signed.url.includes(keys.CANDIDATE_R2_SECRET_ACCESS_KEY))
})
test('missing Preview secrets, unauthorized users and oversized grants fail before ticket creation',async()=>{
  const f=fixture()
  assert.equal((await f.call('/api/candidate/spots/1/image/presign',{size:68,type:'image/png'},false)).status,401)
  assert.equal((await f.call('/api/candidate/spots/1/image/presign',{size:10485761,type:'image/png'})).status,400)
  delete f.env.CANDIDATE_R2_SECRET_ACCESS_KEY
  assert.equal((await f.issue()).status,503);assert.equal(f.objects.size,0)
})
test('staging cannot be referenced; final copy is range-validated and receipt-bound before save',async()=>{
  const f=fixture(),ticket=await(await f.issue()).json();await f.stage(ticket.key)
  assert.equal((await f.save(ticket.key)).status,400)
  assert.equal((await f.call('/'+ticket.key,undefined,false)).status,404)
  assert.equal((await f.complete(ticket.key)).status,201);assert.equal(f.copies(),1)
  assert.equal(f.objects.size,3) // Retain the processing ticket for idempotent retries.
  const old=f.row.updated_at
  assert.equal((await f.save(ticket.key)).status,200)
  assert.equal((await f.save(ticket.key,old)).status,409)
  f.row.publication_status='hidden'
  assert.equal((await f.call('/'+ticket.key,undefined,false)).status,401)
})
for(const kind of ['signature','mime','size'])test(`rejected direct ${kind} is cleaned and never copied/publishable`,async()=>{
  const f=fixture(),ticket=await(await f.issue()).json()
  await f.stage(ticket.key,kind==='signature'?Buffer.alloc(png.length):png,kind==='mime'?'image/jpeg':'image/png')
  if(kind==='size')f.objects.get(ticket.key.replace('media/candidate/','_candidate-staging/')).size=10485761
  assert.ok([400,415].includes((await f.complete(ticket.key)).status))
  assert.equal(f.copies(),0);assert.equal(f.objects.size,1) // Claimed ticket is a terminal tombstone.
})
test('copy failure removes staging, ticket and partial final; expired tickets also clean',async()=>{
  const f=fixture(),ticket=await(await f.issue()).json();await f.stage(ticket.key);f.failCopy()
  assert.equal((await f.complete(ticket.key)).status,503);assert.equal(f.objects.size,1)
  const other=fixture(),expired=await(await other.issue()).json();await other.stage(expired.key)
  const entry=other.objects.get('_candidate-tickets/'+expired.key.slice('media/candidate/'.length)+'.json')
  const record=JSON.parse(entry.bytes);record.expiresAt=Date.now()-1;entry.bytes=Buffer.from(JSON.stringify(record))
  assert.equal((await other.complete(expired.key)).status,410);assert.equal(other.objects.size,1)
})
