import 'server-only'

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'

import {
  hasValidCoordinates,
  resolvePublicDataSources,
  type PublicDataSource,
  type PublicLocation,
  type PublicLocationsPayload,
  type PublicRegion,
  type PublicRegionsPayload,
  type ResolvedPublicData,
} from '@/lib/public-data'
import { publicSpotFromSupabaseRow, type PublicSpotRecord } from '@/lib/public-spot'
import { resolvePublicRegionMedia } from '@/lib/public-region-media'

const LOCATIONS_SELECT = 'id,name,name_cn,category,latitude,longitude,image_url,region_id'
const REGIONS_SELECT = 'id,name,name_cn,country,image_url,code,parent_id'
const SNAPSHOT_LOCATIONS_SELECT = `${LOCATIONS_SELECT},images,description,tags,video_url,facebook_video_url,visit_date,opening_hours,price_info,address`
const SNAPSHOT_REGIONS_SELECT = `${REGIONS_SELECT},description`
const TIMEOUT_MS = 4000

let inFlight: Promise<ResolvedPublicData> | null = null

function displayName(name: unknown, nameCn: unknown) {
  const english = String(name || '').trim()
  const chinese = String(nameCn || '').trim()
  return chinese && english && chinese !== english ? `${chinese} / ${english}` : chinese || english
}

function slugify(value: unknown, fallback: string, id: unknown) {
  const base = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback
  return `${base}-${id}`
}

function summarize(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 180) || null
}

function thumbnail(row: any) {
  const cover = String(row?.image_url || '').trim()
  if (cover) return cover
  return Array.isArray(row?.images) ? String(row.images[0] || '').trim() || null : null
}

export function normalizeSupabasePublicData(locationRows: any[], regionRows: any[]): Omit<ResolvedPublicData, 'source'> {
  const regions: PublicRegion[] = regionRows.map((row) => ({
    id: Number(row.id),
    slug: slugify(row.name, 'region', row.id),
    name: displayName(row.name, row.name_cn),
    country: row.country || null,
    thumbnail: row.image_url || null,
    shortSummary: summarize(row.description),
    parentId: row.parent_id == null ? null : Number(row.parent_id),
    code: row.code || null,
  }))
  const regionById = new Map(regions.map((region) => [region.id, region]))
  const locations: PublicLocation[] = locationRows.filter(hasValidCoordinates).map((row) => {
    const region = regionById.get(Number(row.region_id))
    return {
      id: Number(row.id),
      slug: slugify(row.name, 'spot', row.id),
      name: displayName(row.name, row.name_cn),
      region: region ? { id: region.id, slug: region.slug, name: region.name, country: region.country, code: region.code } : null,
      category: row.category || null,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      thumbnail: thumbnail(row),
      shortSummary: summarize(row.review || row.description),
    }
  })
  return { locations, regions }
}

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function readJson<T>(fileName: string) {
  const raw = await readFile(path.join(process.cwd(), 'public-data', fileName), 'utf8')
  return JSON.parse(raw) as T
}

async function readStaticFallback(): Promise<ResolvedPublicData> {
  const [locations, regions] = await Promise.all([
    readJson<PublicLocationsPayload>('locations.json'),
    readJson<PublicRegionsPayload>('regions.json'),
  ])
  return { locations: locations.locations.filter(hasValidCoordinates), regions: regions.regions, source: 'static-fallback' }
}

function publicDataCdnBase() {
  return String(process.env.PUBLIC_DATA_CDN_BASE_URL || process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '')
}

async function readCdnSnapshot(): Promise<ResolvedPublicData | null> {
  const base = publicDataCdnBase()
  if (!base) return null
  try {
    const [locationsResponse, regionsResponse] = await withTimeout(Promise.all([
      fetch(`${base}/public-data/locations.json`, { next: { revalidate: 3600, tags: ['public-locations'] } }),
      fetch(`${base}/public-data/regions.json`, { next: { revalidate: 3600, tags: ['public-regions'] } }),
    ]), 'Public data CDN')
    if (!locationsResponse.ok || !regionsResponse.ok) return null
    const [locations, regions] = await Promise.all([
      locationsResponse.json() as Promise<PublicLocationsPayload>,
      regionsResponse.json() as Promise<PublicRegionsPayload>,
    ])
    if (!Array.isArray(locations.locations) || !Array.isArray(regions.regions)) return null
    return { locations: locations.locations.filter(hasValidCoordinates), regions: regions.regions, source: 'cdn-cache' }
  } catch {
    return null
  }
}

