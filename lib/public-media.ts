export type PublicImageValue = string | null | undefined

function cleanImageUrl(value: PublicImageValue) {
  return String(value || '').trim()
}

export function publicImageIdentity(value: PublicImageValue) {
  const raw = cleanImageUrl(value)
  if (!raw) return ''

  try {
    const url = new URL(raw)
    return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/{2,}/g, '/')}`
  } catch {
    return raw.split(/[?#]/, 1)[0].replace(/\\/g, '/').toLowerCase()
  }
}

export function isR2PublicImage(value: PublicImageValue) {
  const raw = cleanImageUrl(value)
  if (!raw) return false
  try {
    const host = new URL(raw).hostname.toLowerCase()
    return host.endsWith('.r2.dev') || host.includes('r2.cloudflarestorage.com')
  } catch {
    return false
  }
}

export function uniquePublicImages(values: PublicImageValue[]) {
  const seen = new Set<string>()
  const images: string[] = []
  for (const value of values) {
    const url = cleanImageUrl(value)
    const identity = publicImageIdentity(url)
    if (!url || !identity || seen.has(identity)) continue
    seen.add(identity)
    images.push(url)
  }
  return images
}

interface ResolvePublicImageOptions {
  cover?: PublicImageValue
  images?: PublicImageValue[]
  gallery?: PublicImageValue[]
  legacy?: PublicImageValue[]
  fallback?: PublicImageValue
  preferR2?: boolean
}

/** Shared public image priority. Stored records are never mutated. */
export function resolvePublicImage({
  cover,
  images = [],
  gallery = [],
  legacy = [],
  fallback,
  preferR2 = false,
}: ResolvePublicImageOptions) {
  const candidates = uniquePublicImages([cover, ...images, ...gallery, ...legacy, fallback])
  if (!preferR2) return candidates[0] || ''
  return candidates.find(isR2PublicImage) || candidates[0] || ''
}
