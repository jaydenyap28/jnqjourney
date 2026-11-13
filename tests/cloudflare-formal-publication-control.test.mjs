import assert from 'node:assert/strict'
import test from 'node:test'
import { enqueueFormalJob, reserveFormalRetry, requireFormalExecution } from '../cloudflare/admin-preview/formal-release-control.mjs'
import { formalPublicationCatalog, makeFormalPublication, formalDigest } from '../cloudflare/admin-preview/formal-publication.mjs'
import { requireFormalFreeHeadroom } from '../scripts/cloudflare/formal-publication-cost.mjs'

test('Production HOLD rejects before any task I/O; every approval is required', () => {
  const allowed = { enabled:true, formalPublishingEnabled:true, productionReleaseApproved:true, supportedReleaseEnvironment:'production' }
  requireFormalExecution(allowed)
  for (const key of Object.keys(allowed)) assert.throws(() => requireFormalExecution({...allowed,[key]:key === 'supportedReleaseEnvironment' ? 'preview' : false}), /PRODUCTION_RELEASE_HELD/)
  assert.throws(() => requireFormalExecution({}), /PRODUCTION_RELEASE_HELD/)
})

function queue() {
  const objects = new Map(); let latest = null
  return { objects, latest:async()=>latest, progress:async id=>objects.get('progress:'+id), retry:async()=>null,
    createOnce:async(name,value)=>{ if (!objects.has(name)) objects.set(name,value); if (name.startsWith('_publication/jobs/')) latest=objects.get(name); return objects.get(name) } }
}
const job = id => ({id,requestedAt:id,payload:{}})
test('concurrent clicks reserve one create-only slot; no task is overwritten or silently skipped', async () => {
  const q = queue()
  const result = await Promise.allSettled([enqueueFormalJob(q,job('one'),'baseline'),enqueueFormalJob(q,job('two'),'baseline')])
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1)
  assert.match(result.find(r=>r.status==='rejected').reason.message,/CONCURRENT_PUBLISH/)
  assert.equal((await q.latest()).id,'one')
  assert.equal((await enqueueFormalJob(q,job('one'),'baseline')).duplicate,true)
  await assert.rejects(enqueueFormalJob(q,job('three'),'baseline'),/QUEUE_BUSY/)
  q.objects.set('progress:one',{state:'failed',attempt:1})
  assert.equal((await enqueueFormalJob(q,job('three'),'baseline')).job.id,'three')
})

test('lost create response is confirmed by identical job, never blindly overwritten', async () => {
  const q = queue(), original=q.createOnce; let uncertain=true
  q.createOnce=async(name,value)=>{ if(name.startsWith('_publication/jobs/')&&uncertain){uncertain=false;throw Error('unknown response')}return original(name,value) }
  await assert.rejects(enqueueFormalJob(q,job('one'),'base'),/unknown/)
  await assert.rejects(enqueueFormalJob(q,job('other'),'base'),/CONCURRENT_PUBLISH/)
  assert.equal((await enqueueFormalJob(q,job('one'),'base')).job.id,'one')
})

test('retry and a new publish compete for one generation; a finished retry permits the next job', async()=>{
 const q=queue();await enqueueFormalJob(q,job('one'),'base');q.objects.set('progress:one',{state:'failed',attempt:1})
 await reserveFormalRetry(q,job('one'),{state:'failed',attempt:1},'synthetic-actor')
 await assert.rejects(enqueueFormalJob(q,job('two'),'base'),/CONCURRENT_PUBLISH/)
 q.objects.set('progress:one',{state:'succeeded',attempt:2})
 assert.equal((await enqueueFormalJob(q,job('two'),'new-base')).job.id,'two')
})

test('catalog separates new, modified, withdrawn, unchanged and private drafts', async () => {
  const active = (id,name)=>({id,name,status:'active',publication_status:null,updated_at:'v1'})
  const baseline={feeds:{'database.json':{locations:[active(1,'one'),active(2,'two'),active(3,'three')]},'notes.json':{notes:[]},'guides.json':{guides:[]}}}
  const current=structuredClone(baseline.feeds)
  current['database.json'].locations=[active(1,'one'),active(2,'changed'),{...active(3,'three'),publication_status:'hidden'},active(4,'new'),{...active(853,'private'),publication_status:'hidden'}]
  const result=await formalPublicationCatalog(current,baseline,(_kind,row)=>row)
  assert.deepEqual(result.counts,{added:1,modified:1,hidden:1})
  assert.equal(result.items.find(row=>row.key==='853').eligible,false)
  assert.equal(result.items.find(row=>row.key==='1').change,'unchanged')
})

test('cost guard stops on unknown, stale, truncated or insufficient native usage', () => {
  const now=Date.parse('2026-11-13T00:00:00Z'),usage={at:new Date(now).toISOString(),complete:true,peakBytes:7506028517,operations:64876}
  requireFormalFreeHeadroom(usage,now)
  for(const bad of [{...usage,complete:false},{...usage,at:'UNKNOWN'},{...usage,at:new Date(now-300001).toISOString()}, {...usage,operations:999999},{...usage,peakBytes:9999999999}])assert.throws(()=>requireFormalFreeHeadroom(bad,now))
})

test('later releases retain registered incremental media and recheck it; focal fragments cannot change identity',async()=>{
 const name='a'.repeat(64)+'.png',active=(id)=>({id,name:'Synthetic '+id,status:'active',publication_status:null,updated_at:'v1'})
 const feeds={'database.json':{projectRef:'vrufunuomioczocdsoer',locations:[{...active(1),image_url:'/media/static/'+name+'#focus=1,2'},active(2)],inventory:[]},'notes.json':{notes:[]},'guides.json':{guides:[]},'location-slugs.json':{}}
 const baseline={feeds,revision:await formalDigest(feeds),media:{[name]:{bytes:1,rightsEvidence:'synthetic'}}}
 const authority=structuredClone(feeds);authority['database.json'].locations[1].name='Changed'
 const job=await makeFormalPublication({authority,baseline,selection:[{kind:'spot',key:'2',version:'v1',action:'publish'}],requestedBy:'synthetic'})
 assert.deepEqual(job.payload.media,[name])
 authority['database.json'].locations[0].image_url=''
 authority['database.json'].locations[0].description='<p><img src="/media/static/'+name+'"></p>'
 const html=await makeFormalPublication({authority,baseline,selection:[{kind:'spot',key:'2',version:'v1',action:'publish'}],requestedBy:'synthetic'})
 assert.deepEqual(html.payload.media,[name])
 authority['database.json'].locations[0].description=undefined
 authority['database.json'].locations[0].image_url='/admin-draft-media/'+name+'#focus=1,2'
 const catalog=await formalPublicationCatalog(authority,baseline,(_kind,row)=>row)
 assert.equal(catalog.items.find(row=>row.key==='1').change,'unchanged')
})
