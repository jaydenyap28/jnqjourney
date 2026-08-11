import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import { normalizePublicGuideTripCost, type PublicGuideTripCost } from '../lib/guide-budget.ts'

const read = (path: string) => fs.readFileSync(path, 'utf8')
const snapshot = JSON.parse(read('public-data/guide-trip-costs.json'))
const bySlug = new Map<string, PublicGuideTripCost>()
for (const record of snapshot.tripCosts as Array<{ slug: string; tripCost: unknown }>) {
  const tripCost = normalizePublicGuideTripCost(record.tripCost)
  if (tripCost) bySlug.set(record.slug, tripCost)
}

const expected = {
  'china-jiangnan-autumn-15d14n': ['published_actual', 855447, 8],
  'malaysia-east-coast-route3-10d9n': ['published_actual', 302013, 7],
  'china-harbin-xuegu-changbai-beijing-11d10n': ['guide_budget', 645200, 7],
  'china-dali-shangri-la-lijiang-11d10n': ['guide_budget', 432600, 6],
  'japan-hokkaido-yamagata-tokyo-10d9n': ['guide_budget', 771500, 8],
  'china-guangzhou-8d7n': ['hidden', 0, 0],
} as const

test('the public snapshot has one valid normalized Trip Cost for every published Guide', () => {
  assert.equal(snapshot.schemaVersion, 1)
  assert.equal(snapshot.tripCosts.length, 6)
  for (const [slug, [source, totalCents, categories]] of Object.entries(expected)) {
    const tripCost = bySlug.get(slug)
    assert.ok(tripCost, `${slug} must have a valid Trip Cost`)
    assert.equal(tripCost.source, source)
    assert.equal(tripCost.totalCents, totalCents)
    assert.equal(tripCost.categories.length, categories)
    assert.equal(tripCost.categories.reduce((sum, item) => sum + item.amountCents, 0), totalCents)
  }
})

test('Published Actual metrics remain exact and manual Guides do not invent traveller facts', () => {
  const jiangnan = bySlug.get('china-jiangnan-autumn-15d14n')!
  assert.deepEqual([jiangnan.travellers, jiangnan.perPersonCents, jiangnan.transactionCount], [2, 427724, 233])
  const eastCoast = bySlug.get('malaysia-east-coast-route3-10d9n')!
  assert.deepEqual([eastCoast.travellers, eastCoast.perPersonCents, eastCoast.transactionCount], [2, 151007, 54])
  const japan = bySlug.get('japan-hokkaido-yamagata-tokyo-10d9n')!
  assert.deepEqual([japan.travellers, japan.perPersonCents, japan.transactionCount], [null, null, null])
})

test('public read is CDN cached, detail-only, and does not expand the Guide list DTO', () => {
  const reader = read('lib/server/public-guide-trip-cost.ts')
  const route = read('app/api/guides/route.ts')
  assert.match(reader, /revalidate:\s*3600/)
  assert.match(reader, /guide-trip-costs/)
  assert.ok(reader.indexOf('if (published) return published.tripCost') < reader.indexOf('const actual = await readPublishedGuideBudget'))
  assert.match(route, /if \(slug\)[\s\S]*readPublicGuideTripCost\(guide\)/)
  const listBranch = route.slice(route.indexOf('const guides ='))
  assert.doesNotMatch(listBranch, /budgetItems|tripCost/)
  assert.doesNotMatch(reader, /select\(\s*['"`]\*['"`]\s*\)/)
})

test('there is one public renderer and admin writes keep private no-store semantics', () => {
  const page = read('app/guide/[slug]/page.tsx')
  assert.match(page, /<GuideTripCost tripCost=\{publicTripCost\}/)
  assert.equal(fs.existsSync('components/GuideBudgetSection.tsx'), false)
  assert.match(read('app/api/admin/guides/route.ts'), /PRIVATE_NO_STORE/)
  assert.match(read('app/api/admin/guide-budget-snapshots/route.ts'), /PRIVATE_NO_STORE/)
  assert.match(read('app/api/admin/guide-budget-snapshots/route.ts'), /guide-trip-cost:\$\{snapshot\.guide_slug\}/)
})
