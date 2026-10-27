import type { TravelGuide } from './guides'

/** Canonical Spot references in daily and verified segment routes. */
export function guideRouteSpotIds(guide: TravelGuide): Set<number> {
  const routes = [
    ...(guide.days || []),
    ...(guide.itinerarySegments || []).flatMap(segment => segment.verifiedRoutes || []),
  ]
  const ids = new Set<number>()
  for (const route of routes) {
    const spots = [
      ...(route.attractions || []),
      ...(route.routeItems || []).filter(item => item.type === 'spot'),
    ]
    for (const spot of spots) {
      if (spot.enabled !== false && typeof spot.spotId === 'number') ids.add(spot.spotId)
    }
  }
  return ids
}

/** Published itinerary associations, including visits without an invented day. */
export function guideContentSpotIds(guide: TravelGuide): Set<number> {
  const ids = guideRouteSpotIds(guide)
  for (const ref of guide.attractions || []) if (ref.enabled !== false && ref.spotId) ids.add(ref.spotId)
  for (const stay of guide.accommodationStays || []) ids.add(stay.accommodationId)
  for (const segment of guide.itinerarySegments || []) for (const stay of segment.accommodationStays || []) ids.add(stay.accommodationId)
  return ids
}
