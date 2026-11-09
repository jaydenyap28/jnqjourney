import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../cloudflare/spot-loop/identity-bridge/worker.mjs'
import {signBridge,BRIDGE_PATH} from '../cloudflare/spot-loop/identity-bridge/auth.mjs'
const url='https://codex-r2-identity-bridge.jnqjourney-spot-loop-migration-candidate.pages.dev'+BRIDGE_PATH
const key='media/candidate/92005/00000000-0000-4000-8000-000000000001.png'
const secret='a'.repeat(43),marker='1794229999999-0',body=JSON.stringify({key})
function setup(){
  const heads=[]
  const env={BRIDGE_PROJECT_REF:'rnamstwwbzknwbjwdgrf',BRIDGE_BUCKET:'jnqjourney-spot-loop-isolated-media',BRIDGE_FIXTURE:'92005',
    BRIDGE_EXPIRES_AT:String(Math.floor(Date.now()/1000)+1200),CANDIDATE_IDENTITY_BRIDGE_KEY:secret,
    TEST_MEDIA:{async head(objectKey){heads.push(objectKey);return objectKey.startsWith('media/')?
      {key:objectKey,size:68,etag:'image-etag',version:'image-version',httpMetadata:{contentType:'image/png'}}:
      {key:objectKey,size:257,etag:'receipt-etag',version:'receipt-version',httpMetadata:{contentType:'application/json'}}}}}
  return {env,heads}
}
async function request(env,{raw=body,headers,changed={},target=url}={}){
  const signed=headers??await signBridge(secret,url,raw,marker)
  return worker.fetch(new Request(target,{method:'POST',headers:{...signed,...changed},body:raw}),env)
}
test('signed server request returns two live identities with no file body or credentials',async()=>{
  const {env,heads}=setup(),response=await request(env)
  assert.equal(response.status,200)
  const data=await response.json()
  assert.equal(data.identity.version,'image-version')
  assert.equal(data.identity.receipt_version,'receipt-version')
  assert.equal(data.headOperations,2)
  assert.equal(data.listOperations,0)
  assert.deepEqual(heads,[key,'_candidate-validation/92005/00000000-0000-4000-8000-000000000001.png.json'])
  assert.ok(!JSON.stringify(data).includes(secret))
  assert.equal(response.headers.get('access-control-allow-origin'),null)
})
for(const [name,options,status] of [
  ['anonymous',{headers:{'Content-Type':'application/json'}},401],
  ['bad signature',{changed:{'X-JnQ-Bridge-Signature':'0'.repeat(64)}},401],
  ['browser Origin',{changed:{Origin:'https://fixture.invalid'}},403],
  ['browser cookies',{changed:{Cookie:'session=untrusted'}},403],
  ['timestamp expired',{changed:{'X-JnQ-Bridge-Time':'1700000000'}},401],
  ['different host',{target:url.replace('codex-r2-identity-bridge','other')},404],
  ['query parameter',{target:url+'?key=untrusted'},404],
  ['foreign fixture',{raw:JSON.stringify({key:key.replace('92005','92017')})},400],
  ['two queries',{raw:JSON.stringify({keys:[key,key]})},400],
  ['path traversal',{raw:JSON.stringify({key:'media/candidate/92005/../formal.png'})},400],
  ['extra identity claim',{raw:JSON.stringify({key,version:'forged'})},400],
  ['oversized known length',{raw:'x'.repeat(2049)},413],
])test(`${name} fails before any R2 operation`,async()=>{
  const {env,heads}=setup()
  assert.equal((await request(env,options)).status,status)
  assert.equal(heads.length,0)
})
test('changed body or request marker cannot reuse a valid signature',async()=>{
  const {env,heads}=setup(),headers=await signBridge(secret,url,body,marker)
  assert.equal((await request(env,{headers,raw:body+' '})).status,401)
  assert.equal((await request(env,{headers,changed:{'X-JnQ-Acceptance':'1794229999999-1'}})).status,401)
  assert.equal(heads.length,0)
})
test('unknown-length oversized stream is refused',async()=>{
  const {env,heads}=setup(),headers=await signBridge(secret,url,body,marker)
  const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(2049));c.close()}})
  const response=await worker.fetch(new Request(url,{method:'POST',headers,body:stream,duplex:'half'}),env)
  assert.equal(response.status,413)
  assert.equal(heads.length,0)
})
test('hard credential expiry and incorrect project or bucket fail closed',async()=>{
  for(const patch of [{BRIDGE_EXPIRES_AT:'1'},{BRIDGE_PROJECT_REF:'vrufunuomioczocdsoer'},{BRIDGE_BUCKET:'formal'}]){
    const {env,heads}=setup()
    Object.assign(env,patch)
    assert.equal((await request(env)).status,503)
    assert.equal(heads.length,0)
  }
})
test('missing version, missing object or incorrect MIME cannot form a snapshot',async()=>{
  for(const object of [null,{size:68,etag:'etag',httpMetadata:{contentType:'image/png'}},{size:68,etag:'etag',version:'version',httpMetadata:{contentType:'application/pdf'}}]){
    const {env}=setup()
    env.TEST_MEDIA.head=async()=>object
    assert.equal((await request(env)).status,409)
  }
})
