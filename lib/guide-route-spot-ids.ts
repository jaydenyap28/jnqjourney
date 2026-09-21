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
