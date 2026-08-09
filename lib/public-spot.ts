import type { PublicLocation, PublicLocationRegion } from '@/lib/public-data'

export interface PublicSpotRecord {
  id: number
  slug: string
  name: string
  name_cn?: string | null
  category?: string | null
  latitude: number
  longitude: number
  image_url?: string | null
  images?: string[] | null
  description?: string | null
  review?: string | null
  tags?: string[] | null
  video_url?: string | null
  facebook_video_url?: string | null
  visit_date?: string | null
  opening_hours?: string | null
  price_info?: unknown
  address?: string | null
  region_id?: number | null
  regions?: PublicSpotRegion | null
}

export interface PublicSpotRegion {
  id: number
  name: string
  name_cn?: string | null
  country?: string | null
  description?: string | null
  image_url?: string | null
  parent_id?: number | null
  code?: string | null
}

export interface PublicSpotSnapshot {
  schemaVersion: 1
  source?: { type?: string; generatedAt?: string }
  spot: PublicSpotRecord
}

export interface PublicSpotIndexSnapshot {
  schemaVersion: 1
  source?: { type?: string; generatedAt?: string }
  slugs: string[]
}

export type PublicSpotSource = 'cdn-cache' | 'supabase' | 'static-fallback'
export type PublicSpotLookup =
  | { status: 'found'; spot: PublicSpotRecord }
  | { status: 'not-found'; authoritative?: boolean }
  | { status: 'failure'; error?: unknown }

export type PublicSpotResolution =
  | { status: 'found'; spot: PublicSpotRecord; source: PublicSpotSource }
  | { status: 'not-found' }
  | { status: 'unavailable'; error?: unknown }

function splitDisplayName(value: unknown) {
  const display = String(value || '').trim()
  const parts = display.split(' / ').map((part) => part.trim()).filter(Boolean)
  if (parts.length < 2) return { name: display, nameCn: null }
  const firstHasHan = /[\u3400-\u9fff]/u.test(parts[0])
  return firstHasHan
    ? { name: parts.slice(1).join(' / '), nameCn: parts[0] }
    : { name: parts[0], nameCn: parts.slice(1).join(' / ') }
}

function regionFromSummary(region: PublicLocationRegion | null): PublicSpotRegion | null {
  if (!region) return null
  const names = splitDisplayName(region.name)
  return {
    id: region.id,
    name: names.name,
    name_cn: names.nameCn,
    country: region.country,
    code: region.code,
  }
}

export function publicSpotFromLocationSummary(location: PublicLocation): PublicSpotRecord {
  const names = splitDisplayName(location.name)
  return {
    id: location.id,
    slug: location.slug,
    name: names.name,
    name_cn: names.nameCn,
    category: location.category,
    latitude: location.latitude,
    longitude: location.longitude,
    image_url: location.thumbnail,
    images: location.thumbnail ? [location.thumbnail] : [],
    description: location.shortSummary,
    review: null,
    tags: [],
    video_url: null,
    facebook_video_url: null,
    visit_date: null,
    opening_hours: null,
    price_info: null,
    address: null,
    region_id: location.region?.id ?? null,
    regions: regionFromSummary(location.region),
  }
}

export function publicSpotFromSupabaseRow(
  row: Record<string, any>,
  location: PublicLocation,
  regionRow?: Record<string, any> | null
): PublicSpotRecord {
  return {
    id: Number(row.id),
    slug: location.slug,
    name: String(row.name || '').trim(),
    name_cn: String(row.name_cn || '').trim() || null,
    category: row.category || null,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    image_url: String(row.image_url || '').trim() || null,
    images: Array.isArray(row.images) ? row.images.map((value: unknown) => String(value || '').trim()).filter(Boolean) : [],
    description: String(row.description || '').trim() || null,
    review: String(row.review || '').trim() || null,
    tags: Array.isArray(row.tags) ? row.tags.map((value: unknown) => String(value || '').trim()).filter(Boolean) : [],
    video_url: String(row.video_url || '').trim() || null,
    facebook_video_url: String(row.facebook_video_url || '').trim() || null,
    visit_date: String(row.visit_date || '').trim() || null,
    opening_hours: typeof row.opening_hours === 'string' ? row.opening_hours : row.opening_hours ? JSON.stringify(row.opening_hours) : null,
    price_info: row.price_info ?? null,
    address: String(row.address || '').trim() || null,
    region_id: row.region_id == null ? null : Number(row.region_id),
    regions: regionRow ? {
      id: Number(regionRow.id),
      name: String(regionRow.name || '').trim(),
      name_cn: String(regionRow.name_cn || '').trim() || null,
      country: String(regionRow.country || '').trim() || null,
      description: String(regionRow.description || '').trim() || null,
      image_url: String(regionRow.image_url || '').trim() || null,
      parent_id: regionRow.parent_id == null ? null : Number(regionRow.parent_id),
      code: String(regionRow.code || '').trim() || null,
    } : regionFromSummary(location.region),
  }
}

export async function resolvePublicSpotSources(
  sources: {
    cdn: () => Promise<PublicSpotLookup>
    supabase: () => Promise<PublicSpotLookup>
    fallback: () => Promise<PublicSpotLookup>
  }
): Promise<PublicSpotResolution> {
  try {
    const cdn = await sources.cdn()
    if (cdn.status === 'found') return { ...cdn, source: 'cdn-cache' }
  } catch {}

  let supabase: PublicSpotLookup
  try {
    supabase = await sources.supabase()
  } catch (error) {
    supabase = { status: 'failure', error }
  }
  if (supabase.status === 'found') return { ...supabase, source: 'supabase' }

  try {
    const fallback = await sources.fallback()
    if (fallback.status === 'found') return { ...fallback, source: 'static-fallback' }
    if (fallback.status === 'not-found' && fallback.authoritative) return { status: 'not-found' }
  } catch (error) {
    if (supabase.status === 'failure') return { status: 'unavailable', error: supabase.error || error }
  }

  if (supabase.status === 'not-found') return { status: 'not-found' }
  return { status: 'unavailable', error: supabase.status === 'failure' ? supabase.error : undefined }
}
