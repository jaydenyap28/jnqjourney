import { createClient } from 'npm:@supabase/supabase-js@2.93.3'
import { normalizeNotePayload } from '../../lib/note-payload.ts'
import { normalizeGuidePayload } from '../../lib/guide-payload.ts'
import { mergeNoteSave, NoteConflictError } from '../../lib/note-sync.ts'
import { countLegacyGuideLinkedSpots } from '../../lib/guide-legacy-migration.ts'
import { editSpotTranslation, spotTranslationSource } from '../../lib/spot-localization-authoring.ts'
import { applyLocalization, type LocalizationRecord } from '../../lib/localization.ts'
import { buildLocationSlug } from '../../lib/location-routing.ts'
import { SPOT_FIELDS, validateSpotFields, validVersion } from '../spot-loop/spot-contract.mjs'
import { createAdminStore, AdminError } from './store.ts'
import { createDraftMedia } from './media.ts'
import { ADMIN_ORIGIN, FIRST_SPOT_ID, FUNCTION, LAST_SPOT_ID, PRIVATE_BUCKET, SUPABASE_ORIGIN } from './scope.mjs'
import config from './operator.json' with { type: 'json' }

const readEnv = (name: string) => Deno.env.get(name)
const dbOptions = { auth: { persistSession: false, autoRefreshToken: false }, global: {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, {
    ...init, redirect: 'error', cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  }),
} }
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
function validSlug(slug: string) { return slug.length <= 120 && slugPattern.test(slug) }
function spotId(id: unknown): id is number {
  return Number.isInteger(id) && Number(id) >= FIRST_SPOT_ID && Number(id) <= LAST_SPOT_ID
}

