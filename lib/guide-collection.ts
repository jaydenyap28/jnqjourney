import type { TravelGuide } from './guides.ts'

export function sortGuides(guides: TravelGuide[]) {
  return [...guides].sort((left, right) => {
    const leftDate = Date.parse(left.tripStartDate || left.publishedAt || left.sortDate || '')
    const rightDate = Date.parse(right.tripStartDate || right.publishedAt || right.sortDate || '')
    const leftHasDate = Number.isFinite(leftDate)
    const rightHasDate = Number.isFinite(rightDate)
    if (leftHasDate && rightHasDate && leftDate !== rightDate) return rightDate - leftDate
    if (leftHasDate !== rightHasDate) return leftHasDate ? -1 : 1
    return 0
  })
}

/** Persisted records overlay static defaults; they are never a collection whitelist. */
export function mergeGuideCollections(staticGuides: TravelGuide[], persistedGuides: TravelGuide[]) {
  const merged = new Map<string, TravelGuide>()
  for (const guide of staticGuides) merged.set(guide.slug, guide)
  for (const guide of persistedGuides) merged.set(guide.slug, guide)
  return sortGuides(Array.from(merged.values()))
}
