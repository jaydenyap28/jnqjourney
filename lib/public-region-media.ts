import type { PublicLocation, PublicRegion } from './public-data.ts'
import { isR2PublicImage } from './public-media.ts'

const FEATURED_SPOT_TOKEN = /(?:^|[,;\s])featured-spot[:=](\d+)(?:$|[,;\s])/i

function featuredSpotId(region: PublicRegion) {
  const match = String(region.code || '').match(FEATURED_SPOT_TOKEN)
  return match ? Number(match[1]) : null
}

function locationRank(location: PublicLocation) {
  const category = String(location.category || '').toLowerCase()
  if (category === 'attraction') return 0
  if (category !== 'food' && category !== 'accommodation') return 1
  if (category === 'food') return 2
  return 3
}

function compareLocations(left: PublicLocation, right: PublicLocation) {
  return locationRank(left) - locationRank(right) || left.id - right.id
}

function descendantIds(regionId: number, regions: PublicRegion[]) {
  const ids = new Set<number>([regionId])
  const queue = [regionId]
  while (queue.length) {
    const current = queue.shift()
    if (current == null) continue
    for (const region of regions) {
      if (region.parentId === current && !ids.has(region.id)) {
        ids.add(region.id)
        queue.push(region.id)
      }
    }
  }
  return ids
}

export interface PublicRegionMediaAudit {
  total: number
  explicitR2: number
  explicitExternal: number
  missingExplicit: number
  spotR2Fallback: number
  externalOnly: number
  logoFallback: number
}

/**
 * Resolves Region covers without a database read. A Spot candidate must belong
 * to the Region itself or one of its descendants. Selection is deterministic:
 * configured featured Spot, then category rank, then ascending Spot id.
 *
 * Legacy external Region covers are deliberately placed after verified R2 Spot
 * media because those hosts can return quota, hotlink, or expiry failures.
 */
export function resolvePublicRegionMedia(regions: PublicRegion[], locations: PublicLocation[]) {
  return regions.map((region) => {
    if (isR2PublicImage(region.thumbnail)) return { ...region }

    const allowedRegionIds = descendantIds(region.id, regions)
    const regionSpots = locations
      .filter((location) => location.region?.id && allowedRegionIds.has(location.region.id))
      .filter((location) => isR2PublicImage(location.thumbnail))
      .sort(compareLocations)

    const configuredId = featuredSpotId(region)
    const configured = configuredId == null ? null : regionSpots.find((location) => location.id === configuredId)
    const resolved = configured?.thumbnail || regionSpots[0]?.thumbnail || region.thumbnail || null
    return { ...region, thumbnail: resolved }
  })
}

export function auditPublicRegionMedia(regions: PublicRegion[], locations: PublicLocation[]): PublicRegionMediaAudit {
  const resolved = resolvePublicRegionMedia(regions, locations)
  const audit: PublicRegionMediaAudit = {
    total: regions.length,
    explicitR2: 0,
    explicitExternal: 0,
    missingExplicit: 0,
    spotR2Fallback: 0,
    externalOnly: 0,
    logoFallback: 0,
  }

  regions.forEach((region, index) => {
    if (isR2PublicImage(region.thumbnail)) {
      audit.explicitR2 += 1
      return
    }
    if (region.thumbnail) audit.explicitExternal += 1
    else audit.missingExplicit += 1

    if (isR2PublicImage(resolved[index]?.thumbnail)) audit.spotR2Fallback += 1
    else if (resolved[index]?.thumbnail) audit.externalOnly += 1
    else audit.logoFallback += 1
  })
  return audit
}
