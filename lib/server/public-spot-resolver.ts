import './assert-server'
import { requestCache as cache } from './request-cache'
import { evaluateSpotQuality } from '@/lib/spot-quality'
import { extractLocationIdFromSlug, slugifyLocationName } from '@/lib/location-routing'
import { readLocationSlugMap } from './location-slugs-store'
import { readPublicRows, readPrivatePublicFeed, PublicReadUnavailable } from './public-read-source'
import type { PublicSpotRecord, PublicSpotSource } from '@/lib/public-spot'

export class PublicSpotUnavailableError extends PublicReadUnavailable {}
export interface ResolvedPublicSpot { spot: PublicSpotRecord; source: PublicSpotSource; quality: ReturnType<typeof evaluateSpotQuality> }
function publicRegion(rows: any[], id: number | null) {
  const region = rows.find(item => item.id === id)
  if (!region) return null
  return {id:region.id,name:region.name,name_cn:region.name_cn ?? null,country:region.country ?? null,
    description:region.description ?? region.shortSummary ?? null,image_url:region.image_url ?? region.thumbnail ?? null,
    parent_id:region.parent_id ?? region.parentId ?? null,code:region.code ?? null}
}
export async function readAuthoritativePublicSpotsByIds(ids: number[]): Promise<PublicSpotRecord[]> {
  if (!ids.length) return []
  const [rows, regions, slugMap] = await Promise.all([
    readPublicRows([...new Set(ids)]), readPrivatePublicFeed<{regions: any[]}>('regions.json'), readLocationSlugMap(),
  ])
  if (!Array.isArray(regions.regions)) throw new PublicReadUnavailable()
  return rows.map(row => ({...row,
    slug: (slugMap[String(row.id)] || slugifyLocationName(row.name) || 'spot')+'-'+row.id,
    regions: publicRegion(regions.regions, row.region_id),
  } as PublicSpotRecord))
}
export async function readAuthoritativePublicSpotById(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new PublicReadUnavailable()
  return (await readAuthoritativePublicSpotsByIds([id]))[0] || null
}
export const getPublicSpotBySlug = cache(async (slug: string): Promise<ResolvedPublicSpot | null> => {
  const id = extractLocationIdFromSlug(slug)
  if (!id || id === 450) return null
  const spot = await readAuthoritativePublicSpotById(id)
  return spot ? {spot, source: 'supabase', quality: evaluateSpotQuality(spot)} : null
})
