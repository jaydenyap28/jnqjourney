import { createScopedAdminStore } from './store'
import { createFormalMediaChecks } from './formal-media.mjs'
import { publicationStore, jobState, sha256 } from './publication.mjs'
import { makeFormalPublication, verifyFormalJob, formalDigest, formalPublicationCatalog } from './formal-publication.mjs'
import { enqueueFormalJob, reserveFormalRetry } from './formal-release-control.mjs'
import { createFormalMutations } from './formal-mutations'
import { formalMutationOnce, formalMutationStatus } from './formal-idempotency.mjs'
import { FormalError, assertFormalScope } from './formal-runtime.mjs'
import { SPOT_FIELDS } from '../spot-loop/spot-contract.mjs'
import { normalizeNotePayload } from '../../lib/note-payload'
import { normalizeGuidePayload } from '../../lib/guide-payload'
import { prepareFormalSlugEdit, projectFormalSlugs } from './formal-slugs.mjs'
import { createFormalDirectMedia } from './formal-direct-media.mjs'

export function createFormalServices({ db, anonKey, scope, settings, env }: any) {
  assertFormalScope(scope)
  const origin = `https://${scope.projectRef}.supabase.co`
  const queue = publicationStore(db, scope.storageBucket, 16 * 1024 * 1024)
  async function verifyPrivate() {
    if (!settings.privateAuthorityReady || !settings.anonymousBoundaryReady) throw new FormalError(503, 'FORMAL_PRIVATE_RESOURCES_NOT_APPROVED')
    const checked = await db.storage.getBucket(scope.storageBucket)
    if (checked.error || checked.data?.id !== scope.storageBucket || checked.data.public !== false) throw new FormalError(503, 'FORMAL_AUTHORITY_BUCKET_NOT_PRIVATE')
    // A fresh negative probe, not a browser claim or cached approval. Draft
    // inserts cannot be enabled while the old anonymous table bypass remains.
    const response = await fetch(origin + '/rest/v1/locations?select=id,review_jayden&limit=1', {
      headers: { apikey: anonKey, Authorization: 'Bearer ' + anonKey }, redirect: 'error',
      cache: 'no-store', signal: AbortSignal.timeout(15000),
    })
    const denied = await response.json().catch(() => null)
    if (![401, 403].includes(response.status) || denied?.code !== '42501') throw new FormalError(503, 'FORMAL_ANONYMOUS_BOUNDARY_NOT_CLOSED')
  }
  const store = createScopedAdminStore(db, scope.storageBucket, verifyPrivate)
  async function verifyBinding(raw:any){
    if(!raw||!['spot','note','guide'].includes(raw.kind))throw new FormalError(400,'FORMAL_UPLOAD_CONTENT_BINDING_INVALID')
    if(raw.target==='new'){
      if(raw.expectedVersion!==null)throw new FormalError(409,'FORMAL_UPLOAD_NEW_CONTENT_VERSION')
      return {kind:raw.kind,target:'new',expectedVersion:null}
    }
    let version
    if(raw.kind==='spot'){
      if(!Number.isSafeInteger(raw.target)||raw.target<1)throw new FormalError(400,'FORMAL_UPLOAD_TARGET_INVALID')
      const r=await db.from('locations').select('id,updated_at').eq('id',raw.target).maybeSingle()
      if(r.error||!r.data)throw new FormalError(404,'FORMAL_UPLOAD_TARGET_NOT_FOUND');version=r.data.updated_at
    }else{
      if(typeof raw.target!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw.target))throw new FormalError(400,'FORMAL_UPLOAD_TARGET_INVALID')
      const rows:any[]=await store.read(raw.kind==='note'?'notes':'guides'),row=rows.find(v=>v.slug===raw.target)
      if(!row)throw new FormalError(404,'FORMAL_UPLOAD_TARGET_NOT_FOUND');version=row.updatedAt||''
    }
    if(raw.expectedVersion!==version)throw new FormalError(409,'FORMAL_UPLOAD_CONTENT_VERSION_CONFLICT')
    return {kind:raw.kind,target:raw.target,expectedVersion:version}
  }
  const media=createFormalMediaChecks(createFormalDirectMedia({queue,env,verifyBinding,
    async verifyPrivate(){await verifyPrivate();if(!settings.privateMediaReady)throw new FormalError(503,'FORMAL_PRIVATE_MEDIA_SCOPE_NOT_APPROVED')},
  }))
  // All exposed mutation wrappers validate private scope before reserving an
  // intent. The store separately rechecks immediately before its own writes.
  const core = createFormalMutations({ db, store, media, verifyPrivate: async () => {} })
  const mutations = {
    async spot(method: string, body: any, context: any) { await verifyPrivate(); return formalMutationOnce(queue,
      { ...context, operation: method + ':spot', body }, () => core.spot(method, body, context)) },
    async document(kind: 'notes' | 'guides', body: any, context: any) { await verifyPrivate(); return formalMutationOnce(queue,
      { ...context, operation: 'save:' + kind, body }, () => core.document(kind, body, context)) },
    async slug(body: any, context: any) {
      await verifyPrivate()
      return formalMutationOnce(queue,{...context,operation:'save:slug',body},async()=>{
        await store.update('location-slug-edits',async(records:any[])=>{
          const result=await db.from('locations').select('id,updated_at').eq('id',body.id).maybeSingle()
          if(result.error)throw new FormalError(503,'FORMAL_SLUG_RECORD_UNAVAILABLE')
          return prepareFormalSlugEdit(records,body,result.data)
        })
        return {slug:body.slug}
      })
    },
  }
  async function allSpots() {
    const rows: any[] = []
    for (let offset = 0; offset < 10000; offset += 200) {
      const result = await db.from('locations').select(SPOT_FIELDS.join(',') + ',regions:region_id(id,name,name_cn,country,parent_id)').order('id').range(offset, offset + 199)
      if (result.error || !result.data) throw new FormalError(503, 'FORMAL_LOCATIONS_UNAVAILABLE')
      rows.push(...result.data)
      if (result.data.length < 200) return rows
    }
    throw new FormalError(503, 'FORMAL_LOCATIONS_LIMIT')
  }
  async function authority(baseline: any) {
    // Other modules are retained from the approved complete baseline. Refuse
    // to silently resurrect changed/withdrawn auxiliary records outside this
    // core editor's scope; their baseline must be refreshed explicitly.
    for (const [table,old,filter] of [['regions',baseline.feeds['database.json'].regions,''],
      ['travel_packages',baseline.feeds['database.json'].packages,'published'],
      ['travel_package_options',baseline.feeds['database.json'].options,'active'],
      ['affiliate_links',baseline.feeds['database.json'].affiliateLinks,true]] as any[]) {
      if(!old?.length)continue
      const columns=Object.keys(old[0]).filter(key=>key!=='clicks')
      if(columns.some(key=>!/^[_a-z0-9]+$/.test(key)))throw new FormalError(503,'FORMAL_AUXILIARY_CONTRACT_INVALID')
      const rows=[]
      for(let offset=0;offset<10000;offset+=200){
        let query=db.from(table).select(columns.join(',')).order('id').range(offset,offset+199)
        if(filter)query=query.eq(table==='affiliate_links'?'is_active':'status',filter)
        const result=await query
        if(result.error||!result.data)throw new FormalError(503,'FORMAL_AUXILIARY_READ_FAILED')
        rows.push(...result.data);if(result.data.length<200)break
        if(offset===9800)throw new FormalError(503,'FORMAL_AUXILIARY_READ_LIMIT')
      }
      const selected=table==='travel_package_options'?rows.filter((row:any)=>baseline.feeds['database.json'].packages.some((item:any)=>item.id===row.package_id)):rows
      const clean=(values:any[])=>values.map(row=>Object.fromEntries(columns.map(key=>[key,row[key]])))
      if(await formalDigest(clean(selected))!==await formalDigest(clean(old)))throw new FormalError(409,'FORMAL_AUXILIARY_BASELINE_CHANGED')
    }
    const feeds = structuredClone(baseline.feeds)
    const [spots, notes, guides] = await Promise.all([allSpots(), store.read('notes'), store.read('guides')])
    feeds['database.json'].locations = spots
    feeds['database.json'].inventory = spots.map(({ id, status, publication_status, updated_at }: any) => ({ id, status, publication_status, updated_at }))
    feeds['notes.json'].notes = notes; feeds['guides.json'].guides = guides
    const slugMap = await db.storage.from(scope.storageBucket).download('_system/location-slugs.webp')
    if (slugMap.error || !slugMap.data || slugMap.data.size > 1024 * 1024) throw new FormalError(503, 'FORMAL_SLUG_MAP_UNAVAILABLE')
    feeds['location-slugs.json'] = projectFormalSlugs(JSON.parse(await slugMap.data.text()),await store.read('location-slug-edits'),spots,baseline.feeds['database.json'].locations)
    return feeds
  }
  async function publication(request: Request, actor: string) {
    await verifyPrivate()
    const baseline = (await queue.read('_publication/live.json'))?.source
    if (!baseline?.revision || !baseline.feeds) throw new FormalError(503, 'FORMAL_FULL_BASELINE_NOT_SEEDED')
    const inventory = await queue.read('_publication/baseline-inventory/' + baseline.revision + '.json')
    const liveRecord = await queue.read('_publication/live.json')
    if (!(liveRecord.routes?.length && liveRecord.mediaPaths?.length) &&
        !(inventory?.revision === baseline.revision && inventory.deploymentId === liveRecord.deploymentId && inventory.routes?.length && inventory.mediaPaths?.length)) {
      throw new FormalError(503, 'FORMAL_BASELINE_WITHDRAWAL_INVENTORY_REQUIRED')
    }
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname.endsWith('/catalog')) {
      const current = await authority(baseline)
      return formalPublicationCatalog(current, baseline, (kind: string,row:any) => kind === 'note' ? normalizeNotePayload(row) : normalizeGuidePayload(row,{enforceBudgetTotal:true}))
    }
    if (request.method === 'GET') {
      const job = await queue.latest()
      const progress = await jobState(queue, job)
      const heartbeat = await queue.read('_publication/heartbeat.json')
      const online = !!heartbeat?.at && Date.now() - Date.parse(heartbeat.at) < 150000
      const releaseHeld = env('JNQ_FORMAL_EXECUTION_ENABLED') !== 'true'
      return { state: releaseHeld ? 'held' : !job ? 'draft' : (progress?.state || 'queued') === 'queued' && !online ? 'waiting' : progress?.state || 'queued', online, releaseHeld,
        job: job && { id: job.id, requestedAt: job.requestedAt, approvals: job.payload.approvals, ...progress },
        live: { ...(await queue.read('_publication/live.json')), source: undefined, routes: undefined, mediaPaths: undefined, revision: baseline.revision, url: 'https://www.jnqjourney.com' } }
    }
    if (request.method !== 'POST') throw new FormalError(405, 'FORMAL_PUBLICATION_METHOD_DENIED')
    const reader = request.body?.getReader(); if (!reader) throw new FormalError(400, 'FORMAL_BODY_REQUIRED')
    const chunks = []; let length = 0
    for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.byteLength
      if (length > 1024 * 1024) { await reader.cancel(); throw new FormalError(413, 'FORMAL_BODY_LIMIT') }; chunks.push(value) }
    let body; try { body = JSON.parse(await new Blob(chunks).text()) } catch { throw new FormalError(400, 'FORMAL_JSON_INVALID') }
    const current = await authority(baseline)
    if (url.pathname.endsWith('/retry')) {
      const latest = await queue.latest()
      const progress = latest && await queue.progress(latest.id)
      if (!latest || body.id !== latest.id || progress?.state !== 'failed' || progress.retryable !== true) throw new FormalError(409, 'FORMAL_RETRY_NOT_ALLOWED')
      await verifyFormalJob(latest, current, baseline.revision)
      await reserveFormalRetry(queue, latest, progress, actor)
      return { id: latest.id, state: 'queued' }
    }
    let job
    try { job = await makeFormalPublication({ authority: current, baseline, selection: body.selection,
      approvedRemovalDigest: body.approvedRemovalDigest, requestedBy: actor,
      projectDocument: (kind: string, row: any) => kind === 'note' ? normalizeNotePayload(row) : normalizeGuidePayload(row, { enforceBudgetTotal: true }) }) }
    catch (error) {
      if (error instanceof FormalError && error.code === 'FORMAL_NO_PUBLIC_CHANGES') {
        const published = await queue.read('_publication/live.json')
        return { id: published.id, duplicate: true, state: 'published', deploymentId: published.deploymentId }
      }
      throw error
    }
    for (const name of job.payload.media) await media.verifyIdentity(name)
    const { job: saved, duplicate } = await enqueueFormalJob(queue, job, baseline.revision)
    await verifyFormalJob(saved, current, baseline.revision)
    return { id: saved.id, duplicate, state: 'queued', releaseHeld: env('JNQ_FORMAL_EXECUTION_ENABLED') !== 'true' }
  }
  async function runner(request: Request) {
    const proof = request.headers.get('x-jnq-runner-key') || ''
    if (request.headers.get('origin')) throw new FormalError(403, 'FORMAL_RUNNER_ORIGIN_DENIED')
    // The public bootstrap JWT used by Windows is pinned independently of
    // Supabase's injected legacy key. It is NOT the runner authentication:
    // the separate 256-bit server-only proof below is always required too.
    const bearer = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1] || ''
    if (!bearer || await sha256(bearer) !== env('FORMAL_RUNNER_ANON_SHA256')) throw new FormalError(403, 'FORMAL_RUNNER_ANON_KEY_MISMATCH')
    if (!/^[a-f0-9]{64}$/.test(proof) || await sha256(proof) !== env('FORMAL_RUNNER_KEY_SHA256')) throw new FormalError(403, 'FORMAL_RUNNER_PROOF_INVALID')
    if (env('JNQ_FORMAL_EXECUTION_ENABLED') !== 'true') throw new FormalError(423, 'FORMAL_PRODUCTION_RELEASE_HELD')
    await verifyPrivate()
    const path = new URL(request.url).pathname.match(/\/publication\/runner\/(verify|media)\/([a-f0-9]{64})(?:\/([a-f0-9]{64}\.(?:png|jpg|webp|gif)))?$/)
    if (!path || request.method !== 'GET') throw new FormalError(404, 'FORMAL_RUNNER_ROUTE_INVALID')
    const [, action, id, name] = path
    const [job, live] = await Promise.all([queue.latest(), queue.read('_publication/live.json')])
    const baseline = live?.source
    if (!job || job.id !== id) throw new FormalError(409, 'FORMAL_QUEUED_VERSION_CHANGED')
    if (action === 'verify' && !name) {
      const current=await authority(baseline)
      await verifyFormalJob(job,current,baseline.revision)
      for (const asset of job.payload.media) await media.verifyIdentity(asset)
      return Response.json({ revision: id }, { headers: { 'Cache-Control': 'private, no-store' } })
    }
    if (action !== 'media' || !job.payload.media.includes(name)) throw new FormalError(404, 'FORMAL_RUNNER_MEDIA_NOT_APPROVED')
    if(await formalDigest(job.payload)!==job.id||job.payload.baselineRevision!==baseline.revision)throw new FormalError(409,'FORMAL_QUEUED_VERSION_CHANGED')
    const asset = await media.get(name!)
    return new Response(asset.bytes, { headers: { 'Content-Type': asset.type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
  }
  return { mutations, mutationStatus: (id: string, actor: string) => formalMutationStatus(queue, id, actor),
    media, publication, runner, queue, store, authority, verifyPrivate, allSpots }
}
