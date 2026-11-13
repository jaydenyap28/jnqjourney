const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path')
const load=require('./helpers/load-local-ts.cjs')
let enabled=false,calls=[],responder,authCalls=0,promptValue='Synthetic owned photo',confirmed=false
const memory=new Map()
const {adminFetch}=load(path.resolve('cloudflare/admin-preview/formal-browser-fetch.ts'),{
  '@/lib/supabase':{supabase:{auth:{getSession:async()=>{authCalls++;return {data:{session:{access_token:'synthetic-not-a-real-token',user:{id:'synthetic-owner'}}}}},signOut:async()=>({})}}},
  '@/lib/admin-preview-config':{ADMIN_API:'https://synthetic.invalid/formal'},
  '@/lib/formal-browser-capabilities':{formalCanWrite:()=>enabled,formalCanUpload:()=>enabled,formalCanPublish:()=>enabled,setFormalCapabilities:()=>{}},
})
async function fixture(action){
  const before={fetch:global.fetch,window:global.window,storage:global.localStorage}
  global.localStorage={getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)}
  global.window={prompt:()=>promptValue,confirm:()=>confirmed}
  global.fetch=async(url,init)=>{assert.ok(String(url).startsWith('https://synthetic.invalid/'));calls.push({url,init});return responder(url,init)}
  try{memory.clear();calls=[];authCalls=0;await action()}finally{global.fetch=before.fetch;global.window=before.window;global.localStorage=before.storage}
}
const save=body=>adminFetch('/api/admin/locations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
test('managed browser OFF refuses before any Auth/network work',()=>fixture(async()=>{
  enabled=false;assert.equal((await save({data:{name:'Synthetic'}})).status,405);assert.equal(calls.length,0);assert.equal(authCalls,0)
}))
test('lost save response retains identical mutation ID and only clears it on a confirmed terminal response',()=>fixture(async()=>{
  enabled=true;let count=0;responder=async()=>{if(count++===0)throw Error('synthetic network interruption');return Response.json({data:{id:700}})}
  await assert.rejects(save({data:{name:'Synthetic'}}))
  const first=calls[0].init.headers.get('x-jnq-mutation-id');assert.match(first,/^[a-f0-9-]{36}$/)
  assert.equal((await save({data:{name:'Synthetic'}})).status,200)
  assert.equal(calls[1].init.headers.get('x-jnq-mutation-id'),first);assert.equal(memory.size,0)
}))
test('changed new-Spot payload cannot bypass an unresolved earlier create intent',()=>fixture(async()=>{
  enabled=true;responder=async(url,init)=>{if(init.method==='POST')throw Error('synthetic lost response');return Response.json({state:'uncertain'})}
  await assert.rejects(save({data:{name:'First'}}))
  assert.equal((await save({data:{name:'Changed'}})).status,409)
  assert.equal(calls.filter(call=>call.init.method==='POST').length,1)
}))
test('upload requires explicit rights evidence, no client-side deployment credential is added',()=>fixture(async()=>{
  enabled=true;promptValue='';responder=async()=>Response.json({saved:true})
  const empty=new FormData();empty.set('file',new File(['synthetic'],'photo.png',{type:'image/png'}))
  assert.equal((await adminFetch('/api/upload/r2',{method:'POST',body:empty})).status,400);assert.equal(calls.length,0)
  promptValue='Synthetic owner-authorized test photo'
  assert.equal((await adminFetch('/api/upload/r2',{method:'POST',body:empty})).status,200)
  assert.equal(calls[0].init.body.get('rightsEvidence'),promptValue)
  assert.deepEqual([...calls[0].init.headers.keys()],['authorization'])
}))
