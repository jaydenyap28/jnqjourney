import { createHash } from 'node:crypto'
import { migrateLegacyGuideAttractionsUnique, type LegacyGuideLocation } from './guide-legacy-migration.ts'

export const EAST_COAST_SLUG = 'malaysia-east-coast-route3-10d9n'
export const EAST_COAST_SEMANTIC_HASH = '4627bf7e545996a2d6c332d68da65e634d2bc1dcb52d794dfb255b90e37f9685'
export const EAST_COAST_IDS = [
  [133, 134, 138, 137, 136, 135, 141, 142],
  [145, 146, 148, 415, 149, 150, 151],
  [144, 157, 158, 160, 161, 196, 165, 166, 163, 617],
  [167, 168, 215, 217, 218],
  [618, 219, 220, 221, 222, 226, 227, 228, 230, 621, 628, 636, 629],
  [631, 633, 632, 630, 634, 635],
  [232, 414, 233],
  [251, 252, 249, 244, 250, 245, 246, 235],
  [637, 272, 240, 241, 242, 243, 236, 237],
  [247],
]

export function guideSemanticHash(guide: any) {
  const semantic = { ...guide, days: (guide.days || []).map((day: any) => {
    const { attractions, linkedSpots, ...rest } = day
    return { ...rest, spotReferences: Array.isArray(attractions)
      ? attractions.slice().sort((a: any, b: any) => a.displayOrder - b.displayOrder).map((a: any) => a.displayName)
      : linkedSpots || [] }
  }) }
  return createHash('sha256').update(JSON.stringify(semantic)).digest('hex')
}

export function validateEastCoastCanonical(guide: any) {
  if (guide.slug !== EAST_COAST_SLUG || guide.days?.length !== 10) throw new Error('East Coast slug/day contract failed')
  const allIds: number[] = []
  for (const [index, day] of guide.days.entries()) {
    if (!Array.isArray(day.attractions) || day.linkedSpots?.length) throw new Error('Canonical attractions required; linkedSpots must be empty')
    const ids = day.attractions.map((a: any) => a.spotId)
    if (JSON.stringify(ids) !== JSON.stringify(EAST_COAST_IDS[index])) throw new Error(`East Coast Day ${index + 1} identity/order contract failed`)
    for (const [order, a] of day.attractions.entries()) {
      if (!a.spotSlug || !a.displayName || a.displayOrder !== order || a.enabled !== true) throw new Error('Canonical field contract failed')
    }
    allIds.push(...ids)
  }
  if (allIds.length !== 69 || new Set(allIds).size !== 69) throw new Error('Unexpected duplicate Spot IDs')
  const steven = guide.days[3].attractions[4]
  if (steven.spotSlug !== 'steven-s-coffee-house-218' || steven.displayName !== 'Steven’s Coffee House') throw new Error('Steven punctuation/displayName contract failed')
  if (guideSemanticHash(guide) !== EAST_COAST_SEMANTIC_HASH) throw new Error('East Coast semantic hash changed')
}

export function planEastCoastMigration(before: any, locations: LegacyGuideLocation[]) {
  if (guideSemanticHash(before) !== EAST_COAST_SEMANTIC_HASH) throw new Error('Authoritative baseline changed; re-audit required')
  if (before.days.some((d: any) => Array.isArray(d.attractions))) throw new Error('Already canonical; refusing remigration')
  const after = { ...before, days: before.days.map((day: any) => ({ ...day,
    attractions: migrateLegacyGuideAttractionsUnique(day, locations), linkedSpots: [] })) }
  validateEastCoastCanonical(after)
  const exactDiff = before.days.map((day: any, i: number) => ({ day: i + 1,
    before: { linkedSpots: day.linkedSpots, attractions: day.attractions ?? null },
    after: { linkedSpots: [], attractions: after.days[i].attractions } }))
  return { after, exactDiff, validation: {
    days: 10, beforeRefs: 69, afterAttractions: 69, missingIds: 0,
    duplicateIdsWithinDay: 0, duplicateIdsAcrossTripIntroduced: 0,
    ambiguous: 0, unresolved: 0, displayNameChanges: 0, orderChanges: 0,
    linkedSpotsRemaining: 0, semanticChanges: 0,
    beforeSemanticHash: guideSemanticHash(before), afterSemanticHash: guideSemanticHash(after),
  } }
}
