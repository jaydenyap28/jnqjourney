const INTERNAL_TAGS = new Set([
  'featured-home',
  'homepage-featured',
  'featured',
  'manual-map-import',
  'youtube-import',
])

export function isInternalLocationTag(tag?: string | null) {
  return INTERNAL_TAGS.has(String(tag || '').trim().toLowerCase())
}

export function getVisibleLocationTags(tags?: string[] | null) {
  return (Array.isArray(tags) ? tags : []).filter((tag) => {
    const value = String(tag || '').trim()
    return value && !isInternalLocationTag(value)
  })
}
