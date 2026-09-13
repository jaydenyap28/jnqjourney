import type { PublicLocation, PublicRegion } from './public-data.ts'

/** Canonical locations.visit_date is a calendar date, never a modification timestamp. */
export function usableVisitDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null
}

export function hasShowcaseImage(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false
  try {
    const url = new URL(value, 'https://local.invalid')
    if (!['https:', 'http:'].includes(url.protocol)) return false
    const path = decodeURIComponent(url.pathname)
    return !/(?:placehold|fallback|blank|logo|no[-_]?image|default[-_]?image)/i.test(`${url.hostname}${path}`)
      && /\.(?:jpe?g|png|webp|avif)(?:$)/i.test(path)
  } catch { return false }
}

const compareSlug = (a: {slug:string}, b: {slug:string}) => a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0
export function compareLocationsByVisitDate(left: PublicLocation, right: PublicLocation) {
  const a = usableVisitDate(left.visitDate) || ''
  const b = usableVisitDate(right.visitDate) || ''
  return (a < b ? 1 : a > b ? -1 : 0) || compareSlug(left, right)
}

export interface RegionHighlight {
  id: number
  slug: string
  name: string
  country: string | null
  count: number
  coverImage: string
  sampleText?: string
  visitDate: string
}

export function homepageShowcase(locations: PublicLocation[], regions: PublicRegion[], failedImages: ReadonlySet<string> = new Set()) {
  const usableImage = (image: unknown): image is string => hasShowcaseImage(image) && !failedImages.has(image)
  const spots = locations.filter(spot => usableVisitDate(spot.visitDate) && usableImage(spot.thumbnail)).sort(compareLocationsByVisitDate)
  const records = new Map(regions.map(region => [region.id, region]))
  const highlights = new Map<number, RegionHighlight>()
  for (const spot of spots) {
    const region = spot.region && records.get(spot.region.id)
    if (!region || !usableImage(region.thumbnail)) continue
    const existing = highlights.get(region.id)
    if (existing) { existing.count += 1; continue }
    highlights.set(region.id, {id:region.id,slug:region.slug,name:region.name,country:region.country,count:1,
      coverImage:region.thumbnail,sampleText:region.shortSummary || undefined,visitDate:spot.visitDate!})
  }
  const ordered = [...highlights.values()].sort((a,b)=>(a.visitDate < b.visitDate ? 1 : a.visitDate > b.visitDate ? -1 : 0) || compareSlug(a,b))
  return {latest:spots.slice(0,8),malaysia:ordered.filter(r=>r.country==='Malaysia'),global:ordered.filter(r=>r.country!=='Malaysia')}
}
