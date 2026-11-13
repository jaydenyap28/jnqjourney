// Read-only phase-three checks. Never starts a runner, creates a job or deploys.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, statfs } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { getFormalKey } from './formal-read-source.mjs'
import { ACCOUNT, privateWranglerToken } from './candidate-cloudflare.mjs'
import { publicationStore } from '../../cloudflare/admin-preview/publication.mjs'
import { formalDigest } from '../../cloudflare/admin-preview/formal-publication.mjs'
const ref = 'vrufunuomioczocdsoer'
assert.deepEqual(process.argv.slice(2), ['--read-only', ref])
const root = path.resolve(process.env.JNQ_RECOVERY_WORKSPACE), pub = path.join(root, 'production-publisher')
const json = async file => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
const s = await json(path.join(pub, 'settings.json'))
assert.ok(s.projectRef === ref && !s.enabled && !s.formalPublishingEnabled)
process.env.JNQ_SUPABASE_CLI = s.supabaseCli; process.env.JNQ_WRANGLER_CLI = s.wranglerCli
const db = createClient(`https://${ref}.supabase.co`, await getFormalKey(), { auth: { persistSession: false } })
const queue = publicationStore(db, 'jnq-admin-formal-publication', 16 * 1024 ** 2)
const live = await queue.read('_publication/live.json'), jobs = await queue.latest()
assert.ok(live?.source?.feeds && live.source.revision === await formalDigest(live.source.feeds))
assert.equal(jobs, null, 'UNEXPECTED_EXISTING_JOB_STOP')
const b = await db.storage.getBucket('jnq-admin-formal-publication'); assert.ok(!b.error && b.data.public === false)
const rows = await db.from('locations').select('id,status,publication_status,updated_at').order('id').limit(1000)
assert.ok(!rows.error && rows.data.length < 1000)
const eligible = row => row.id !== 450 && row.status === 'active' && [null, 'published'].includes(row.publication_status)
const ids = rows.data.filter(eligible).map(row => row.id)
assert.deepEqual(ids, live.source.feeds['database.json'].locations.map(row => row.id).sort((a,b) => a-b), 'PUBLIC_SET_CHANGED')
assert.equal(ids.length, 582); assert.ok(!ids.includes(853))
const documents = {}
for (const kind of ['notes', 'guides']) {
  const p = await db.storage.from(b.data.id).download(`_system/${kind}-latest.webp`); assert.ok(!p.error)
  const d = await db.storage.from(b.data.id).download((await p.data.text()).trim()); assert.ok(!d.error)
  const all = JSON.parse(await d.data.text())
  const visible = all.filter(row => kind === 'notes' ? row.published === true : row.published !== false && [null, undefined, 'published'].includes(row.publication_status))
  const old = live.source.feeds[kind + '.json'][kind]
  assert.deepEqual(visible.map(row => row.slug).sort(), old.map(row => row.slug).sort(), 'PUBLIC_DOCUMENT_SET_CHANGED')
  documents[kind] = { public: visible.length, drafts: all.length - visible.length }
}
const revoked = await queue.read('_media/f9dce8bd73884fd12f1dedaff14302fd1415fc8358da672937b8b5d8eeeb8f98.png.json')
assert.equal(revoked?.revoked, true)
assert.ok(!JSON.stringify(live.source.feeds).includes('f9dce8bd73884fd12f1dedaff14302fd1415fc8358da672937b8b5d8eeeb8f98'))
const token = await privateWranglerToken(), headers = { Authorization: 'Bearer ' + token }
const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/pages/projects/jnqjourney-static-recovery-candidate`, { headers, redirect: 'error', signal: AbortSignal.timeout(20000) })
const p = (await response.json()).result
assert.ok(response.ok && p && !p.source && p.production_branch)
assert.equal(p.canonical_deployment.id, '333e51aa-506e-4a66-a7c6-4f28e3e890a1'); assert.equal(p.canonical_deployment.uses_functions, false)
for (const cfg of Object.values(p.deployment_configs)) for (const field of ['env_vars','r2_buckets','kv_namespaces','d1_databases','services','durable_object_namespaces']) assert.equal(Object.keys(cfg[field] || {}).length, 0)
const end = new Date().toISOString(), start = end.slice(0,7) + '-01T00:00:00Z'
const query = `query($a:string!,$start:Time!,$end:Time!){viewer{accounts(filter:{accountTag:$a}){storage:r2StorageAdaptiveGroups(limit:50,filter:{datetime_geq:$start,datetime_leq:$end}){max{payloadSize metadataSize objectCount}dimensions{bucketName}}operations:r2OperationsAdaptiveGroups(limit:1000,filter:{datetime_geq:$start,datetime_leq:$end}){sum{requests}dimensions{actionType actionStatus}}}}}`
const u = await fetch('https://api.cloudflare.com/client/v4/graphql', { method:'POST', headers:{...headers,'Content-Type':'application/json'}, body:JSON.stringify({query,variables:{a:ACCOUNT,start,end}}), signal:AbortSignal.timeout(30000) })
const usage = await u.json(); assert.ok(u.ok && !usage.errors && usage.data.viewer.accounts.length === 1)
const measured = usage.data.viewer.accounts[0], peak = measured.storage.reduce((n,v) => n+v.max.payloadSize+v.max.metadataSize,0), ops = measured.operations.reduce((n,v) => n+v.sum.requests,0)
assert.ok(measured.storage.length < 50 && measured.operations.length < 1000, 'USAGE_TRUNCATED')
assert.ok(peak < 10_000_000_000 && ops < 1_000_000, 'FREE_HEADROOM_UNCONFIRMED')
const disk = await statfs(root)
const result = { at:end, projectRef:ref, productionId:p.canonical_deployment.id, productionBranch:p.production_branch, functions:0,
  privateQueue:true, existingJobs:0, publicSpots:ids.length, documents, hidden853Excluded:true, revokedMediaExcluded:true,
  baselineRevision:live.source.revision, baselineRoutes:live.routes?.length || 0, baselineMediaPaths:live.mediaPaths?.length || 0,
  runnerKeyPresent:/^[a-f0-9]{64}$/.test((await readFile(path.join(pub,'.runner-key'),'utf8')).trim()),
  r2:{window:{start,end},conservativePeakBytes:peak,observedAllOperations:ops,invoiceAndSubscription:'UNKNOWN'},
  freeBytes:disk.bavail * disk.bsize, queueClaimed:false, productionSubmitted:false,
  publicConfigDigest:createHash('sha256').update(JSON.stringify({domains:p.domains,branch:p.production_branch,config:p.deployment_configs})).digest('hex') }
const dir = path.join(pub,'publication-phase3-20261113'); await mkdir(dir,{recursive:true})
await writeFile(path.join(dir,'preflight.json'),JSON.stringify(result,null,2),{flag:'wx'})
console.log(JSON.stringify(result))
