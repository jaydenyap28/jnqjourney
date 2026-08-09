export interface PublicRegion {
  id: number
  slug: string
  name: string
  country: string | null
  thumbnail: string | null
  shortSummary: string | null
  parentId: number | null
  code: string | null
}

export interface PublicLocationRegion {
  id: number
  slug: string
  name: string
  country: string | null
  code: string | null
}

export interface PublicLocation {
  id: number
  slug: string
  name: string
  region: PublicLocationRegion | null
  category: string | null
  latitude: number
  longitude: number
  thumbnail: string | null
  shortSummary: string | null
}

export interface PublicLocationsPayload {
  schemaVersion: 1
  source?: { type?: string; generatedAt?: string }
  locations: PublicLocation[]
}

export interface PublicRegionsPayload {
  schemaVersion: 1
  source?: { type?: string; generatedAt?: string }
  regions: PublicRegion[]
}

export type PublicDataSource = 'cdn-cache' | 'supabase' | 'static-fallback'

export interface ResolvedPublicData {
  locations: PublicLocation[]
  regions: PublicRegion[]
  source: PublicDataSource
}

export const PUBLIC_CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=86400'
export const PRIVATE_NO_STORE = 'private, no-store, max-age=0'

export function hasValidCoordinates(value: { latitude?: unknown; longitude?: unknown }) {
  const latitude = Number(value.latitude)
  const longitude = Number(value.longitude)
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
}

export async function resolvePublicDataSources(sources: {
  cdn: () => Promise<Omit<ResolvedPublicData, 'source'> | null>
  supabase: () => Promise<Omit<ResolvedPublicData, 'source'> | null>
  fallback: () => Promise<Omit<ResolvedPublicData, 'source'>>
}): Promise<ResolvedPublicData> {
  try {
    const cdn = await sources.cdn()
    if (cdn) return { ...cdn, source: 'cdn-cache' }
  } catch {}
  try {
    const supabase = await sources.supabase()
    if (supabase) return { ...supabase, source: 'supabase' }
  } catch {}
  const fallback = await sources.fallback()
  return { ...fallback, source: 'static-fallback' }
}

export function createRequestDeduper<T>(loader: () => Promise<T>) {
  let inFlight: Promise<T> | null = null
  return () => {
    if (!inFlight) inFlight = loader().finally(() => { inFlight = null })
    return inFlight
  }
}
