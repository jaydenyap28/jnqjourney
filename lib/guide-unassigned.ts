import type { GuideAttractionRef } from './guides.ts'

/** Fail closed instead of accepting a second itinerary or silently dropping an identity. */
export function normalizeUnassignedVisits(value: any): {
  attractions: GuideAttractionRef[]
  accommodationStays: Array<{ accommodationId: number; displayName?: string; note?: string }>
} {
  if ((value.days || []).length || (value.itinerarySegments || []).length || (value.linkedSpots || []).length) {
    throw new Error('Unassigned visits cannot contain days, itinerarySegments or linkedSpots.')
  }
  const seen = new Set<number>()
  const attractions = (value.attractions || []).map((item: any, index: number) => {
    if (!Number.isSafeInteger(item.spotId) || item.spotId <= 0 || seen.has(item.spotId) ||
        typeof item.spotSlug !== 'string' || !item.spotSlug.endsWith(`-${item.spotId}`) ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.spotSlug) || !Number.isFinite(item.displayOrder)) {
      throw new Error(`attractions[${index}]: unique spotId, matching spotSlug and displayOrder are required.`)
    }
    seen.add(item.spotId)
    return { spotId: item.spotId, spotSlug: item.spotSlug, displayOrder: item.displayOrder,
      enabled: item.enabled !== false, displayName: String(item.displayName || '').trim() || undefined,
      guideSummary: String(item.guideSummary || '').trim() || undefined }
  })
  const accommodationStays = (value.accommodationStays || []).map((item: any, index: number) => {
    if (!Number.isSafeInteger(item.accommodationId) || item.accommodationId <= 0 || seen.has(item.accommodationId) ||
        item.dayStart !== undefined || item.dayEnd !== undefined) {
      throw new Error(`accommodationStays[${index}]: unique accommodationId without guessed days is required.`)
    }
    seen.add(item.accommodationId)
    const displayName = String(item.displayName || '').trim()
    return { accommodationId: item.accommodationId, ...(displayName ? { displayName } : {}), note: String(item.note || '').trim() || undefined }
  })
  return { attractions, accommodationStays }
}
