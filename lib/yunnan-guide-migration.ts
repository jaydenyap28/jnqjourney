import { guideSemanticHash } from './east-coast-guide-migration.ts'
import { migrateLegacyGuideAttractionsUnique, type LegacyGuideLocation } from './guide-legacy-migration.ts'

export const YUNNAN_SLUG = 'china-dali-shangri-la-lijiang-11d10n'
export const YUNNAN_SEMANTIC_HASH = '3adf5e3b44338f3e1e46df90080ec70012fa0de431b938bd67041e9491f30797'
export const YUNNAN_IDS = [[548,547,542,541],[534,535,537,538,539],[543,544,574],[567,569,570],[565],[558,559],[561,563,529,528],[525,526,528,529],[523,521,522,524,532],[683,551,552,554],[515,516]] as const

export function validateYunnanCanonical(guide: any) {
  if (guide.slug !== YUNNAN_SLUG || guide.days?.length !== 11) throw new Error('Yunnan slug/day contract failed')
  for (const [index, day] of guide.days.entries()) {
    if (!Array.isArray(day.attractions) || !Array.isArray(day.linkedSpots) || day.linkedSpots.length) throw new Error('Canonical attractions required; linkedSpots must be empty')
    if (JSON.stringify(day.attractions.map((a: any) => a.spotId)) !== JSON.stringify(YUNNAN_IDS[index])) throw new Error('Yunnan identity/order/duplicate preservation contract failed')
    for (const [order, a] of day.attractions.entries()) {
      const slug = a.spotId === 537 ? 's-537' : `spot-${a.spotId}`
      if (a.spotSlug !== slug || !a.displayName || a.displayOrder !== order || a.enabled !== true) throw new Error('Canonical fields changed')
    }
  }
  if (guideSemanticHash(guide) !== YUNNAN_SEMANTIC_HASH) throw new Error('Yunnan semantic hash changed')
}

export function planYunnanMigration(before: any, locations: LegacyGuideLocation[]) {
  if (before.slug !== YUNNAN_SLUG || guideSemanticHash(before) !== YUNNAN_SEMANTIC_HASH) throw new Error('Authoritative baseline changed; re-audit required')
  if (before.days.some((d: any) => Array.isArray(d.attractions)) || before.days.flatMap((d: any) => d.linkedSpots || []).length !== 37) throw new Error('Expected 37 legacy refs; refusing remigration')
  const after = { ...before, days: before.days.map((day: any) => ({
    ...day, attractions: migrateLegacyGuideAttractionsUnique(day, locations), linkedSpots: [],
  })) }
  validateYunnanCanonical(after)
  const stripBindings = (g: any) => ({ ...g, days: g.days.map(({ attractions, linkedSpots, ...rest }: any) => rest) })
  if (JSON.stringify(stripBindings(before)) !== JSON.stringify(stripBindings(after))) throw new Error('Protected fields changed')
  const exactDiff = before.days.map((day: any, i: number) => ({
    day: i + 1, before: { linkedSpots: day.linkedSpots, attractions: day.attractions ?? null },
    after: { linkedSpots: [], attractions: after.days[i].attractions },
  }))
  return { after, exactDiff, validation: {
    days: 11, beforeRefs: 37, afterAttractions: 37, missingIds: 0,
    duplicateIdsWithinDay: 0, duplicateIdsAcrossTripIntroduced: 0, preservedCrossDayDuplicateIds: [528, 529],
    ambiguous: 0, unresolved: 0, displayNameChanges: 0, orderChanges: 0,
    linkedSpotsRemaining: 0, semanticChanges: 0,
    beforeSemanticHash: guideSemanticHash(before), afterSemanticHash: guideSemanticHash(after),
  } }
}
