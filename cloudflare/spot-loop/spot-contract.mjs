// Shared, runtime-independent contract for isolated compatibility fixtures.
// Formal RLS, publication projections and legacy assets require separate gates.
export const SPOT_FIELDS = [
  'id', 'name', 'name_cn', 'category', 'latitude', 'longitude', 'region_id',
  'description', 'review', 'review_jayden', 'review_qing', 'address',
  'google_maps_url', 'opening_hours', 'price_info', 'tags', 'visit_date',
  'is_visited', 'image_url', 'images', 'image_metadata', 'video_url',
  'facebook_video_url', 'related_note_slugs', 'status', 'publication_status',
  'seo_title_zh', 'seo_description_zh', 'seo_title_en', 'seo_description_en',
  'experience_zh', 'experience_en', 'updated_at', 'created_at',
  'redirect_url', 'redirect_type',
]
export const SPOT_STATUSES = ['active', 'inactive', 'temporarily_closed', 'permanently_closed', null]
export const PUBLICATION_STATUSES = ['published', 'draft', 'hidden', null]
const TEXT_FIELDS = new Set([
  'name', 'name_cn', 'category', 'description', 'review', 'review_jayden',
  'review_qing', 'address', 'google_maps_url', 'opening_hours', 'video_url',
  'facebook_video_url', 'seo_title_zh', 'seo_description_zh', 'seo_title_en',
  'seo_description_en', 'experience_zh', 'experience_en',
])
const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value)
export const validVersion = value => value === null || typeof value === 'string' && Number.isFinite(Date.parse(value))
export const publishedSpot = row => row.status === 'active' && (row.publication_status === null || row.publication_status === 'published')
export function validSpotRow(row, id) {
  return !!row && Number.isSafeInteger(Number(id)) && Number(id) > 0
    && (row.id === Number(id) || row.id === String(id))
    && Object.hasOwn(row, 'updated_at') && validVersion(row.updated_at)
    && SPOT_STATUSES.includes(row.status) && PUBLICATION_STATUSES.includes(row.publication_status)
}
export function validateSpotFields(data) {
  if (!isObject(data) || !Object.keys(data).length) throw new Error('Spot fields required')
  for (const [key, value] of Object.entries(data)) {
    let valid = false
    if (TEXT_FIELDS.has(key)) valid = value === null || typeof value === 'string' && value.length <= 20000
    else if (key === 'status') valid = SPOT_STATUSES.includes(value)
    else if (key === 'publication_status') valid = PUBLICATION_STATUSES.includes(value)
    else if (key === 'latitude') valid = typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 90
    else if (key === 'longitude') valid = typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 180
    else if (key === 'region_id') valid = value === null || Number.isSafeInteger(value) && value > 0
    else if (key === 'is_visited') valid = value === null || typeof value === 'boolean'
    else if (key === 'price_info') valid = value === null || isObject(value)
    else if (key === 'image_metadata') valid = value === null || isObject(value) && Object.keys(value).length <= 60 && Object.values(value).every(item =>
      isObject(item) && Object.entries(item).every(([field, text]) => ['alt_zh', 'alt_en', 'caption'].includes(field) && typeof text === 'string' && text.length <= 2000))
    else if (['images', 'tags', 'related_note_slugs'].includes(key)) valid = value === null || Array.isArray(value) && value.length <= 60 && value.every(item => typeof item === 'string' && item.length <= 2048)
    else if (key === 'image_url') valid = value === null || typeof value === 'string' && value.length <= 2048
    else if (key === 'redirect_type') valid = [301, 302, null].includes(value)
    else if (key === 'redirect_url') valid = value === null || value === '' || typeof value === 'string' && /^\/(?:en\/)?(?:spot|notes)\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
    else if (key === 'visit_date') valid = value === null || typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value).toISOString().slice(0, 10) === value
    if (!valid || key === 'name' && (typeof value !== 'string' || !value.trim())) throw new Error(`Invalid Spot field: ${key}`)
  }
  return data
}

// A production routing manifest must come from the authoritative slug/alias
// source. The fixture allowlist is only the isolated adapter's route boundary.
export async function resolveCandidateRedirect(id, read, checkTarget) {
  const seen = new Set()
  let currentId = String(id), destination = null, status = 301
  for (let depth = 0; depth < 16; depth++) {
    if (seen.has(currentId)) throw new Error('Redirect cycle refused')
    seen.add(currentId)
    const row = await read(currentId)
    if (!row) return {visible: false}
    if (!row.redirect_url) return {visible: publishedSpot(row), destination: publishedSpot(row) ? destination : null, status}
    const target = checkTarget(row.redirect_url)
    if (depth === 0) status = row.redirect_type === 302 ? 302 : 301
    destination = row.redirect_url
    if (target.kind === 'notes') return {visible: false, destination, status}
    currentId = target.id
  }
  throw new Error('Redirect chain exceeds 16 hops')
}
