import { uniquePublicImages } from './public-media.ts'

interface SpotMediaSource {
  image_url?: string | null
  images?: unknown
}

function normalizeImageList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean)
  }

  const text = String(value || '').trim()
  if (!text) return []

  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item || '').trim()).filter(Boolean)
    }
  } catch {
    // Fall through to delimiter parsing.
  }

  return text
    .split(/\s*(?:\||,|\n)\s*/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function resolveSpotDisplayImages(location: SpotMediaSource) {
  const candidates = [String(location.image_url || '').trim(), ...normalizeImageList(location.images)].filter(Boolean)
  return uniquePublicImages(candidates)
}
