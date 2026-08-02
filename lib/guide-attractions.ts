import type { GuideAttractionRef } from './guides'

type AttractionSource = {
  attractions?: GuideAttractionRef[]
  linkedSpots?: string[]
}

export function attractionKey(attraction: Pick<GuideAttractionRef, 'spotId' | 'spotSlug' | 'displayName'>) {
  if (typeof attraction.spotId === 'number') return `id:${attraction.spotId}`
  if (attraction.spotSlug) return `slug:${attraction.spotSlug}`
  return `legacy:${String(attraction.displayName || '').trim().toLowerCase()}`
}

export function orderedGuideAttractions(source: AttractionSource): GuideAttractionRef[] {
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
