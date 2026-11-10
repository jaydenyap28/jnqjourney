import test from 'node:test'
import assert from 'node:assert/strict'
import bridge from '../cloudflare/spot-loop/identity-bridge/worker.mjs'
import {signBridge} from '../cloudflare/spot-loop/identity-bridge/auth.mjs'
import {createSaveHandler} from '../cloudflare/spot-loop/edge-pilot/save-handler.mjs'
import {SPOT_FIELDS} from '../cloudflare/spot-loop/spot-contract.mjs'
const url='https://codex-r2-identity-bridge.jnqjourney-spot-loop-migration-candidate.pages.dev/internal/r2-identity'
const origin='https://codex-cloudflare-free-migrat.jnqjourney-spot-loop-migration-candidate.pages.dev'
const secret='b'.repeat(43),marker='1794249999999-0'
const key=(id,n)=>`media/candidate/${id}/00000000-0000-4000-8000-${String(n).padStart(12,'0')}.png`
const identity=k=>({key:k,size:68,mime:'image/png',etag:'etag',version:'native-version',receipt_size:257,receipt_etag:'receipt-etag',receipt_version:'native-receipt-version'})
function bucketFixture(n=30){
  const calls={list:0,head:0}
  const objects=new Map()
  for(let i=1;i<=n;i++){
    const k=key(92005,i)
    objects.set(k,{key:k,size:68,etag:'etag',version:'native-version',httpMetadata:{contentType:'image/png'}})
    const receipt='_candidate-validation/'+k.slice('media/candidate/'.length)+'.json'
    objects.set(receipt,{key:receipt,size:257,etag:'receipt-etag',version:'native-receipt-version',httpMetadata:{contentType:'application/json'}})
  }
  const env={BRIDGE_PROJECT_REF:'rnamstwwbzknwbjwdgrf',BRIDGE_BUCKET:'jnqjourney-spot-loop-isolated-media',BRIDGE_FIXTURE_IDS:'92005,92017,92030',BRIDGE_EXPIRES_AT:String(Math.floor(Date.now()/1000)+1800),CANDIDATE_IDENTITY_BRIDGE_KEY:secret,
    TEST_MEDIA:{async list({prefix,limit}){calls.list++;const found=[...objects.values()].filter(o=>o.key.startsWith(prefix));return {objects:found.slice(0,limit),truncated:found.length>limit}},async head(k){calls.head++;return objects.get(k)??null}}}
  return {env,calls,objects}
}
async function batch(env,body){const raw=JSON.stringify(body);return bridge.fetch(new Request(url,{method:'POST',headers:await signBridge(secret,url,raw,marker),body:raw}),env)}
for(const n of [5,17,30])test(`batch ${n} uses two LISTs and no receipt body or unbounded HEAD`,async()=>{
  const f=bucketFixture(n),keys=Array.from({length:n},(_,i)=>key(92005,i+1))
  const response=await batch(f.env,{spotId:92005,keys})
  assert.equal(response.status,200)
  const data=await response.json()
  assert.equal(data.identities.length,n)
  assert.ok(data.identities.every(i=>i.version==='native-version'&&i.receipt_version==='native-receipt-version'))
  assert.deepEqual(f.calls,{list:2,head:0})
})
test('batch rejects excess, duplicate, foreign-fixture and browser identity fields',async()=>{
  for(const body of [{spotId:92005,keys:Array.from({length:31},(_,i)=>key(92005,i))},{spotId:92005,keys:[key(92005,1),key(92005,1)]},{spotId:92017,keys:[key(92005,1)]},{spotId:92005,keys:[key(92005,1)],verified:true}]){
    const f=bucketFixture()
    assert.equal((await batch(f.env,body)).status,400)
    assert.deepEqual(f.calls,{list:0,head:0})
  }
})
test('LIST truncation has one shared eight HEAD budget, no pagination',async()=>{
  const f=bucketFixture(5)
  f.env.TEST_MEDIA.list=async()=>{f.calls.list++;return {objects:[],truncated:true}}
  const response=await batch(f.env,{spotId:92005,keys:Array.from({length:5},(_,i)=>key(92005,i+1))})
  assert.equal(response.status,503)
  assert.equal((await response.json()).error,'HEAD_BUDGET_EXHAUSTED')
  assert.deepEqual(f.calls,{list:2,head:8})
})
test('missing native version fails with actual operation counts',async()=>{
  const f=bucketFixture(1)
  f.objects.get(key(92005,1)).version=undefined
  const response=await batch(f.env,{spotId:92005,keys:[key(92005,1)]})
  assert.equal(response.status,409)
  assert.deepEqual((await response.json()).operations,{list:2,head:0,get:0})
})
function edgeFixture(){
  const row={...Object.fromEntries(SPOT_FIELDS.map(f=>[f,null])),id:92005,name:'Synthetic',latitude:0,longitude:0,status:'active',publication_status:'published',images:[],updated_at:null}
  const counts={save:0,bridge:0},state={row,failRpc:false}
  const handler=createSaveHandler({config:{adminId:'synthetic-admin',adminEmail:'admin@fixture.invalid',expiresAt:Math.floor(Date.now()/1000)+1800},env:name=>({SUPABASE_URL:'https://rnamstwwbzknwbjwdgrf.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',CANDIDATE_IDENTITY_BRIDGE_KEY:secret})[name],transport:async(raw,init)=>{
    const u=new URL(raw)
    if(u.pathname==='/auth/v1/user')return init.headers.Authorization==='Bearer synthetic-token'?Response.json({id:'synthetic-admin',email:'admin@fixture.invalid',email_confirmed_at:'2026-11-10',role:'authenticated'}):new Response(null,{status:401})
    if(u.pathname==='/rest/v1/locations')return Response.json([state.row])
    if(u.href===url){
      counts.bridge++;const body=JSON.parse(init.body)
      return Response.json({identities:body.keys.map(identity),operations:{list:2,head:0,get:0},spotId:body.spotId,nonce:init.headers['X-JnQ-Bridge-Nonce'],acceptanceId:marker})
    }
    assert.equal(u.pathname,'/rest/v1/rpc/jnq_media_save')
    counts.save++
    const args=JSON.parse(init.body)
    assert.deepEqual(args.p_observed,args.p_patch.images.map(p=>identity(p.slice(1))))
    if(state.failRpc)return Response.json({code:'23503'},{status:409})
    if(args.p_expected_updated_at!==state.row.updated_at)return Response.json({code:'PT409'},{status:409})
    state.row={...state.row,...args.p_patch,updated_at:new Date(Date.now()).toISOString()}
    return Response.json(state.row)
  }})
  const call=(data,{token='synthetic-token',originHeader=origin}={})=>handler(new Request('https://rnamstwwbzknwbjwdgrf.supabase.co/functions/v1/jnq-registry-rm0-pilot',{method:'POST',headers:{Origin:originHeader,'Content-Type':'application/json',Authorization:'Bearer '+token,'X-JnQ-Acceptance':marker},body:JSON.stringify(data)}))
  return {call,state,counts}
}
test('Edge constructs trusted observed identities and forwards the full transaction',async()=>{
  const f=edgeFixture(),images=Array.from({length:30},(_,i)=>'/'+key(92005,i+1))
  const response=await f.call({action:'save',id:92005,expectedUpdatedAt:null,data:{images,image_url:images[0]}})
  assert.equal(response.status,200)
  assert.deepEqual(f.counts,{save:1,bridge:1})
  assert.equal((await response.json()).spot.images.length,30)
})
test('Edge rejects caller identity declarations, wrong admin, origin and scope',async()=>{
  const request={action:'save',id:92005,expectedUpdatedAt:null,data:{images:[],image_url:null}}
  for(const [input,options,status] of [[{...request,p_observed:[]},{},400],[{...request,data:{verified:true}},{},400],[request,{token:'forged'},401],[request,{originHeader:'https://untrusted.invalid'},403],[{...request,id:1},{},400]]){
    const f=edgeFixture()
    assert.equal((await f.call(input,options)).status,status)
    assert.deepEqual(f.counts,{save:0,bridge:0})
  }
})
test('Edge preserves a failed Registry transaction result without retry or state change',async()=>{
  const f=edgeFixture(),before=structuredClone(f.state.row)
  f.state.failRpc=true
  const response=await f.call({action:'save',id:92005,expectedUpdatedAt:null,data:{images:['/'+key(92005,1)],image_url:'/'+key(92005,1),name:'Should roll back'}})
  assert.equal(response.status,409)
  assert.equal((await response.json()).sqlstate,'23503')
  assert.deepEqual(f.state.row,before)
  assert.deepEqual(f.counts,{save:1,bridge:1})
})
