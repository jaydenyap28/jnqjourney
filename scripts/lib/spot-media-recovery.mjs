import { createHash } from 'node:crypto'

export const MEDIA_FIELDS = Object.freeze(['image_url', 'images', 'video_url', 'facebook_video_url'])
export const RECOVERY_SOURCE = 'supabase-authoritative-media-recovery'
export const MEDIA_SELECT = 'id,status,image_url,images,video_url,facebook_video_url'

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
  return value
}

export function semanticHash(value) { return sha256(JSON.stringify(stable(value))) }

// Only a known R2 host may ignore query/fragment metadata. External transformation
// URLs retain their complete identity; neither filenames nor image similarity count.
export function mediaIdentity(value) {
  const url = new URL(value)
  if (url.hostname.endsWith('.r2.dev')) return `r2:${url.hostname.toLowerCase()}${url.pathname}`
  return value
}

export function safeUniqueImages(values) {
  const seen = new Set()
  return values.filter(value => {
    const key = mediaIdentity(value)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function availability(status) {
  if (status === 429 || status == null) return 'unknown'
  return status === 200 ? 'available' : 'failed-response'
}

function media(row) {
  if (!Array.isArray(row.images) || row.images.some(value => typeof value !== 'string' || !value.trim())) {
    throw new Error('Authoritative images must be a complete string array; never infer it from thumbnail')
  }
  for (const field of MEDIA_FIELDS.filter(value => value !== 'images')) {
    if (!(field in row) || (row[field] !== null && typeof row[field] !== 'string')) throw new Error(`Missing or invalid media field: ${field}`)
  }
  for (const value of [row.image_url, ...row.images, row.video_url, row.facebook_video_url].filter(Boolean)) {
    if (!['https:', 'http:'].includes(new URL(value).protocol)) throw new Error('Unsupported public media URL')
  }
  return Object.fromEntries(MEDIA_FIELDS.map(field => [field, structuredClone(row[field])]))
}

export function nonMedia(spot) {
  return Object.fromEntries(Object.entries(spot).filter(([key]) => !MEDIA_FIELDS.includes(key)))
}

export function exactDiff(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
    .filter(key => JSON.stringify(stable(before[key])) !== JSON.stringify(stable(after[key])))
    .map(field => ({ field, before: before[field], after: after[field] }))
}

export function assertNoGenericSpotPublish(keys) {
  if (keys.some(key => key.startsWith('public-data/spots/'))) {
    throw new Error('Generic publisher cannot publish Spot detail/index. Use reviewed authoritative media recovery.')
  }
}

export function validateCandidate(current, authoritative, candidate) {
  if (current?.schemaVersion !== 1 || candidate?.schemaVersion !== 1 || !current.spot || !candidate.spot) throw new Error('Invalid Spot snapshot')
  if (authoritative.status !== 'active' || authoritative.id !== current.spot.id || candidate.spot.id !== current.spot.id) throw new Error('Spot identity/status mismatch')
  if (candidate.source?.type !== RECOVERY_SOURCE || candidate.source?.scope !== 'media-only') throw new Error('Full detail media publish rejects lightweight/unverified source')
  const expected = media(authoritative)
  const actual = media(candidate.spot)
  if (actual.images.length < expected.images.length) throw new Error('Gallery count regression')
  if (expected.images.some(url => !actual.images.includes(url))) throw new Error('Missing authoritative image URL')
  if (JSON.stringify(actual.images) !== JSON.stringify(expected.images)) throw new Error('Gallery order/content changed')
  for (const field of MEDIA_FIELDS.filter(value => value !== 'images')) {
    if (actual[field] !== expected[field]) throw new Error(`${field} must preserve authoritative value`)
  }
  const nonMediaDiff = exactDiff(nonMedia(current.spot), nonMedia(candidate.spot))
  if (nonMediaDiff.length) throw new Error(`Non-media semantic change blocked: ${nonMediaDiff.map(item => item.field).join(', ')}`)
  const envelope = value => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'source' && key !== 'spot'))
  if (semanticHash(envelope(current)) !== semanticHash(envelope(candidate))) throw new Error('Unexpected snapshot envelope change')
  if (candidate.source.authoritativeMediaSha256 !== semanticHash(expected)) throw new Error('Authoritative media provenance hash mismatch')
  return {
    mediaDiff: exactDiff(media(current.spot), actual), nonMediaDiff,
    nonMediaBeforeSha256: semanticHash(nonMedia(current.spot)),
    nonMediaAfterSha256: semanticHash(nonMedia(candidate.spot)),
    authoritativeMediaSha256: semanticHash(expected),
    galleryCount: actual.images.length,
    uniqueDisplayCount: safeUniqueImages([actual.image_url, ...actual.images].filter(Boolean)).length,
    // Keep authoritative array byte-for-byte, including reviewed existing duplicates.
    duplicateGalleryRefs: actual.images.length - safeUniqueImages(actual.images).length,
  }
}

export function buildMediaRecovery(current, authoritative, generatedAt) {
  const authoritativeMedia = media(authoritative)
  const candidate = {
    ...structuredClone(current),
    source: {
      type: RECOVERY_SOURCE, scope: 'media-only', generatedAt,
      authoritativeTable: 'locations', authoritativeSpotId: authoritative.id,
      authoritativeMediaSha256: semanticHash(authoritativeMedia),
      baseSnapshotSemanticSha256: semanticHash(current),
    },
    spot: { ...structuredClone(current.spot), ...authoritativeMedia },
  }
  return { candidate, validation: validateCandidate(current, authoritative, candidate) }
}

export function validate449Pilot(current, authoritative, candidate) {
  const validation = validateCandidate(current, authoritative, candidate)
  if (candidate.spot.id !== 449 || candidate.spot.slug !== 'spot-449' || !candidate.spot.image_url ||
      validation.galleryCount !== 6 || validation.uniqueDisplayCount !== 7) throw new Error('Spot 449 pilot requires independent cover + 6 gallery = 7 unique items')
  return validation
}
