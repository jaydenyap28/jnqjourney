import type { GuideAttractionRef } from './guides.ts'
import { buildLocationSlug } from './location-routing.ts'

export interface LegacyGuideLocation {
  id: number
  name: string
  name_cn?: string | null
}

export interface LegacyAttractionSource {
  attractions?: GuideAttractionRef[]
  linkedSpots?: string[]
}

export function countLegacyGuideLinkedSpots(value: any) {
  const daily = Array.isArray(value?.days)
    ? value.days.reduce((total: number, day: any) => total + (Array.isArray(day?.linkedSpots) ? day.linkedSpots.length : 0), 0)
    : 0
  const segmented = Array.isArray(value?.itinerarySegments)
    ? value.itinerarySegments.reduce((total: number, segment: any) => total +
        [...(Array.isArray(segment?.verifiedRoutes) ? segment.verifiedRoutes : []), ...(Array.isArray(segment?.referenceRoutes) ? segment.referenceRoutes : [])]
          .reduce((routeTotal: number, route: any) => routeTotal + (Array.isArray(route?.linkedSpots) ? route.linkedSpots.length : 0), 0), 0)
    : 0
  return daily + segmented
}

function normalizeIdentity(value: unknown) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

export function matchingLegacyGuideLocations(name: string, locations: LegacyGuideLocation[]) {
  const target = normalizeIdentity(name)
  if (!target) return []
  return locations.filter((location) =>
    [location.name, location.name_cn]
      .map(normalizeIdentity)
      .filter(Boolean)
      .includes(target)
  )
}

export function migrateLegacyGuideAttractionsUnique(
  source: LegacyAttractionSource,
  locations: LegacyGuideLocation[]
): GuideAttractionRef[] {
  if (Array.isArray(source.attractions)) return source.attractions

  return (source.linkedSpots || []).map((displayName, displayOrder) => {
    const matches = matchingLegacyGuideLocations(displayName, locations)
    if (matches.length !== 1) {
      const reason = matches.length === 0 ? 'no matching Spot' : `${matches.length} matching Spots`
      throw new Error(`Legacy Guide Spot "${displayName}" has ${reason}; canonical migration requires exactly one match.`)
    }
    const location = matches[0]
    return {
      spotId: location.id,
      spotSlug: buildLocationSlug(location.name, location.id),
      displayOrder,
      enabled: true,
      // Preserve the exact public wording from the legacy Guide.
      displayName,
    }
  })
}
