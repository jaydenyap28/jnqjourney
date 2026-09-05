import { guideSemanticHash } from './east-coast-guide-migration.ts'
import { migrateLegacyGuideAttractionsUnique, type LegacyGuideLocation } from './guide-legacy-migration.ts'

export const GUANGZHOU_SLUG = 'china-guangzhou-8d7n'
export const GUANGZHOU_SEMANTIC_HASH = 'e54a3e371cdc42820c71727bbfc0aa56a7acbcd4222e5acc79208f93470edd07'
export const GUANGZHOU_IDS = [[303,304,305,306,307],[308,311],[313,314],[315,316],[317,318],[319,320],[322,323,325],[326,327,328,330]] as const

export function validateGuangzhouCanonical(guide: any) {
  if (guide.slug !== GUANGZHOU_SLUG || guide.days?.length !== 8) throw new Error('Guangzhou slug/day contract failed')
  for (const [index, day] of guide.days.entries()) {
    if (!Array.isArray(day.attractions) || !Array.isArray(day.linkedSpots) || day.linkedSpots.length) throw new Error('Canonical attractions required; linkedSpots must be empty')
    if (JSON.stringify(day.attractions.map((a: any) => a.spotId)) !== JSON.stringify(GUANGZHOU_IDS[index])) throw new Error('Guangzhou identity/order/duplicate preservation contract failed')
    for (const [order, a] of day.attractions.entries()) {
      const slug = `spot-${a.spotId}`
      if (a.spotSlug !== slug || !a.displayName || a.displayOrder !== order || a.enabled !== true) throw new Error('Canonical fields changed')
    }
  }
  if (guideSemanticHash(guide) !== GUANGZHOU_SEMANTIC_HASH) throw new Error('Guangzhou semantic hash changed')
}

export function planGuangzhouMigration(before: any, locations: LegacyGuideLocation[]) {
  if (before.slug !== GUANGZHOU_SLUG || guideSemanticHash(before) !== GUANGZHOU_SEMANTIC_HASH) throw new Error('Authoritative baseline changed; re-audit required')
  if (before.days.some((d: any) => Array.isArray(d.attractions)) || before.days.flatMap((d: any) => d.linkedSpots || []).length !== 22) throw new Error('Expected 22 legacy refs; refusing remigration')
  const after = { ...before, days: before.days.map((day: any) => ({
    ...day, attractions: migrateLegacyGuideAttractionsUnique(day, locations), linkedSpots: [],
  })) }
  validateGuangzhouCanonical(after)
  const stripBindings = (g: any) => ({ ...g, days: g.days.map(({ attractions, linkedSpots, ...rest }: any) => rest) })
  if (JSON.stringify(stripBindings(before)) !== JSON.stringify(stripBindings(after))) throw new Error('Protected fields changed')
  const exactDiff = before.days.map((day: any, i: number) => ({
    day: i + 1, before: { linkedSpots: day.linkedSpots, attractions: day.attractions ?? null },
    after: { linkedSpots: [], attractions: after.days[i].attractions },
  }))
  return { after, exactDiff, validation: {
    days: 8, beforeRefs: 22, afterAttractions: 22, missingIds: 0,
    duplicateIdsWithinDay: 0, duplicateIdsAcrossTripIntroduced: 0, preservedCrossDayDuplicateIds: [],
    ambiguous: 0, unresolved: 0, displayNameChanges: 0, orderChanges: 0,
    linkedSpotsRemaining: 0, semanticChanges: 0,
    beforeSemanticHash: guideSemanticHash(before), afterSemanticHash: guideSemanticHash(after),
  } }
}
