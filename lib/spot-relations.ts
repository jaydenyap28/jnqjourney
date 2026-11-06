import type { TravelGuide } from './guides'
import type { TravelPackage } from './server/travel-packages'
import type { PublicLocation } from './public-data'
import { guideRouteSpotIds } from './guide-route-spot-ids'

type Spot = { id: number; name: string; name_cn?: string | null; region_id?: number | null; latitude: number; longitude: number }
const normalize = (value?: string | null) => String(value || '').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

export function relatedGuidesForSpot(location: Pick<Spot, 'id' | 'name' | 'name_cn'>, guides: TravelGuide[]) {
  const names = [normalize(location.name), normalize(location.name_cn)].filter(Boolean)
  return guides.filter(guide => {
    if (guideRouteSpotIds(guide).has(location.id) || guide.attractions?.some(ref => ref.enabled !== false && ref.spotId === location.id)
      || guide.accommodationStays?.some(stay => stay.accommodationId === location.id)
      || guide.itinerarySegments?.some(segment => segment.accommodationStays?.some(stay => stay.accommodationId === location.id))) return true
    const guideNames = new Set([
      ...guide.route.map(item => item.mapSpotName || item.name), ...(guide.featuredSpotNames || []),
      ...guide.days.flatMap(day => day.linkedSpots || []),
    ].map(normalize).filter(Boolean))
    return names.some(name => guideNames.has(name))
  }).slice(0, 3)
}

export function relatedPackagesForSpot(location: Pick<Spot, 'id' | 'region_id'>, packages: TravelPackage[], guideSlugs: string[]) {
  return packages.filter(item => item.status === 'published' && (
    item.related_location_ids?.includes(location.id)
    || (Number(location.region_id) > 0 && item.region_id === location.region_id)
    || item.related_guide_slugs?.some(slug => guideSlugs.includes(slug))
  )).slice(0, 2)
}

export function nearbySpots(location: Spot, locations: PublicLocation[], limit = 6) {
  if (!location.region_id) return []
  const radians = (n: number) => n * Math.PI / 180
  return locations.filter(item => item.id !== location.id && item.region?.id === location.region_id)
    .map(item => {
      const a = Math.sin(radians(item.latitude - location.latitude) / 2) ** 2
        + Math.cos(radians(location.latitude)) * Math.cos(radians(item.latitude)) * Math.sin(radians(item.longitude - location.longitude) / 2) ** 2
      return { ...item, distanceKm: 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a))) }
    }).filter(item => Number.isFinite(item.distanceKm) && item.distanceKm <= 80)
    .sort((a, b) => a.distanceKm - b.distanceKm).slice(0, limit)
}
