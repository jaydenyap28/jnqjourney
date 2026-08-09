import { createClient } from '@supabase/supabase-js'
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { extractLocationIdFromSlug } from '@/lib/location-routing'
import { extractRegionIdFromSlug } from '@/lib/region-routing'
import { resolvePublicData } from '@/lib/server/public-data-resolver'

export interface LocationSummary {
  id: number
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

function createPublicSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase public environment variables')
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  })
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
  const locationId = extractLocationIdFromSlug(slug)
  if (!locationId) return null

  const supabase = createPublicSupabaseClient()
  const { data, error } = await supabase
    .from('locations')
    .select(`
      id,name,name_cn,category,latitude,longitude,image_url,images,description,review,tags,
      video_url,facebook_video_url,visit_date,opening_hours,price_info,address,region_id,
      regions:region_id (
        id,
        name,
        name_cn,
        country,
        description,
        image_url
      )
    `)
    .eq('id', locationId)
    .eq('status', 'active')
    .single()

  if (error || !data) return null
  return data as unknown as PublicLocationRecord
})

export async function fetchRelatedLocations(location: PublicLocationRecord, limit = 6) {
  if (!location.region_id) return []

  const supabase = createPublicSupabaseClient()
  const { data, error } = await supabase
    .from('locations')
    .select(`
      id,
      name,
      name_cn,
      category,
      latitude,
      longitude,
      image_url,
      images,
      description,
      review,
      tags
    `)
    .neq('id', location.id)
    .eq('region_id', location.region_id)
    .eq('status', 'active')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .limit(24)

  if (error || !data) return []

  const sameRegion = (data as LocationSummary[])
    .filter((item) => Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)))
    .map((item) => ({
      ...item,
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
  const { locations } = await resolvePublicData()
  return locations.map((location) => ({ id: location.id, name: location.name, updated_at: undefined as string | undefined }))
}

export async function fetchAllRegionsForSitemap() {
  const { regions } = await resolvePublicData()
  return regions.filter((region) => !region.parentId).map((region) => ({ id: region.id, name: region.name, updated_at: undefined as string | undefined, parent_id: region.parentId }))
}


