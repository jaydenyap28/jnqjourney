import { FIRST_SPOT_ID, LAST_SPOT_ID, MEDIA_NAME, MEDIA_PREFIX, PRIVATE_BUCKET } from './scope.mjs'

export const RELEASE_PROJECT = 'jnqjourney-publish-isolated'
export const ROOT = '_publication'
export const revisionPattern = /^[a-f0-9]{64}$/
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const kindOrder = ['spot', 'note', 'guide']
const options = { contentType: 'application/json', cacheControl: '0' }

export class PublicationError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export async function sha256(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('')
}

export function publicationStore(db, bucketName = PRIVATE_BUCKET, maxBytes = 4 * 1024 * 1024) {
  if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(bucketName) || bucketName === 'location-images' ||
      !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 16 * 1024 * 1024) throw new PublicationError(503, '私有发布存储范围无效。')
  const bucket = db.storage.from(bucketName)
  const unwrap = result => {
    if (result.error) throw new PublicationError(503, '隔离发布存储暂不可用。')
    return result.data
  }
  const read = async name => {
    const result = await bucket.download(name)
    if (result.error) {
      if (String(result.error.statusCode ?? result.error.status) === '404' || /^(Object not found|not_found)$/i.test(result.error.message)) return null
      // Storage SDK versions can wrap a binary-download HTTP error
      // differently. Resolve absence through the private object index.
      const split = name.lastIndexOf('/')
      const file = name.slice(split + 1)
      const listed = await bucket.list(name.slice(0, split), { search: file, limit: 20 })
      if (!listed.error && Array.isArray(listed.data) && listed.data.length < 20 && !listed.data.some(row => row.name === file)) return null
      throw new PublicationError(503, '隔离发布存储读取失败。')
    }
    if (!result.data || result.data.size > maxBytes) throw new PublicationError(503, '隔离发布文件无效。')
    return JSON.parse(await result.data.text())
  }
  const write = async (name, value, upsert = true) =>
    unwrap(await bucket.upload(name, JSON.stringify(value), { ...options, upsert }))
  async function latest() {
    const files = unwrap(await bucket.list(ROOT + '/jobs', {
      limit: 1, sortBy: { column: 'created_at', order: 'desc' },
    }))
    if (!files?.length) return null
    const file = files[0].name
    if (!revisionPattern.test(file.replace(/\.json$/, ''))) throw new PublicationError(503, '发布队列文件无效。')
    const job = await read(ROOT + '/jobs/' + file)
    if (!job || job.id + '.json' !== file) throw new PublicationError(503, '发布任务不可读取。')
    return job
  }
  const job = id => read(`${ROOT}/jobs/${id}.json`)
  const progress = id => read(`${ROOT}/progress/${id}.json`)
  const retry = (id, attempt) => read(`${ROOT}/retry/${id}/${attempt}.json`)
  async function createOnce(name, value) {
    const result = await bucket.upload(name, JSON.stringify(value), { ...options, upsert: false })
    if (result.error) {
      // Reconcile the create-only write, including duplicate browser clicks.
      const existing = await read(name)
      if (!existing) throw new PublicationError(503, '发布申请保存结果未确认，请刷新状态。')
      return existing
    }
    return value
  }
  return { read, write, latest, job, progress, retry, createOnce }
}

const cleanText = (value, size = 20000) => typeof value === 'string' ? value.trim().slice(0, size) : ''
const mediaName = raw => {
  if (!raw) return null
  if (typeof raw !== 'string' || !raw.startsWith(MEDIA_PREFIX)) throw new PublicationError(422, '仅可发布已上传到隔离后台的图片。')
  const name = raw.slice(MEDIA_PREFIX.length).split('#', 1)[0]
  if (!MEDIA_NAME.test(name)) throw new PublicationError(422, '图片标识无效。')
  return name
}
const images = (values, selector = value => value) =>
  Array.isArray(values) ? [...new Set(values.map(selector).filter(Boolean).map(mediaName))] : []

export function catalog(sources) {
  const rows = {
    spot: sources.spots.map(row => ({
      key: String(row.id), title: row.name_cn || row.name, version: row.updated_at,
      status: row.status === 'active' ? row.publication_status || 'draft' : 'hidden',
      eligible: row.status === 'active' && row.publication_status === 'published' && !row.redirect_url,
    })),
    note: sources.notes.map(row => ({
      key: row.slug, title: row.title, version: row.updatedAt,
      status: row.published === true ? 'published' : 'draft', eligible: row.published === true,
    })),
    guide: sources.guides.map(row => ({
      key: row.slug, title: row.title, version: row.updatedAt,
      status: 'approval-required', eligible: true,
    })),
  }
  return kindOrder.flatMap(kind => rows[kind].map(row => ({
    kind, ...row, eligible: Boolean(row.eligible && row.version && row.title),
  })))
}

