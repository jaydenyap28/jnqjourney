import { createScopedAdminStore } from './store'
import { createScopedDraftMedia } from './media'
import { createFormalMediaChecks } from './formal-media.mjs'
import { publicationStore, jobState, sha256 } from './publication.mjs'
import { makeFormalPublication, verifyFormalJob, formalDigest } from './formal-publication.mjs'
import { createFormalMutations } from './formal-mutations'
import { formalMutationOnce, formalMutationStatus } from './formal-idempotency.mjs'
import { FormalError, assertFormalScope } from './formal-runtime.mjs'
import { SPOT_FIELDS } from '../spot-loop/spot-contract.mjs'
import { normalizeNotePayload } from '../../lib/note-payload'
import { normalizeGuidePayload } from '../../lib/guide-payload'
import { prepareFormalSlugEdit, projectFormalSlugs } from './formal-slugs.mjs'

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
  const rawMedia = createScopedDraftMedia(env, { bucket: scope.mediaBucket, prefix: scope.mediaPrefix,
    mediaPrefix: '/admin-draft-media/', accessName: 'FORMAL_R2_ACCESS_KEY_ID', secretName: 'FORMAL_R2_SECRET_ACCESS_KEY', requireRightsEvidence: true })
  const normalizedEtag=(value:unknown)=>typeof value==='string'&&/^"?[a-f0-9]{32}"?$/i.test(value)?value.replaceAll('"','').toLowerCase():null
  async function mediaReceipt(name:string) {
      if (!settings.privateMediaReady) throw new FormalError(503, 'FORMAL_PRIVATE_MEDIA_SCOPE_NOT_APPROVED')
      if (!/^[a-f0-9]{64}\.(?:png|jpg|webp|gif)$/.test(name)) throw new FormalError(400, 'FORMAL_MEDIA_NAME_INVALID')
      const receipt = await queue.read('_media/' + name + '.json')
      if (!receipt || receipt.revoked !== false || receipt.bucket !== scope.mediaBucket ||
          receipt.key !== scope.mediaPrefix + '/' + name || receipt.sha256 !== name.split('.')[0] || !receipt.rightsEvidence || !normalizedEtag(receipt.etag)) throw new FormalError(404, 'FORMAL_MEDIA_NOT_VERIFIED')
      return receipt
  }
  const media = createFormalMediaChecks({
    async get(name: string) {
      const receipt=await mediaReceipt(name)
      const result = await rawMedia.get(name)
      if (result.bytes.length !== receipt.size || normalizedEtag(result.etag)!==normalizedEtag(receipt.etag)) throw new FormalError(503, 'FORMAL_MEDIA_IDENTITY_CHANGED')
      return { ...result, rightsEvidence: receipt.rightsEvidence }
    },
    async verifyIdentity(name:string){
      const receipt=await mediaReceipt(name),actual=await rawMedia.head(name)
      if(actual.size!==receipt.size||normalizedEtag(actual.etag)!==normalizedEtag(receipt.etag))throw new FormalError(409,'FORMAL_MEDIA_IDENTITY_CHANGED')
    },
    async upload(request: Request, actor: string) {
      await verifyPrivate()
      if (!settings.privateMediaReady) throw new FormalError(503, 'FORMAL_PRIVATE_MEDIA_SCOPE_NOT_APPROVED')
      const result = await rawMedia.upload(request)
      const name = result.url.slice('/admin-draft-media/'.length)
      if(!normalizedEtag(result.etag))throw new FormalError(503,'FORMAL_MEDIA_ETAG_UNAVAILABLE')
      const receipt = { bucket: scope.mediaBucket, key: result.key, sha256: name.split('.')[0], size: result.size,etag:result.etag,
        rightsEvidence: result.rightsEvidence, actor, verifiedAt: new Date().toISOString(), revoked: false }
      const saved = await queue.createOnce('_media/' + name + '.json', receipt)
      if (saved.revoked !== false || saved.sha256 !== receipt.sha256 || saved.key !== receipt.key || saved.size !== receipt.size || normalizedEtag(saved.etag)!==normalizedEtag(receipt.etag)) throw new FormalError(409, 'FORMAL_MEDIA_RECEIPT_CONFLICT')
      // Uncertain receipt saves never trigger object deletion.
      await media.verifyIdentity(name)
      return result
    },
  })
  // All exposed mutation wrappers validate private scope before reserving an
  // intent. The store separately rechecks immediately before its own writes.
  const core = createFormalMutations({ db, store, media, verifyPrivate: async () => {} })
  const mutations = {
    async spot(method: string, body: any, context: any) { await verifyPrivate(); return formalMutationOnce(queue,
      { ...context, operation: method + ':spot', body }, () => core.spot(method, body)) },
    async document(kind: 'notes' | 'guides', body: any, context: any) { await verifyPrivate(); return formalMutationOnce(queue,
      { ...context, operation: 'save:' + kind, body }, () => core.document(kind, body)) },
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
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname.endsWith('/catalog')) {
      const current = await authority(baseline)
      const items: any[] = []
      for (const [kind, rows, old] of [['spot', current['database.json'].locations, baseline.feeds['database.json'].locations],
        ['note', current['notes.json'].notes, baseline.feeds['notes.json'].notes], ['guide', current['guides.json'].guides, baseline.feeds['guides.json'].guides]] as any[]) {
        for (const row of rows) {
          const key = kind === 'spot' ? String(row.id) : row.slug
          const exists = old.some((item: any) => (kind === 'spot' ? String(item.id) : item.slug) === key)
          const visible = kind === 'spot' ? row.id !== 450 && row.status === 'active' && [null, 'published'].includes(row.publication_status) :
            kind === 'note' ? row.published === true : row.published !== false && [null, undefined, 'published'].includes(row.publication_status)
          items.push({ kind, key, title: row.name_cn || row.name || row.title, version: kind === 'spot' ? row.updated_at : row.updatedAt || '',
            eligible: visible || exists, status: visible ? '准备公开' : exists ? '待撤下' : '草稿', action: visible ? 'publish' : 'withdraw' })
        }
      }
      return { items }
    }
    if (request.method === 'GET') {
      const job = await queue.latest()
      const progress = await jobState(queue, job)
      const heartbeat = await queue.read('_publication/heartbeat.json')
      const online = !!heartbeat?.at && Date.now() - Date.parse(heartbeat.at) < 150000
      return { state: !job ? 'draft' : (progress?.state || 'queued') === 'queued' && !online ? 'waiting' : progress?.state || 'queued', online,
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
      await queue.createOnce(`_publication/retry/${latest.id}/${(progress.attempt || 1) + 1}.json`, { at: new Date().toISOString(), actor })
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
    const saved = await queue.createOnce('_publication/jobs/' + job.id + '.json', job)
    await verifyFormalJob(saved, current, baseline.revision)
    return { id: saved.id, state: 'queued' }
  }
  async function runner(request: Request) {
    const proof = request.headers.get('x-jnq-runner-key') || ''
    if (request.headers.get('origin') || request.headers.get('authorization') !== 'Bearer ' + anonKey ||
        !/^[a-f0-9]{64}$/.test(proof) || await sha256(proof) !== env('FORMAL_RUNNER_KEY_SHA256')) throw new FormalError(403, 'FORMAL_RUNNER_PROOF_INVALID')
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
