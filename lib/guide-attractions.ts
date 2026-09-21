import type { GuideAttractionRef, GuideDayRouteItem } from './guides'

export type AttractionSource = {
  routeItems?: GuideDayRouteItem[]
  attractions?: GuideAttractionRef[]
  linkedSpots?: string[]
}

export function attractionKey(attraction: Pick<GuideAttractionRef, 'spotId' | 'spotSlug' | 'displayName'>) {
  if (typeof attraction.spotId === 'number') return `id:${attraction.spotId}`
  if (attraction.spotSlug) return `slug:${attraction.spotSlug}`
  return `legacy:${String(attraction.displayName || '').trim().toLowerCase()}`
}

export function orderedGuideAttractions(source: AttractionSource): GuideAttractionRef[] {
  if (Array.isArray(source.routeItems)) {
    return source.routeItems
      .filter((item): item is Extract<GuideDayRouteItem, { type: 'spot' }> => item.type === 'spot' && item.enabled !== false)
      .map(({ type, ...attraction }, displayOrder) => ({ ...attraction, displayOrder }))
  }
  // An explicit [] is a durable deletion marker and must not fall back.
  if (Array.isArray(source.attractions)) {
    return source.attractions
      .filter((item) => item.enabled !== false && (typeof item.spotId === 'number' || item.spotSlug))
      .slice()
      .sort((left, right) => left.displayOrder - right.displayOrder)
  }

  // One read-time migration path for legacy records. New saves always persist
  // attractions and public rendering prefers the stable identifier above.
  return (source.linkedSpots || []).map((displayName, displayOrder) => ({ displayName, displayOrder, enabled: true }))
}

/** Legacy guides retain their existing ordered Spot references until edited. */
export function orderedGuideDayRoute(source: AttractionSource): GuideDayRouteItem[] {
  if (Array.isArray(source.routeItems)) return source.routeItems.filter((item) => item.type === 'note' || item.enabled !== false)
  return orderedGuideAttractions(source).map((item) => ({ ...item, type: 'spot' }))
}

/** Normalize only the new field; never migrate old guides as a side effect. */
export function normalizeGuideDayRoute(value: unknown): GuideDayRouteItem[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.map((item, displayOrder): GuideDayRouteItem => {
    if (item?.type === 'note' && typeof item.noteSlug === 'string' && item.noteSlug.trim()) {
      return { type: 'note', noteSlug: item.noteSlug.trim(), displayName: String(item.displayName || item.noteSlug).trim() }
    }
    if (item?.type === 'spot' && ((Number.isFinite(item.spotId) && item.spotId > 0) || (typeof item.spotSlug === 'string' && item.spotSlug.trim()))) {
      return {
        type: 'spot', spotId: item.spotId, spotSlug: item.spotSlug,
        displayOrder, enabled: item.enabled !== false,
        displayName: item.displayName, guideSummary: item.guideSummary,
        routeNote: item.routeNote, tips: item.tips,
      }
    }
    throw new Error(`Invalid Guide Day route item at position ${displayOrder + 1}`)
  })
}
