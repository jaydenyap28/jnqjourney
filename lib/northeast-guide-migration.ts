import { guideSemanticHash } from './east-coast-guide-migration.ts'
import { matchingLegacyGuideLocations, migrateLegacyGuideAttractionsUnique, type LegacyGuideLocation, type LegacyAttractionSource } from './guide-legacy-migration.ts'
import { buildLocationSlug } from './location-routing.ts'

export const NORTHEAST_SLUG = 'china-harbin-xuegu-changbai-beijing-11d10n'
export const NORTHEAST_SEMANTIC_HASH = 'f37d959ac172130b487af92608798d4b393a379fe863db03b6b3b1a8fcbe7bfe'
export const NORTHEAST_IDS = [
  [502, 504, 505, 506, 508], [509, 511, 513, 514], [497], [498, 500],
  [487, 488, 489], [490, 491], [492, 493, 494, 495], [478], [479],
  [480, 481, 483], [484],
] as const

// Reviewed on 2026-09-05 using authoritative Day 5 narrative and Spot identity.
// Migration-only: never imported by the public resolver or normal Admin Save.
const REVIEWED = Object.freeze({
  guideSlug: NORTHEAST_SLUG, legacyName: '山顺烤肉', spotId: 487,
  canonicalName: '山顺炭火烤肉朝鲜家族', spotSlug: 'spot-487',
})

export function migrateReviewedNortheastDay(guideSlug: string, day: LegacyAttractionSource, locations: LegacyGuideLocation[]) {
  if (Array.isArray(day.attractions)) throw new Error('Already canonical; refusing remigration')
  return (day.linkedSpots || []).map((displayName, displayOrder) => {
    if (guideSlug !== REVIEWED.guideSlug || displayName !== REVIEWED.legacyName) {
      return { ...migrateLegacyGuideAttractionsUnique({ linkedSpots: [displayName] }, locations)[0], displayOrder }
    }
    const exactCandidates = matchingLegacyGuideLocations(displayName, locations)
    if (exactCandidates.length > 1 || exactCandidates.some(l => l.id !== REVIEWED.spotId)) {
      throw new Error('Reviewed override conflicts with current exact candidates')
    }
    const candidates = locations.filter(l => l.id === REVIEWED.spotId)
    if (candidates.length !== 1) throw new Error('Reviewed override requires exactly one existing Spot ID')
    const location = candidates[0]
    if (location.name !== REVIEWED.canonicalName || buildLocationSlug(location.name, location.id) !== REVIEWED.spotSlug) {
      throw new Error('Reviewed Spot identity changed; re-audit required')
    }
    return { spotId: location.id, spotSlug: REVIEWED.spotSlug, displayOrder, enabled: true, displayName }
  })
}
export function validateNortheastCanonical(guide: any) {
  if (guide.slug !== NORTHEAST_SLUG || guide.days?.length !== 11) throw new Error('Northeast slug/day contract failed')
  const ids: number[] = []
  for (const [index, day] of guide.days.entries()) {
    if (!Array.isArray(day.attractions) || !Array.isArray(day.linkedSpots) || day.linkedSpots.length) throw new Error('Canonical attractions required; linkedSpots must be empty')
    if (JSON.stringify(day.attractions.map((a: any) => a.spotId)) !== JSON.stringify(NORTHEAST_IDS[index])) throw new Error('Northeast identity/order contract failed')
    for (const [order, a] of day.attractions.entries()) {
      if (a.spotSlug !== `spot-${a.spotId}` || !a.displayName || a.displayOrder !== order || a.enabled !== true) throw new Error('Canonical fields changed')
      ids.push(a.spotId)
    }
  }
  if (ids.length !== 27 || new Set(ids).size !== 27) throw new Error('Unexpected duplicate or missing IDs')
  if (guide.days[4].attractions[0].displayName !== REVIEWED.legacyName) throw new Error('Reviewed displayName changed')
  if (guideSemanticHash(guide) !== NORTHEAST_SEMANTIC_HASH) throw new Error('Northeast semantic hash changed')
}

export function planNortheastMigration(before: any, locations: LegacyGuideLocation[]) {
  if (before.slug !== NORTHEAST_SLUG || guideSemanticHash(before) !== NORTHEAST_SEMANTIC_HASH) throw new Error('Authoritative baseline changed; re-audit required')
  if (before.days.flatMap((d: any) => d.linkedSpots || []).length !== 27) throw new Error('Expected 27 legacy refs')
  const after = { ...before, days: before.days.map((day: any) => ({
    ...day, attractions: migrateReviewedNortheastDay(before.slug, day, locations), linkedSpots: [],
  })) }
  validateNortheastCanonical(after)
  const stripBindings = (g: any) => ({ ...g, days: g.days.map(({ attractions, linkedSpots, ...rest }: any) => rest) })
  if (JSON.stringify(stripBindings(before)) !== JSON.stringify(stripBindings(after))) throw new Error('Protected fields changed')
  const exactDiff = before.days.map((day: any, i: number) => ({
    day: i + 1, before: { linkedSpots: day.linkedSpots, attractions: day.attractions ?? null },
    after: { linkedSpots: [], attractions: after.days[i].attractions },
  }))
  return { after, exactDiff, validation: {
    days: 11, beforeRefs: 27, afterAttractions: 27, missingIds: 0,
    duplicateIdsWithinDay: 0, duplicateIdsAcrossTripIntroduced: 0,
    ambiguous: 0, unresolved: 0, displayNameChanges: 0, orderChanges: 0,
    linkedSpotsRemaining: 0, semanticChanges: 0,
    beforeSemanticHash: guideSemanticHash(before), afterSemanticHash: guideSemanticHash(after),
  } }
}
