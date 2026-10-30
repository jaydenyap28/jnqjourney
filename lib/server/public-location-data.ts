import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { supabaseReadKey } from './supabase-read-key'
import { evaluateSpotQuality } from '@/lib/spot-quality'
import { isSpotPublished } from '@/lib/spot-content'
import { extractRegionIdFromSlug } from '@/lib/region-routing'
import { resolvePublicData } from '@/lib/server/public-data-resolver'
import { getPublicSpotBySlug } from '@/lib/server/public-spot-resolver'
import type { PublicLocation } from '@/lib/public-data'

export interface LocationSummary {
  id: number
  slug?: string
  region?: PublicLocation['region']
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
}

export interface RegionRecord {
  id: number
  name: string
  name_cn?: string | null
  country?: string | null
  description?: string | null
  image_url?: string | null
  parent_id?: number | null
}

export interface PublicLocationRecord extends LocationSummary {
  video_url?: string | null
  facebook_video_url?: string | null
  visit_date?: string | null
  opening_hours?: string | null
  price_info?: unknown
  address?: string | null
  region_id?: number | null
  regions?: RegionRecord | null
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180
  const earthRadiusKm = 6371
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a))
}

export const fetchLocationBySlug = cache(async (slug: string) => {
  const result = await getPublicSpotBySlug(slug)
  return result ? result.spot as PublicLocationRecord : null
})

export async function fetchRelatedLocations(location: PublicLocationRecord, limit = 6) {
  if (!location.region_id) return []
  const { locations } = await resolvePublicData()
  const sameRegion = locations
    .filter((item) => item.id !== location.id && item.region?.id === location.region_id)
    .map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      latitude: item.latitude,
      longitude: item.longitude,
      image_url: item.thumbnail,
      images: item.thumbnail ? [item.thumbnail] : [],
      description: item.shortSummary,
      review: null,
      tags: [],
      distanceKm: haversineKm(location.latitude, location.longitude, item.latitude, item.longitude),
    }))
    .sort((left, right) => left.distanceKm - right.distanceKm)

  const nearbySameRegion = sameRegion.filter((item) => item.distanceKm <= 80)
  return (nearbySameRegion.length ? nearbySameRegion : sameRegion).slice(0, limit)
}

export async function fetchRegionBySlug(slug: string) {
  const regionId = extractRegionIdFromSlug(slug)
  const { regions } = await resolvePublicData()
  const region = regions.find((item) => regionId ? item.id === regionId : item.slug === String(slug || '').trim())
  if (!region) return null
  return {
    id: region.id,
    name: region.name,
    country: region.country,
    description: region.shortSummary,
    image_url: region.thumbnail,
    parent_id: region.parentId,
  } as RegionRecord
}

export async function fetchLocationsByRegion(regionId: number, limit = 60) {
  const { locations, regions } = await resolvePublicData()
  const regionIds = new Set<number>([regionId])
  const queue = [regionId]
  const allRegions = regions

  while (queue.length) {
    const current = queue.shift()
    if (!current) continue
    for (const region of allRegions) {
      if (region.parentId === current && !regionIds.has(region.id)) {
        regionIds.add(region.id)
        queue.push(region.id)
      }
    }
  }

  return locations
    .filter((location) => location.region?.id && regionIds.has(location.region.id))
    .slice(0, limit)
    .map((location) => ({
      id: location.id,
      slug: location.slug,
      region: location.region,
      name: location.name,
      category: location.category,
      latitude: location.latitude,
      longitude: location.longitude,
      image_url: location.thumbnail,
      description: location.shortSummary,
    })) as LocationSummary[]
}

export const fetchTopRegions = unstable_cache(
  async (limit = 80) => {
    const { regions } = await resolvePublicData()
    const rows = regions.map((region) => ({
      id: region.id,
      name: region.name,
      country: region.country,
      description: region.shortSummary,
      image_url: region.thumbnail,
      parent_id: region.parentId,
    })) as Array<RegionRecord & { parent_id?: number | null }>
    const parentIds = new Set(
      rows
        .map((region) => region.parent_id)
        .filter((value): value is number => typeof value === 'number')
    )
    return rows.filter((region) => !parentIds.has(region.id)).slice(0, limit)
  },
  ['top-regions'],
  { revalidate: 3600, tags: ['regions'] }
)

export async function fetchAllLocationsForSitemap() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = supabaseReadKey(true)
  if (!url || !key) throw new Error('Sitemap quality inventory is unavailable.')
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  })
  // Restore the deployed editorial gate with one inventory read. Lightweight
  // card excerpts cannot establish indexing eligibility for full Spot pages.
  const [result, { locations }] = await Promise.all([
    supabase.from('locations')
      .select('id,name,description,review,image_url,images,experience_zh,visit_date,video_url,facebook_video_url,address,opening_hours,price_info,related_note_slugs,updated_at,publication_status,status')
      .eq('status', 'active').abortSignal(AbortSignal.timeout(4000)),
    resolvePublicData(),
  ])
  if (result.error || !Array.isArray(result.data)) throw new Error('Sitemap quality inventory is unavailable.')
  const byId = new Map(locations.map(location => [location.id, location]))
  return result.data.filter(location => isSpotPublished(location) && evaluateSpotQuality(location).indexable)
    .map(location => ({ id: Number(location.id), name: String(location.name || ''), slug: byId.get(Number(location.id))?.slug, updated_at: location.updated_at || undefined }))
}

export async function fetchAllRegionsForSitemap() {
  const { regions } = await resolvePublicData()
  return regions.filter((region) => !region.parentId).map((region) => ({ id: region.id, name: region.name, updated_at: undefined as string | undefined, parent_id: region.parentId }))
}


