import { createClient } from '@supabase/supabase-js'
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { extractLocationIdFromSlug } from '@/lib/location-routing'
import { extractRegionIdFromSlug } from '@/lib/region-routing'

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

export async function fetchLocationBySlug(slug: string) {
  const locationId = extractLocationIdFromSlug(slug)
  if (!locationId) return null

  const supabase = createPublicSupabaseClient()
  const { data, error } = await supabase
    .from('locations')
    .select(`
      *,
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
    .single()

  if (error || !data) return null
  return data as PublicLocationRecord
}

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
    .limit(24)

  if (error || !data) return []

  const sameRegion = (data as LocationSummary[])
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
  if (!regionId) return null

  const supabase = createPublicSupabaseClient()
  const { data, error } = await supabase
    .from('regions')
    .select('id,name,name_cn,country,description,image_url,parent_id')
    .eq('id', regionId)
    .single()

  if (error || !data) return null
  return data as RegionRecord
}

export async function fetchLocationsByRegion(regionId: number, limit = 60) {
  const supabase = createPublicSupabaseClient()
  const { data: regionRows } = await supabase
    .from('regions')
    .select('id,parent_id')
    .order('id', { ascending: true })

  const regionIds = new Set<number>([regionId])
  const queue = [regionId]
  const allRegions = (regionRows || []) as Array<{ id: number; parent_id?: number | null }>

  while (queue.length) {
    const current = queue.shift()
    if (!current) continue
    for (const region of allRegions) {
      if (region.parent_id === current && !regionIds.has(region.id)) {
        regionIds.add(region.id)
        queue.push(region.id)
      }
    }
  }

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
      tags,
      visit_date
    `)
    .in('region_id', [...regionIds])
    .order('id', { ascending: false })
    .limit(limit)

  if (error || !data) return []
  return data as LocationSummary[]
}

export const fetchTopRegions = unstable_cache(
  async (limit = 80) => {
    const supabase = createPublicSupabaseClient()
    const { data, error } = await supabase
      .from('regions')
      .select('id,name,name_cn,country,description,image_url,parent_id')
      .order('name', { ascending: true })
      .limit(limit)

    if (error || !data) return []
    const rows = data as Array<RegionRecord & { parent_id?: number | null }>
    const parentIds = new Set(
      rows
        .map((region) => region.parent_id)
        .filter((value): value is number => typeof value === 'number')
    )
    return rows.filter((region) => !parentIds.has(region.id))
  },
  ['top-regions'],
  { revalidate: 3600, tags: ['regions'] }
)

export async function fetchAllLocationsForSitemap() {
  const supabase = createPublicSupabaseClient()
  const { data, error } = await supabase
    .from('locations')
    .select('id,name,updated_at')
    .order('id', { ascending: false })

  if (error || !data) return []
  return data as Array<{ id: number; name: string; updated_at?: string | null }>
}

export async function fetchAllRegionsForSitemap() {
  const supabase = createPublicSupabaseClient()
  const { data, error } = await supabase
    .from('regions')
    .select('id,name,updated_at,parent_id')
    .is('parent_id', null)
    .order('name', { ascending: true })

  if (error || !data) return []
  return data as Array<{ id: number; name: string; updated_at?: string | null; parent_id?: number | null }>
}


