import test from 'node:test'
import assert from 'node:assert/strict'
import {createWorker} from '../cloudflare/spot-loop/worker.mjs'
test('native Workers redirect-mode compatibility rejects unsupported error mode',async()=>{
  const worker=createWorker(async(_url,init)=>{
    if(!['manual','follow'].includes(init.redirect))throw new TypeError(`Unsupported redirect mode: ${init.redirect}`)
    return Response.json([{id:1,name:'Isolated fixture',status:'active',publication_status:'published',updated_at:'2026-11-08T00:00:00Z',images:[]}])
  })
  const response=await worker.fetch(new Request('https://fixture.invalid/spot/cloudflare-loop-fixture-1'),{ENVIRONMENT:'isolated-candidate',CANDIDATE_SUPABASE_REF:'abcdefghijklmnopqrst',SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',SUPABASE_ANON_KEY:'fixture-anon',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',ADMIN_EMAILS:'test@fixture.invalid',CANDIDATE_SPOTS:'{"1":"cloudflare-loop-fixture-1"}',TEST_MEDIA:{}})
  assert.equal(response.status,200,'Unsupported native redirect modes must fail this compatibility check')
})
test('native manual redirects never forward an isolated service credential',async()=>{
  const calls=[]
  const worker=createWorker(async(url,init)=>{
    calls.push({url,redirect:init.redirect})
    assert.equal(init.redirect,'manual')
    return new Response(null,{status:302,headers:{Location:'https://unexpected.invalid/'}})
  })
  const response=await worker.fetch(new Request('https://fixture.invalid/spot/cloudflare-loop-fixture-1'),{ENVIRONMENT:'isolated-candidate',CANDIDATE_SUPABASE_REF:'abcdefghijklmnopqrst',SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',SUPABASE_ANON_KEY:'fixture-anon',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',ADMIN_EMAILS:'test@fixture.invalid',CANDIDATE_SPOTS:'{"1":"cloudflare-loop-fixture-1"}',TEST_MEDIA:{}})
  assert.equal(response.status,503)
  assert.equal((await response.json()).error,'Upstream redirect refused')
  assert.equal(calls.length,1)
  assert.ok(calls[0].url.startsWith('https://abcdefghijklmnopqrst.supabase.co/'))
})