async function readBody(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new AdminError(415, '需要 JSON 请求。')
  const reader = request.body?.getReader()
  if (!reader) throw new AdminError(400, '缺少保存数据。')
  const decoder = new TextDecoder()
  let text = '', bytes = 0
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > 1024 * 1024) {
      await reader.cancel()
      throw new AdminError(413, '保存数据过大。')
    }
    text += decoder.decode(value, { stream: true })
  }
  try {
    const body = JSON.parse(text + decoder.decode())
    if (body && typeof body === 'object' && !Array.isArray(body)) return body
  } catch { /* mapped to the same invalid-input response */ }
  throw new AdminError(400, '无效保存数据。')
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('origin')
  const headers = {
    'Cache-Control': 'private, no-store, max-age=0',
    'Vary': 'Origin, Authorization',
    'X-Content-Type-Options': 'nosniff',
    ...(origin === ADMIN_ORIGIN ? { 'Access-Control-Allow-Origin': origin } : {}),
  }
  const json = (value: unknown, status = 200) => Response.json(value, { status, headers })
  if (origin && origin !== ADMIN_ORIGIN) return json({ error: '不允许此来源。' }, 403)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
    ...headers, 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  } })

  try {
    const anon = readEnv('SUPABASE_ANON_KEY')
    const service = readEnv('SUPABASE_SERVICE_ROLE_KEY')
    if (readEnv('SUPABASE_URL') !== SUPABASE_ORIGIN || !anon || !service ||
        !/^[a-f0-9-]{36}$/.test(config.adminId)) throw new AdminError(503, '隔离服务配置无效。')
    const token = request.headers.get('authorization')?.match(/^Bearer ([\w.-]+)$/i)?.[1]
    if (!token) throw new AdminError(401, '请先登录。')
    const { data: identity, error: authError } = await createClient(SUPABASE_ORIGIN, anon, dbOptions).auth.getUser(token)
    if (authError || !identity.user) throw new AdminError(401, '会话失效，请重新登录。')
    if (identity.user.id !== config.adminId) throw new AdminError(403, '这个账号没有后台权限。')

    const db = createClient(SUPABASE_ORIGIN, service, dbOptions)
    const store = createAdminStore(db)
    const media = createDraftMedia(readEnv)
    const url = new URL(request.url)
    const route = url.pathname.replace(new RegExp(`^/(?:functions/v1/)?${FUNCTION}(?=/|$)`), '')
    const method = request.method
    if (route === '/session' && method === 'GET') return json({ authorized: true })
    if (route === '/publication' && method === 'GET') return json({
      state: 'unavailable', message: '发布执行器尚未接通。保存内容保留在隔离后台。',
    })
    if (route === '/upload/r2' && method === 'POST') {
      const item = await media.upload(request)
      return json({ items: [item], files: [item], ...item })
    }
    if (route === '/admin/media' && method === 'GET') {
      const image = await media.get(url.searchParams.get('name') || '')
      return new Response(image.bytes, { headers: { ...headers, 'Content-Type': image.type } })
    }
    if (route === '/admin/regions' && method === 'GET') {
      const result = await db.from('regions').select('id,name,name_cn,country,parent_id').order('name').limit(200)
      if (result.error) throw new AdminError(503, '地区资料暂不可用。')
      return json({ data: result.data })
    }
    if (route === '/admin/klook-widgets' && method === 'GET') {
      // There are no Klook records in the isolated editor scope.
      return json({ widgets: [] })
    }
    if (route === '/admin/location-slugs' && ['GET', 'POST'].includes(method)) {
      const body = method === 'POST' ? await readBody(request) : null
      const id = body ? body.id : Number(url.searchParams.get('id'))
      if (!spotId(id)) throw new AdminError(404, '隔离景点不存在。')
      const record = await db.from('locations').select('id,updated_at').eq('id', id).maybeSingle()
      if (record.error || !record.data) throw new AdminError(404, '隔离景点不存在。')
      const bucket = db.storage.from(PRIVATE_BUCKET)
      const path = `_system/location-slugs/${id}.webp`
      if (body) {
        const slug = String(body.slug || '').trim().toLowerCase()
        if (slug && !validSlug(slug)) throw new AdminError(400, '自定义 slug 无效。')
        if (record.data.updated_at !== body.expectedUpdatedAt) throw new AdminError(409, '景点版本已变化。')
        const result = await bucket.upload(path, JSON.stringify({ slug, version: record.data.updated_at }), {
          upsert: true, contentType: 'image/webp', cacheControl: '0',
        })
        if (result.error) throw new AdminError(503, '景点已保存，slug 尚未确认。')
        return json({ slug })
      }
      const { data, error } = await bucket.download(path)
      if (!data && error && String((error as { status?: number }).status) !== '404') {
        const found = await bucket.list('_system/location-slugs', { search: `${id}.webp`, limit: 1 })
        if (found.error || found.data?.some(item => item.name === `${id}.webp`)) throw new AdminError(503, '无法读取 slug。')
      }
      return json({ slug: data ? JSON.parse(await data.text()).slug : '' })
    }
    const english = route.match(/^\/admin\/spot-localization\/(\d+)$/)
    if (english && ['GET', 'PUT'].includes(method)) {
      const id = Number(english[1])
      if (!spotId(id)) throw new AdminError(404, '隔离景点不存在。')
      const loadSpot = async () => {
        const result = await db.from('locations').select('id,name,description,review,address,created_at,updated_at').eq('id', id).maybeSingle()
        if (result.error || !result.data) throw new AdminError(404, '隔离景点不存在。')
        return result.data
      }
      type Translation = { record: LocalizationRecord, version: string, createdAt: string }
      const find = (records: Translation[], createdAt: string) =>
        records.find(item => item.record.entityId === String(id) && item.createdAt === createdAt)
      const revision = (version: string, sourceVersion: string | null) => `${version}:${sourceVersion ?? 'legacy'}`
      const view = (spot: Awaited<ReturnType<typeof loadSpot>>, records: Translation[]) => {
        const existing = find(records, spot.created_at)
        return {
          revision: revision(existing?.version || 'new', spot.updated_at),
          canonicalPath: '/spot/' + buildLocationSlug(spot.name, spot.id),
          record: existing?.record, status: applyLocalization(spot, existing?.record).status,
          source: spotTranslationSource(spot), revalidated: false,
        }
      }
      const spot = await loadSpot()
      if (method === 'GET') return json(view(spot, await store.read<Translation>('spot-english')))
      const body = await readBody(request)
      const records = await store.update<Translation>('spot-english', async current => {
        const latest = await loadSpot()
        const previous = find(current, latest.created_at)
        if (body.revision !== revision(previous?.version || 'new', latest.updated_at)) throw new NoteConflictError()
        const version = crypto.randomUUID()
        let translated
        try {
          translated = editSpotTranslation({ schemaVersion: 1, locale: 'en', version, records: previous ? [previous.record] : [] },
            latest, '/spot/' + buildLocationSlug(latest.name, id), body.fields, body.translationStatus, version)
        } catch { throw new AdminError(400, '英文草稿校验失败，请核对原文和译文。') }
        return [...current.filter(item => item.record.entityId !== String(id)),
          { record: translated.records[0], version, createdAt: latest.created_at }]
      })
      return json(view(await loadSpot(), records))
    }
    if (route.startsWith('/admin/guide-drafts/') && method === 'GET') {
      const slug = route.split('/').at(-1)
      const guide = (await store.read<{ slug: string }>('guides')).find(item => item.slug === slug)
      if (!guide) throw new AdminError(404, '找不到已保存的攻略草稿。')
      return json({ guide, priceCandidates: [] })
    }
    if (route === '/admin/locations') {
      const locations = () => db.from('locations')
      if (method === 'GET') {
        if (url.searchParams.get('resource') === 'affiliate-links') return json({ data: [], hasMore: false })
        const id = url.searchParams.get('id')
        const query = locations().select(SPOT_FIELDS.join(',') + ',regions:region_id(id,name,name_cn,country,parent_id)')
          .gte('id', FIRST_SPOT_ID).lte('id', LAST_SPOT_ID).order('id', { ascending: false })
        if (id !== null && !spotId(Number(id))) throw new AdminError(404, '隔离景点不存在。')
        const result = id === null ? await query : await query.eq('id', Number(id)).maybeSingle()
        if (result.error) throw new AdminError(503, '景点资料暂不可用。')
        if (id !== null && !result.data) throw new AdminError(404, '隔离景点不存在。')
        return json({ data: result.data, hasMore: false })
      }
      if (!['POST', 'PATCH', 'DELETE'].includes(method)) return json({ error: '不支持此操作。' }, 405)
      const body = await readBody(request)
      if (method !== 'POST' && (!spotId(body.id) || !validVersion(body.expectedUpdatedAt))) {
        throw new AdminError(400, '需要隔离景点 ID 和读到的版本。')
      }
      const expected = body.expectedUpdatedAt
      if (method === 'DELETE') {
        const query = locations().delete().eq('id', body.id)
        const result = await (expected === null ? query.is('updated_at', null) : query.eq('updated_at', expected)).select('id').maybeSingle()
        if (result.error) throw new AdminError(503, '无法删除景点。')
        if (!result.data) throw new AdminError(409, '景点版本已变化，请重新读取。')
        return json({ data: result.data, error: null })
      }
      try { validateSpotFields(body.data) } catch { throw new AdminError(400, '景点字段不符合现有数据规则。') }
      await media.verifyReferences(body.data)
      const timestamp = new Date(Math.max(Date.now(), (Date.parse(expected) || 0) + 1)).toISOString()
      const fields = { ...body.data, updated_at: timestamp }
      if (method === 'POST') {
        if (body.id != null || body.ids != null || !fields.name) throw new AdminError(400, '新增景点需要名称，ID 由服务端分配。')
        const last = await locations().select('id').gte('id', FIRST_SPOT_ID).lte('id', LAST_SPOT_ID)
          .order('id', { ascending: false }).limit(1).maybeSingle()
        if (last.error) throw new AdminError(503, '无法分配隔离景点 ID。')
        const id = Number(last.data?.id ?? FIRST_SPOT_ID - 1) + 1
        if (!spotId(id)) throw new AdminError(409, '隔离景点名额已满。')
        const result = await locations().insert({ ...fields, id, publication_status: fields.publication_status ?? 'draft' }).select('id,updated_at').single()
        if (result.error?.code === '23505') throw new AdminError(409, '并发新增冲突，请重新读取。')
        if (result.error) throw new AdminError(422, '景点未写入，请检查必填字段及关联。')
        return json({ data: result.data, error: null }, 201)
      }
      const query = locations().update(fields).eq('id', body.id)
      const result = await (expected === null ? query.is('updated_at', null) : query.eq('updated_at', expected)).select('id,updated_at').maybeSingle()
      if (result.error) throw new AdminError(422, '景点未写入，请检查必填字段及关联。')
      if (!result.data) throw new AdminError(409, '景点版本已变化，请重新读取。')
      return json({ data: result.data, error: null })
    }
    if (route === '/admin/notes' || route === '/admin/guides') {
      const isNote = route.endsWith('/notes')
      const collection = isNote ? 'notes' : 'guides'
      const singular = isNote ? 'note' : 'guide'
      if (method === 'GET') return json({ [collection]: await store.read(collection) })
      if (method === 'DELETE') {
        const slug = url.searchParams.get('slug') || ''
        if (!validSlug(slug)) throw new AdminError(400, '无效 slug。')
        await store.update<any>(collection, records => {
          const old = records.find(record => record.slug === slug)
          if (!old || old.updatedAt !== url.searchParams.get('expectedUpdatedAt')) throw new NoteConflictError()
          return records.filter(record => record !== old)
        })
        return json({ ok: true })
      }
      if (method !== 'POST') return json({ error: '不支持此操作。' }, 405)
      const raw = await readBody(request)
      if (raw.action) throw new AdminError(409, '此操作需要独立发布执行器。')
      let payload
      try {
        if (!isNote && countLegacyGuideLinkedSpots(raw)) throw new Error('Legacy linkedSpots')
        payload = isNote ? normalizeNotePayload(raw) : normalizeGuidePayload(raw, { enforceBudgetTotal: true })
      } catch { throw new AdminError(400, '内容未通过保存校验，请检查攻略行程与预算。') }
      if (!validSlug(payload.slug) || !payload.title || (payload.aliases || []).some(alias => !validSlug(alias))) {
        throw new AdminError(400, '标题、slug 或别名无效。')
      }
      await media.verifyReferences(payload)
      const previousSlug = String(raw.previousSlug || '')
      const rows = await store.update<any>(collection, existing => {
        if (isNote) return mergeNoteSave(existing, payload as ReturnType<typeof normalizeNotePayload>, previousSlug, raw.expectedUpdatedAt)
        // Preserve the Guide's own payload, legacy aliases and version contract.
        const matches = existing.filter(guide => [guide.slug, ...(guide.aliases || [])].some(slug => slug === payload.slug || slug === previousSlug))
        const old = matches[0]
        if (matches.length > 1 || Boolean(old) !== Boolean(previousSlug) ||
            (old && (old.slug !== previousSlug || old.updatedAt !== raw.expectedUpdatedAt))) throw new NoteConflictError()
        const updatedAt = new Date(Math.max(Date.now(), (Date.parse(old?.updatedAt) || 0) + 1)).toISOString()
        const saved = { ...payload, updatedAt, aliases: [...new Set([...(old?.aliases || []), ...(payload.aliases || []), ...(old ? [old.slug] : [])])].filter(slug => slug !== payload.slug) }
        return old ? existing.map(guide => guide === old ? saved : guide) : [saved, ...existing]
      })
      const saved = rows.find(row => row.slug === payload.slug)
      return json({ [singular]: saved, ...(raw.syncEnglish ? { englishWarning: '隔离后台未配置英文发布任务。' } : {}) })
    }
    return json({ error: '此功能尚未接入独立后台。' }, 501)
  } catch (error) {
    if (error instanceof AdminError) return json({ error: error.message }, error.status)
    if (error instanceof NoteConflictError) return json({ error: '云端已有较新版本，请保留编辑内容并重新读取。' }, 409)
    return json({ error: '隔离服务暂不可用，请检查保存状态后再试。' }, 503)
  }
})
