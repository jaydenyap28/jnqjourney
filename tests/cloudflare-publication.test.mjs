import test from 'node:test'
import assert from 'node:assert/strict'
import worker, { tick, CANDIDATE_BRANCH } from '../cloudflare/publication-worker.mjs'

const env = {SUPABASE_URL:'https://isolated.invalid',SUPABASE_SERVICE_ROLE_KEY:'test-service',CF_ACCOUNT_ID:'test-account',CF_PAGES_TOKEN:'test-pages',CF_PAGES_PROJECT:'jnqjourney-migration-candidate',PUBLICATION_ENABLED:'true'}
function mock({state={},lease=null,stage={name:'deploy',status:'success'},production='main',submitError=false,receiptRevision=12}={}) {
  const calls=[]
  const transport=async (url,init={}) => {
    calls.push({url,...init})
    if(url.endsWith('/_publication.json')) return Response.json({schemaVersion:1,revision:receiptRevision})
    const rpc=url.split('/rpc/')[1]
    if(rpc) {
      assert.equal(init.headers.Authorization,'Bearer test-service')
      return Response.json(rpc==='jnq_publication_status'?state:rpc==='jnq_publication_claim'?lease:null)
    }
    assert.equal(init.headers.Authorization,'Bearer test-pages')
    if(url.endsWith('/deployments')&&init.method==='POST') {
      assert.equal(init.body.get('branch'),CANDIDATE_BRANCH)
      if(submitError) throw new Error('Network response lost')
      return Response.json({success:true,result:{id:'deployment-1'}})
    }
    return Response.json({success:true,result:url.includes('/deployments/')?{url:'https://hash.jnqjourney-migration-candidate.pages.dev',environment:'preview',deployment_trigger:{metadata:{branch:CANDIDATE_BRANCH}},latest_stage:stage}:{production_branch:production}})
  }
  return {calls,transport}
}
test('disabled publication and wrong project make no network calls',async()=>{
  const f=mock()
  await assert.rejects(tick({...env,PUBLICATION_ENABLED:'false'},f.transport),/disabled/)
  await assert.rejects(tick({...env,CF_PAGES_PROJECT:'jnqjourney'},f.transport),/Candidate/)
  assert.equal(f.calls.length,0)
})
test('refuses Production branch before claiming or submitting',async()=>{
  const f=mock({production:CANDIDATE_BRANCH})
  await assert.rejects(tick(env,f.transport),/Production/)
  assert.equal(f.calls.length,1)
})
test('SQL refusing a claim never triggers a build',async()=>{
  const f=mock()
  assert.deepEqual(await tick(env,f.transport),{status:'waiting'})
  assert.equal(f.calls.filter(c=>c.url.endsWith('/deployments')).length,0)
})
test('one reserved revision submits one preview build and records its ID',async()=>{
  const f=mock({lease:{lease_token:'lease-1',reserved_revision:12}})
  assert.deepEqual(await tick(env,f.transport),{status:'submitted'})
  assert.equal(f.calls.filter(c=>c.url.endsWith('/deployments')).length,1)
  assert.deepEqual(JSON.parse(f.calls.at(-1).body),{token:'lease-1',deployment:'deployment-1'})
})
test('ambiguous submission stays held instead of blindly rebuilding',async()=>{
  const f=mock({state:{lease_token:'held'}})
  assert.deepEqual(await tick(env,f.transport),{status:'submission-needs-reconciliation'})
  assert.equal(f.calls.length,2)
  const lost=mock({lease:{lease_token:'held'},submitError:true})
  await assert.rejects(tick(env,lost.transport),/lost/)
  assert.ok(!lost.calls.some(c=>c.url.includes('jnq_publication_finish')))
})
test('successful build stage does not acknowledge a deployment',async()=>{
  const f=mock({state:{lease_token:'held',deployment_id:'d'},stage:{name:'build',status:'success'}})
  assert.deepEqual(await tick(env,f.transport),{status:'building'})
  assert.ok(!f.calls.some(c=>c.url.includes('jnq_publication_finish')))
})
for(const [status,name,succeeded] of [['success','deploy',true],['failure','build',false],['canceled','deploy',false]]) {
  test(`${status} ${name} acknowledges only the held revision`,async()=>{
    const f=mock({state:{lease_token:'held',deployment_id:'d',reserved_revision:12},stage:{name,status}})
    await tick(env,f.transport)
    assert.deepEqual(JSON.parse(f.calls.at(-1).body),{token:'held',succeeded})
    assert.ok(!f.calls.some(c=>c.url.includes('jnq_publication_claim')))
  })
}
test('a green deployment with stale content is not acknowledged',async()=>{
  const f=mock({state:{lease_token:'held',deployment_id:'d',reserved_revision:12},receiptRevision:11})
  await assert.rejects(tick(env,f.transport),/stale/)
  assert.ok(!f.calls.some(c=>c.url.includes('jnq_publication_finish')))
})
test('Worker exposes no public scheduling or credential endpoint',async()=>{
  const response=await worker.fetch(new Request('https://test.invalid'))
  assert.equal(response.status,404)
  assert.equal(response.headers.get('X-Robots-Tag'),'noindex')
})
