import test from 'node:test'
import assert from 'node:assert/strict'
import { assertSingleReleaseApproval, requireSingleReleaseSettings, requireSingleJobApproval, restoreSingleReleaseHold } from '../cloudflare/admin-preview/formal-single-release.mjs'
import { formalDigest } from '../cloudflare/admin-preview/formal-publication.mjs'
import { formalReleaseReview, assertFormalFixtureExclusion } from '../cloudflare/admin-preview/formal-release-review.mjs'
import { formalPublisherTick } from '../scripts/cloudflare/formal-publisher-core.mjs'
const now=Date.parse('2026-11-13T08:00:00Z'),hex=n=>n.repeat(64),production='333e51aa-506e-4a66-a7c6-4f28e3e890a1'
async function fixture(){
 const payload={authorityRevision:hex('a'),baselineRevision:hex('b'),feeds:{}},id=await formalDigest(payload)
 const approval={mode:'single-job',jobId:id,contentFingerprint:id,authorityFingerprint:payload.authorityRevision,baselineRevision:payload.baselineRevision,
  expectedProductionId:production,expectedProductionBranch:'main',attempt:1,approvedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+3600000).toISOString()}
 return {approval,job:{id,payload},attempt:1,live:{source:{revision:hex('b')},deploymentId:production},spent:null}
}
test('global enabled flags alone cannot authorize a first Production job',async()=>{
 const flags={enabled:true,formalPublishingEnabled:true,productionReleaseApproved:true,supportedReleaseEnvironment:'production'}
 assert.throws(()=>requireSingleReleaseSettings(flags,now),/SINGLE_JOB_APPROVAL_REQUIRED/)
 const {approval}=await fixture();assert.deepEqual(requireSingleReleaseSettings({...flags,approvedRelease:approval},now),approval)
})
test('approval pins job, exact payload, authority, baseline, Production and attempt',async()=>{
 const f=await fixture();await requireSingleJobApproval(f,now)
 for(const mutation of [{job:{...f.job,id:hex('c')}},{job:{...f.job,payload:{...f.job.payload,media:['forged']}}},
  {approval:{...f.approval,authorityFingerprint:hex('c')}},{attempt:2},{live:{...f.live,deploymentId:'00000000-0000-0000-0000-000000000000'}},
  {live:{...f.live,source:{revision:hex('c')}}},{spent:{state:'failed'}}])await assert.rejects(requireSingleJobApproval({...f,...mutation},now),/SINGLE_JOB_APPROVAL/)
})
test('missing, expired, future, unbounded and non-single approvals fail closed',async()=>{
 const {approval}=await fixture()
 for(const a of [null,{}, {...approval,mode:'automatic'}, {...approval,expiresAt:new Date(now).toISOString()}, {...approval,approvedAt:new Date(now+1).toISOString()},
  {...approval,expiresAt:new Date(now+3*3600000).toISOString()}, {...approval,contentFingerprint:hex('c')}])assert.throws(()=>assertSingleReleaseApproval(a,now),/SINGLE_JOB_APPROVAL_REQUIRED/)
})
test('terminal success, failure and uncertainty consume approval and restore all holds',async()=>{
 for(const state of ['succeeded','failed','uncertain']){
  const order=[],ports=Object.fromEntries(['consumeApproval','holdLocal','holdServer','disableTask'].map(name=>[name,async()=>order.push(name)]))
  const r=await restoreSingleReleaseHold(ports,{state});assert.equal(r.state,'held');assert.deepEqual(order,['consumeApproval','holdLocal','holdServer','disableTask'])
 }
 const order=[],ports=Object.fromEntries(['consumeApproval','holdLocal','holdServer','disableTask'].map(name=>[name,async()=>{order.push(name);if(name==='consumeApproval'||name==='holdServer')throw Error('synthetic')}]))
 const r=await restoreSingleReleaseHold(ports,{state:'uncertain'});assert.equal(order.length,4);assert.deepEqual(r.cleanupFailures,['consumeApproval','holdServer'])
})
test('interrupted one-shot build cannot automatically advance to an unapproved attempt',async()=>{
 let progress,built=false
 const r=await formalPublisherTick({enabled:true,singleRelease:true,ports:{lock:async()=>({release:async()=>{}}),pending:async()=>null,
  latest:async()=>({id:hex('a')}),state:async()=>({state:'building',attempt:1}),progress:async(_j,p)=>{progress=p},build:async()=>{built=true}}})
 assert.equal(r.state,'failed');assert.match(progress.reason,/REQUIRES_NEW_APPROVAL/);assert.equal(built,false)
})

