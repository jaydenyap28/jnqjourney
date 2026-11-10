import test from 'node:test'
import assert from 'node:assert/strict'
import {integrationImage} from '../cloudflare/spot-loop/worker.mjs'
import preview,{legacyPath,canonicalMediaPath,previewOrigin} from '../cloudflare/spot-loop/legacy-media-preview.mjs'

const key='media/candidate/92017/00000000-0000-4000-8000-000000000001.webp'
const bytes=new TextEncoder().encode('synthetic-webp-body')
const receipt={size:263,etag:'receipt-etag',version:'receipt-version',httpMetadata:{contentType:'application/json'}}
const lookup={key,size:bytes.length,mime:'image/webp',etag:'object-etag',version:'native-version',receiptSize:receipt.size,receiptEtag:receipt.etag,receiptVersion:receipt.version,publiclyReferenced:true}
function setup({publiclyReferenced=true,changed=false,revokeAfterGet=false}={}){
  const counts={get:0,head:0,rpc:0,cancel:0}
  const env={SUPABASE_URL:'https://rnamstwwbzknwbjwdgrf.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic-server-only',
    TEST_MEDIA:{
      async get(){counts.get++;return {size:bytes.length,etag:lookup.etag,version:changed?'external-version':lookup.version,httpMetadata:{contentType:lookup.mime},body:new ReadableStream({start(controller){controller.enqueue(bytes)},cancel(){counts.cancel++}})}},
      async head(){counts.head++;return receipt},
    }}
  const transport=async()=>{counts.rpc++;return Response.json({...lookup,publiclyReferenced:revokeAfterGet&&counts.rpc===2?false:publiclyReferenced})}
  return {env,transport,counts}
}
test('public legacy alias releases the exact single GET stream after two lookups',async()=>{
  const {env,transport,counts}=setup()
  const response=await integrationImage(new Request(previewOrigin+legacyPath),env,null,'92017',key,transport)
  assert.equal(response.status,200)
  const reader=response.body.getReader()
  assert.deepEqual((await reader.read()).value,bytes)
  await reader.cancel()
  assert.deepEqual({get:counts.get,head:counts.head,rpc:counts.rpc},{get:1,head:1,rpc:2})
  assert.match(response.headers.get('cache-control'),/no-store/)
})
test('version mismatch and revocation after GET cancel bytes before release',async()=>{
  for(const options of [{changed:true},{revokeAfterGet:true}]){
    const {env,transport,counts}=setup(options)
    await assert.rejects(integrationImage(new Request(previewOrigin+legacyPath),env,null,'92017',key,transport),error=>error.status===404)
    assert.equal(counts.cancel,1)
  }
})
test('unpublished aliases deny even a candidate cookie in this public-only adapter',async()=>{
  const {env,transport,counts}=setup({publiclyReferenced:false})
  await assert.rejects(integrationImage(new Request(previewOrigin+legacyPath,{headers:{Cookie:'__Host-jnq-candidate=synthetic'}}),env,null,'92017',key,transport),error=>error.status===404)
  assert.equal(counts.get,0)
})
test('legacy adapter fails closed for unknown path, host, query and expired configuration',async()=>{
  for(const url of [previewOrigin+'/locations/unknown.webp',previewOrigin+canonicalMediaPath+'?key=other','https://untrusted.invalid'+legacyPath]){
    assert.equal((await preview.fetch(new Request(url),{})).status,404)
  }
  assert.equal((await preview.fetch(new Request(previewOrigin+legacyPath),{})).status,503)
})
