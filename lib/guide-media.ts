import type { GuideDayImage, TravelGuide } from '@/lib/guides'

export interface ResolvedGuideMedia {
  coverImage?: string
  images: GuideDayImage[]
}

function cleanValue(value?: string | null) {
  return String(value || '').trim()
}

export function normalizeGuideImageUrl(value?: string | null) {
  const raw = cleanValue(value)
  if (!raw) return ''

  try {
    const parsed = new URL(raw)
    parsed.protocol = parsed.protocol.toLowerCase()
    parsed.hostname = parsed.hostname.toLowerCase()
    parsed.hash = ''
    parsed.search = ''
    parsed.pathname = parsed.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '')
    return parsed.toString()
  } catch {
    return raw.split(/[?#]/, 1)[0].replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/\/$/, '').toLowerCase()
  }
}

function normalizeAssetId(value?: string | null) {
  return cleanValue(value).toLowerCase()
}

function assetIdFromUrl(value?: string | null) {
  const normalized = normalizeGuideImageUrl(value)
  const match = normalized.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  return match ? match[0].toLowerCase() : ''
}

function normalizeR2Key(value?: string | null) {
  return cleanValue(value).replace(/^\/+/, '').replace(/\\/g, '/').replace(/\/{2,}/g, '/').toLowerCase()
}

function r2KeyFromUrl(value?: string | null) {
  const raw = cleanValue(value)
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    const hostname = parsed.hostname.toLowerCase()
    if (hostname.endsWith('.r2.dev') || hostname.includes('r2.cloudflarestorage.com')) {
      return normalizeR2Key(parsed.pathname)
    }
  } catch {}
  return ''
}

function getGuideImageIdentity(image: GuideDayImage) {
  const keys = new Set<string>()
  const assetId = normalizeAssetId(image.assetId) || assetIdFromUrl(image.url)
  const r2Key = normalizeR2Key(image.r2Key) || r2KeyFromUrl(image.url)
  const url = normalizeGuideImageUrl(image.url)

  if (assetId) keys.add(`asset:${assetId}`)
  if (r2Key) keys.add(`r2:${r2Key}`)
  if (url) keys.add(`url:${url}`)
  return keys
}

export function areGuideImagesEquivalent(left: GuideDayImage, right: GuideDayImage) {
  const leftKeys = getGuideImageIdentity(left)
  const rightKeys = getGuideImageIdentity(right)
  for (const key of leftKeys) {
    if (rightKeys.has(key)) return true
  }
  return false
}

function uniqueGalleryImages(images: GuideDayImage[]) {
  const unique: GuideDayImage[] = []
  for (const image of images) {
    if (!cleanValue(image.url)) continue
    if (!unique.some((existing) => areGuideImagesEquivalent(existing, image))) unique.push(image)
  }
  return unique
}

/**
 * Resolves public Guide media without mutating the stored Guide or any Spot.
 * The current cover always leads the display list; gallery order otherwise stays intact.
 */
export function resolveGuideMedia(guide: Pick<TravelGuide, 'title' | 'coverImage' | 'days'>): ResolvedGuideMedia {
  const gallery = uniqueGalleryImages(
    guide.days.flatMap((day) => Array.isArray(day.gallery) ? day.gallery : [])
  )
  const coverUrl = cleanValue(guide.coverImage)

  if (!coverUrl) {
    return { coverImage: gallery[0]?.url, images: gallery }
  }

  const cover: GuideDayImage = {
    url: coverUrl,
    alt: `${cleanValue(guide.title) || 'Travel Guide'} cover image`,
  }
  const matchingGalleryImage = gallery.find((image) => areGuideImagesEquivalent(image, cover))
  const firstImage = matchingGalleryImage
    ? { ...matchingGalleryImage, url: coverUrl, alt: matchingGalleryImage.alt || cover.alt }
    : cover

  return {
    coverImage: firstImage.url,
    images: [firstImage, ...gallery.filter((image) => !areGuideImagesEquivalent(image, cover))],
  }
}
