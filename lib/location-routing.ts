export function slugifyLocationName(value: string) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

export function buildLocationSlug(name: string, id: number | string) {
  const base = slugifyLocationName(name) || 'location'
  return `${base}-${id}`
}

export function buildLocationPath(name: string, id: number | string) {
  return `/spot/${buildLocationSlug(name, id)}`
}

export function extractLocationIdFromSlug(slug: string) {
  const match = String(slug || '').match(/-(\d+)$/)
  return match ? Number(match[1]) : null
}
