import test from 'node:test'
import assert from 'node:assert/strict'
import {createPublicationGate,PUBLIC_SPOT_FIELDS,GATE_ORIGIN} from '../cloudflare/spot-loop/publication-gate.mjs'

const key='media/candidate/92005/00000000-0000-4000-8000-000000000001.webp'
function fixture(){
  const row=Object.fromEntries(PUBLIC_SPOT_FIELDS.map(field=>[field,null]))
  Object.assign(row,{id:92005,status:'active',publication_status:null,name:'Synthetic',images:[],latitude:0,longitude:0})
  const state={row,available:true}
  const worker=createPublicationGate(async()=>state.available?Response.json(state.row?[state.row]:[]):new Response(null,{status:503}))
  const env={SUPABASE_URL:'https://rnamstwwbzknwbjwdgrf.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic-only',
    TEST_MEDIA:{},P0_EXPIRES_AT:String(Math.floor(Date.now()/1000)+600),P0_MEDIA_KEY:key}
  return {state,call:path=>worker.fetch(new Request(GATE_ORIGIN+path),env)}
}
test('legacy NULL remains visible and a hidden upstream result cannot be leaked',async()=>{
  const f=fixture()
  assert.equal((await f.call('/spot/cloudflare-loop-registry-92005')).status,200)
  f.state.row=null
  assert.equal((await f.call('/spot/spot-92005')).status,404)
  assert.equal((await f.call('/')).status,200)
})
test('source failures and forbidden projections fail closed',async()=>{
  const f=fixture()
  f.state.available=false
  for(const path of ['/','/api/locations','/spot/spot-92005'])assert.equal((await f.call(path)).status,503)
  f.state.available=true
  f.state.row.is_visited=true
  assert.equal((await f.call('/api/locations')).status,503)
})
test('static and field-selection representations cannot bypass the gate',async()=>{
  const f=fixture()
  for(const path of ['/api/locations?select=review_jayden','/spot/cloudflare-loop-registry-92005.html','/_next/data/old/spot/cloudflare-loop-registry-92005.json']){
    const response=await f.call(path)
    assert.equal(response.status,404)
    assert.match(response.headers.get('cache-control'),/no-store/)
  }
})