async function readSupabase(): Promise<ResolvedPublicData | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  try {
    const [locationsResult, regionsResult] = await withTimeout(Promise.all([
      supabase.from('locations').select(LOCATIONS_SELECT).eq('status', 'active').order('id', { ascending: false }),
      supabase.from('regions').select(REGIONS_SELECT).order('id', { ascending: true }),
    ]), 'Supabase public data')
    if (locationsResult.error || regionsResult.error) return null
    const normalized = normalizeSupabasePublicData(locationsResult.data || [], regionsResult.data || [])
    return { ...normalized, source: 'supabase' }
  } catch {
    return null
  }
}

interface PublicSnapshotBundle {
  data: ResolvedPublicData
  spots: PublicSpotRecord[]
}

async function readSupabaseSnapshotBundle(): Promise<PublicSnapshotBundle | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  try {
    const [locationsResult, regionsResult] = await withTimeout(Promise.all([
      supabase.from('locations').select(SNAPSHOT_LOCATIONS_SELECT).eq('status', 'active').order('id', { ascending: false }),
      supabase.from('regions').select(SNAPSHOT_REGIONS_SELECT).order('id', { ascending: true }),
    ]), 'Supabase snapshot data')
    if (locationsResult.error || regionsResult.error) return null
    const locationRows = locationsResult.data || []
    const regionRows = regionsResult.data || []
    const normalized = normalizeSupabasePublicData(locationRows, regionRows)
    const locationById = new Map(normalized.locations.map((location) => [location.id, location]))
    const regionById = new Map(regionRows.map((region: any) => [Number(region.id), region]))
    const spots = locationRows
      .map((row: any) => {
        const location = locationById.get(Number(row.id))
        return location ? publicSpotFromSupabaseRow(row, location, regionById.get(Number(row.region_id))) : null
      })
      .filter((spot): spot is PublicSpotRecord => Boolean(spot))
    return { data: { ...normalized, source: 'supabase' }, spots }
  } catch {
    return null
  }
}

async function resolveUncached(): Promise<ResolvedPublicData> {
  const resolved = await resolvePublicDataSources({
    cdn: async () => {
      const value = await readCdnSnapshot()
      return value ? { locations: value.locations, regions: value.regions } : null
    },
    supabase: async () => {
      const value = await readSupabase()
      return value ? { locations: value.locations, regions: value.regions } : null
    },
    fallback: async () => {
      const value = await readStaticFallback()
      return { locations: value.locations, regions: value.regions }
    },
  })
  return { ...resolved, regions: resolvePublicRegionMedia(resolved.regions, resolved.locations) }
}

async function resolveCoalesced() {
  if (!inFlight) inFlight = resolveUncached().finally(() => { inFlight = null })
  return inFlight
}

const resolveCached = unstable_cache(resolveCoalesced, ['public-data-v1'], {
  revalidate: 3600,
  tags: ['public-data', 'public-locations', 'public-regions'],
})

export async function resolvePublicData() {
  return resolveCached()
}

export async function resolvePublicDataUncachedForSnapshot() {
  const bundle = await readSupabaseSnapshotBundle()
  if (!bundle) throw new Error('Authoritative public data is unavailable.')
  return { ...bundle.data, regions: resolvePublicRegionMedia(bundle.data.regions, bundle.data.locations) }
}

export async function resolvePublicSnapshotBundleUncached() {
  const bundle = await readSupabaseSnapshotBundle()
  if (!bundle) throw new Error('Authoritative public data is unavailable.')
  return {
    ...bundle,
    data: { ...bundle.data, regions: resolvePublicRegionMedia(bundle.data.regions, bundle.data.locations) },
  }
}

export function dataSourceHeader(source: PublicDataSource) {
  return source === 'cdn-cache' ? 'cdn-cache' : source
}

export const PUBLIC_DATA_SELECTS = { locations: LOCATIONS_SELECT, regions: REGIONS_SELECT }
