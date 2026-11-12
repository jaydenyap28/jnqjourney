import type { SupabaseClient } from '@supabase/supabase-js'
import { authority, catalog, jobState, makeJob, publicationStore, PublicationError, revisionPattern, ROOT } from './publication.mjs'
import type { createAdminStore } from './store.ts'
import type { createDraftMedia } from './media.ts'

type Dependencies = {
  db: SupabaseClient
  store: ReturnType<typeof createAdminStore>
  media: ReturnType<typeof createDraftMedia>
  method: string
  route: string
  headers: Record<string, string>
  read: () => Promise<any>
  runner: boolean
}

export async function handlePublication({ db, store, media, method, route, headers, read, runner }: Dependencies) {
  const queue = publicationStore(db)
  const json = (data: unknown, status = 200) => Response.json(data, { status, headers })
  if (runner) {
    const path = route.match(/^\/publication\/runner\/(verify|media)\/([a-f0-9]{64})(?:\/([a-f0-9]{64}\.(?:png|jpg|webp|gif)))?$/)
    if (!path || method !== 'GET') throw new PublicationError(404, '不支持此执行器请求。')
    const [, action, id, name] = path
    const latest = await queue.latest()
    if (!latest || latest.id !== id) throw new PublicationError(409, '发布任务已被新的批准版本取代。')
    if (action === 'verify' && !name) {
      const current = await makeJob(await authority(db, store), latest.projection.approvals)
      if (current.id !== id) throw new PublicationError(409, '批准内容已变化。')
      return json({ revision: id })
    }
    if (action !== 'media' || !latest.projection.media.includes(name)) throw new PublicationError(404, '图片不在批准清单。')
    const asset = await media.get(name)
    return new Response(asset.bytes, { headers: { ...headers, 'Content-Type': asset.type } })
  }

  if (route === '/publication' && method === 'GET') {
    const [latest, live, heartbeat] = await Promise.all([
      queue.latest(), queue.read(ROOT + '/live.json'), queue.read(ROOT + '/heartbeat.json'),
    ])
    const progress = await jobState(queue, latest)
    const online = Boolean(heartbeat?.at && Date.now() - Date.parse(heartbeat.at) < 150000)
    const state = progress?.state === 'queued' && !online ? 'waiting' : progress?.state || 'draft'
    return json({
      state, online, live,
      job: latest && { id: latest.id, requestedAt: latest.requestedAt, approvals: latest.projection.approvals, ...progress, state },
    })
  }
  if (route === '/publication/catalog' && method === 'GET') {
    return json({ items: catalog(await authority(db, store)) })
  }
  if (route === '/publication' && method === 'POST') {
    const body = await read()
    const next = await makeJob(await authority(db, store), body.selection)
    const latest = await queue.latest()
    const known = await queue.job(next.id)
    if (known) {
      if (latest?.id !== next.id) throw new PublicationError(409, '旧发布版本已取代，请更新内容后重新批准。')
      return json({ id: known.id, duplicate: true }, 200)
    }
    if (!next.projection.records.length && !(await queue.read(ROOT + '/live.json'))) {
      throw new PublicationError(400, '首次发布请选择至少一条内容。')
    }
    const stored = await queue.createOnce(`${ROOT}/jobs/${next.id}.json`, next)
    return json({ id: stored.id, duplicate: stored.requestedAt !== next.requestedAt }, 202)
  }
  if (route === '/publication/retry' && method === 'POST') {
    const { id } = await read()
    if (typeof id !== 'string' || !revisionPattern.test(id)) throw new PublicationError(400, '任务 ID 无效。')
    const latest = await queue.latest()
    if (latest?.id !== id) throw new PublicationError(409, '只能重试最新发布任务。')
    const status = await queue.progress(id)
    if (status?.state !== 'failed' || !status.retryable) throw new PublicationError(409, '任务尚不能重试。')
    const current = await makeJob(await authority(db, store), latest.projection.approvals)
    if (current.id !== id) throw new PublicationError(409, '批准内容已变化，请重新确认。')
    await queue.createOnce(`${ROOT}/retry/${id}/${status.attempt + 1}.json`, { at: new Date().toISOString() })
    return json({ id, queued: true }, 202)
  }
  throw new PublicationError(404, '未知发布操作。')
}
