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

function imageIdentity(value?: string | null) {
  const text = String(value || '').trim()
  if (!text) return ''

  try {
    const url = new URL(text)
    return `${url.hostname.toLowerCase()}${url.pathname}`
  } catch {
    return text.split('#')[0].trim()
  }
}

export function resolveSpotDisplayImages(location: SpotMediaSource) {
  const candidates = [String(location.image_url || '').trim(), ...normalizeImageList(location.images)].filter(Boolean)
  const seen = new Set<string>()

  return candidates.filter((imageUrl) => {
    const identity = imageIdentity(imageUrl)
    if (!identity || seen.has(identity)) return false
    seen.add(identity)
    return true
  })
}
