import './assert-server'

import { readPublicRows, readPrivatePublicFeed, PublicReadUnavailable } from './public-read-source'
import { readLocationSlugMap } from './location-slugs-store'
import { requestCache as cache } from './request-cache'

import {
  hasValidCoordinates,
  type PublicDataSource,
  type PublicLocation,
  type PublicRegion,
  type ResolvedPublicData,
} from '@/lib/public-data'
import { publicSpotFromSupabaseRow } from '@/lib/public-spot'
import { resolvePublicRegionMedia } from '@/lib/public-region-media'
import { usableVisitDate } from '@/lib/homepage-order'
import { publicSummaryText } from '@/lib/public-summary'
import { isSpotPublished } from '@/lib/spot-content'

const LOCATIONS_SELECT = 'id,name,name_cn,category,latitude,longitude,image_url,region_id,visit_date'
const REGIONS_SELECT = 'id,name,name_cn,country,image_url,code,parent_id'

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
  return publicSummaryText(value, 180) || null
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
  const locations: PublicLocation[] = locationRows.filter(isSpotPublished).filter(hasValidCoordinates).map((row) => {
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
      visitDate: usableVisitDate(row.visit_date),
    }
  })
  return { locations, regions }
}


export async function resolvePublicSnapshotBundleUncached() {
  const [locationRows, regionPayload] = await Promise.all([readPublicRows(), readPrivatePublicFeed<{regions: any[]}>('regions.json')])
  if (!Array.isArray(regionPayload.regions)) throw new PublicReadUnavailable()
  const regionRows = regionPayload.regions.map(row => ({...row, image_url: row.image_url ?? row.thumbnail, description: row.description ?? row.shortSummary, parent_id: row.parent_id ?? row.parentId}))
  const normalized = normalizeSupabasePublicData(locationRows, regionRows)
  const slugs = await readLocationSlugMap()
  normalized.locations = normalized.locations.map(row => ({...row, slug: slugs[String(row.id)] ? slugs[String(row.id)]+'-'+row.id : row.slug}))
  const regionById = new Map(regionRows.map(row => [Number(row.id), row]))
  const locationById = new Map(normalized.locations.map(row => [row.id,row]))
  const spots = locationRows.flatMap(row => {
    const location = locationById.get(row.id)
    return location ? [publicSpotFromSupabaseRow(row, location, regionById.get(Number(row.region_id)))] : []
  })
  return {data: {...normalized, regions: resolvePublicRegionMedia(normalized.regions, normalized.locations), source: 'supabase' as const}, spots}
}
async function readPublicData() { return (await resolvePublicSnapshotBundleUncached()).data }
// React cache only deduplicates within one request; no persisted snapshot.
export const resolvePublicData = cache(readPublicData)
export async function resolvePublicDataUncachedForSnapshot() { return readPublicData() }
export function dataSourceHeader(source: PublicDataSource) { return source }
export const PUBLIC_DATA_SELECTS = { locations: LOCATIONS_SELECT, regions: REGIONS_SELECT }