test('a crashed attempt with a durable claim cannot be built again', async () => {
  const job = { id: hex('a') }
  const ports = {
    lock: async () => ({ release: async () => {} }),
    pending: async () => null,
    latest: async () => job,
    state: async () => ({ state: 'queued', attempt: 1 }),
    ledger: async () => [],
    verifyAuthority: async () => {},
    claimSingleAttempt: async () => { throw Error('FORMAL_SINGLE_ATTEMPT_ALREADY_CLAIMED') },
    recordAttempt: async () => assert.fail('The consumed attempt must stop before changing the budget'),
    build: async () => assert.fail('The consumed attempt must stop before building'),
  }
  await assert.rejects(formalPublisherTick({ enabled: true, ports, singleRelease: true }), /FORMAL_SINGLE_ATTEMPT_ALREADY_CLAIMED/)
})
const targets=[{kind:'spot',target:853},{kind:'note',target:'private-test-note'},{kind:'guide',target:'private-test-guide'}]
test('review records actual full-baseline delta and excludes all known private fixtures',async()=>{
 const row=(id,name)=>({id,name,status:'active',publication_status:null,updated_at:'v1'})
 const feeds={'database.json':{locations:[{...row(1,'one'),review_jayden:'private'}]},'notes.json':{notes:[]},'guides.json':{guides:[]}}
 const current=structuredClone(feeds),after=structuredClone(feeds);delete after['database.json'].locations[0].review_jayden;after['database.json'].locations.push(row(2,'new'))
 const baseline={feeds,revision:hex('b'),media:{}},payload={feeds:after,baselineRevision:baseline.revision,authorityRevision:await formalDigest(current),media:[]},job={id:await formalDigest(payload),payload,requestedAt:'synthetic'}
 const r=await formalReleaseReview({job,current,baseline,targets});assert.equal(r.changes.added.length,1);assert.equal(r.changes.modified.length,0);assert.equal(r.expectedPublicContent.spot,2);assert.equal(r.rollback.baselineEligible,true)
 for(const bad of [{kind:'spot',target:853},{kind:'note',target:'private-test-note'},{kind:'guide',target:'private-test-guide'}]){
  const p=structuredClone(payload),[file,field]=bad.kind==='spot'?['database.json','locations']:bad.kind==='note'?['notes.json','notes']:['guides.json','guides']
  p.feeds[file][field].push(bad.kind==='spot'?row(bad.target,'private'):{slug:bad.target,published:true});assert.throws(()=>assertFormalFixtureExclusion(p,targets),/TEST_CONTENT_EXCLUDED/)
 }
 const p=structuredClone(payload);p.feeds['database.json'].locations[0].image_url='/media/static/f9dce8bd73884fd12f1dedaff14302fd1415fc8358da672937b8b5d8eeeb8f98.png'
 assert.throws(()=>assertFormalFixtureExclusion(p,targets),/TEST_CONTENT_EXCLUDED/);assert.throws(()=>assertFormalFixtureExclusion(payload,[]),/BOUNDARY_UNKNOWN/)
})
test('review marks the old baseline unsafe for rollback after a real withdrawal',async()=>{
 const baseline={revision:hex('b'),feeds:{'database.json':{locations:[{id:1,name:'one',status:'active',publication_status:null}]},'notes.json':{notes:[]},'guides.json':{guides:[]}}}
 const current=structuredClone(baseline.feeds);current['database.json'].locations[0].publication_status='hidden'
 const feeds=structuredClone(baseline.feeds);feeds['database.json'].locations=[]
 const payload={feeds,baselineRevision:baseline.revision,authorityRevision:await formalDigest(current),media:[]},job={id:await formalDigest(payload),payload}
 const review=await formalReleaseReview({job,current,baseline,targets});assert.equal(review.rollback.baselineEligible,false);assert.equal(review.changes.hidden.length,1)
})
