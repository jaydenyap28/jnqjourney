import assert from 'node:assert/strict'
import test from 'node:test'

import { mergeGuideCollections } from '../lib/guide-collection.ts'
import type { TravelGuide } from '../lib/guides.ts'

function guide(slug: string, start: string, title = slug): TravelGuide {
  return {
    slug, title, shortTitle: title, tagline: '', summary: '', duration: '', budget: '', budgetScope: 'unspecified', travelStyle: '', route: [], coverAccent: '', highlightTags: [], heroBullets: [], budgetItems: [], days: [], bestFor: [], notes: [], tripStartDate: start,
  }
}

test('keeps static complete Guides when Storage contains only Jiangnan', () => {
  const staticGuides = ['east', 'northeast', 'yunnan', 'japan', 'guangzhou', 'jiangnan'].map((slug, index) => guide(slug, `2025-0${index + 1}-01`))
  const result = mergeGuideCollections(staticGuides, [guide('jiangnan', '2025-11-04', 'Persisted Jiangnan')])
  assert.equal(result.length, 6)
  assert.equal(result[0].title, 'Persisted Jiangnan')
  assert.equal(result.filter((item) => item.slug === 'jiangnan').length, 1)
})

test('includes persisted additions and preserves explicit empty arrays', () => {
  const saved = { ...guide('jiangnan', '2025-11-04', 'Saved'), days: [], budgetItems: [] }
  const result = mergeGuideCollections([guide('east', '2025-01-01'), guide('jiangnan', '2025-11-04', 'Static')], [saved, guide('new-guide', '2025-12-01')])
  assert.equal(result.length, 3)
  assert.equal(result.find((item) => item.slug === 'jiangnan')?.days.length, 0)
  assert.equal(result[0].slug, 'new-guide')
})