export async function authority(db, store) {
  const result = await db.from('locations').select(
    'id,name,name_cn,description,category,address,latitude,longitude,image_url,images,status,publication_status,updated_at,redirect_url,seo_title_zh,seo_description_zh',
  ).gte('id', FIRST_SPOT_ID).lte('id', LAST_SPOT_ID).order('id')
  if (result.error) throw new PublicationError(503, '景点权威数据暂不可读。')
  const [notes, guides] = await Promise.all([store.read('notes'), store.read('guides')])
  return { spots: result.data, notes, guides }
}

function routeSlug(value) {
  if (typeof value !== 'string' || value.length > 120 || !slug.test(value)) {
    throw new PublicationError(422, '公开路径不符合现有 slug 规范。')
  }
  return value
}

export function projectPublication(sources, selection) {
  if (!Array.isArray(selection) || selection.length > 100) throw new PublicationError(400, '请选择有效的发布范围。')
  const available = new Map(catalog(sources).map(item => [item.kind + ':' + item.key, item]))
  const selected = new Map()
  for (const item of selection) {
    if (!item || !kindOrder.includes(item.kind) || typeof item.key !== 'string' || typeof item.version !== 'string') {
      throw new PublicationError(400, '发布选择缺少修订号。')
    }
    const key = item.kind + ':' + item.key
    const saved = available.get(key)
    if (!saved || !saved.eligible || saved.version !== item.version) {
      throw new PublicationError(409, '内容已修改或撤销，请重新读取并确认发布。')
    }
    if (selected.has(key)) throw new PublicationError(400, '同一内容不能重复选择。')
    selected.set(key, { kind: item.kind, key: item.key, version: item.version, status: 'published' })
  }
  const approvals = [...selected.values()].sort((a, b) => (a.kind + ':' + a.key).localeCompare(b.kind + ':' + b.key))
  const approvedSpot = id => selected.has('spot:' + id)
  const records = approvals.map(({ kind, key, version, status }) => {
    if (kind === 'spot') {
      const row = sources.spots.find(value => String(value.id) === key)
      const base = cleanText(row.name).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80).replace(/-$/, '')
      return { kind, key, version, status, slug: routeSlug((base || 'spot') + '-' + key),
        title: cleanText(row.name_cn || row.name, 300), summary: cleanText(row.description),
        seoTitle: cleanText(row.seo_title_zh, 300), seoDescription: cleanText(row.seo_description_zh, 400),
        cover: mediaName(row.image_url), images: images(row.images),
        category: cleanText(row.category, 60), address: cleanText(row.address, 400),
        latitude: row.latitude, longitude: row.longitude }
    }
    if (kind === 'note') {
      const row = sources.notes.find(value => value.slug === key)
      return { kind, key, version, status, slug: routeSlug(key), title: cleanText(row.title, 300),
        summary: cleanText(row.summary), cover: mediaName(row.coverImage), images: [],
        blocks: (row.blocks || []).filter(block => !block.spotId || approvedSpot(block.spotId)).map(block => ({
          type: cleanText(block.type, 30), title: cleanText(block.title, 300),
          content: cleanText(block.content), image: mediaName(block.imageUrl),
          images: images(block.images, value => value.src),
          spotId: approvedSpot(block.spotId) ? block.spotId : null,
        })),
      }
    }
    const row = sources.guides.find(value => value.slug === key)
    const itinerary = row.itineraryMode === 'segment'
      ? (row.itinerarySegments || []).flatMap(segment => segment.verifiedRoutes || [])
      : row.days || []
    return { kind, key, version, status, slug: routeSlug(key), title: cleanText(row.title, 300),
      summary: cleanText(row.summary), cover: mediaName(row.coverImage), images: [],
      budget: cleanText(row.budget, 100), duration: cleanText(row.duration, 100),
      days: itinerary.map(day => ({
        title: cleanText(day.title, 300), summary: cleanText(day.summary),
        images: images(day.gallery, value => value.url),
        spotIds: (day.attractions || []).filter(item => item.enabled !== false && approvedSpot(item.spotId)).map(item => item.spotId),
      })),
    }
  })
  const names = new Set()
  for (const row of records) {
    for (const name of [row.cover, ...row.images]) if (name) names.add(name)
    for (const block of row.blocks || []) for (const name of [block.image, ...block.images]) if (name) names.add(name)
    for (const day of row.days || []) for (const name of day.images) names.add(name)
  }
  if (names.size > 60) throw new PublicationError(422, '此隔离发布最多包含 60 张图片。')
  return { schemaVersion: 1, approvals, records, media: [...names].sort() }
}

export async function makeJob(sources, selection) {
  const projection = projectPublication(sources, selection)
  const id = await sha256(JSON.stringify(projection))
  return { id, requestedAt: new Date().toISOString(), projection }
}

export async function jobState(queue, job) {
  if (!job) return null
  const result = await queue.progress(job.id)
  const attempt = result?.attempt || 1
  if (result?.state === 'failed' && await queue.retry(job.id, attempt + 1)) {
    return { state: 'queued', attempt: attempt + 1 }
  }
  return result ?? { state: 'queued', attempt }
}
