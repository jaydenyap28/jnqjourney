export function slugifyRegionName(value: string) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function buildRegionSlug(name: string, id: number | string) {
  const base = slugifyRegionName(name) || 'region'
  return `${base}-${id}`
}

export function buildRegionPath(name: string, id: number | string) {
  return `/region/${buildRegionSlug(name, id)}`
}

export function extractRegionIdFromSlug(slug: string) {
  const match = String(slug || '').match(/-(\d+)$/)
  return match ? Number(match[1]) : null
}
