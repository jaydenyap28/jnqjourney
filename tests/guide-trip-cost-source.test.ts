import assert from 'node:assert/strict'
import test from 'node:test'

import { divideSnapshotMoney, resolvePublicGuideTripCost, type GuideBudgetDisplaySnapshot } from '../lib/guide-budget.ts'

const eastCoastSnapshot: GuideBudgetDisplaySnapshot = {
  source_project_name: 'East Coast',
  currency: 'RM',
  scope: 'total_trip',
  traveller_count: 2,
  total: '3020.13',
  categories: {
    Other: '49.20',
    Shopping: '53.80',
    Activities: '380.00',
    Accommodation: '1434.79',
    'Food & Dining': '733.98',
    Transportation: '339.36',
    'Tickets & Entrance Fees': '29.00',
  },
  transaction_count: 54,
  received_at: '2026-07-29T02:09:25.171Z',
}

const legacyEastCoastBudget = [
  { label: 'Accommodation', amount: '718.00' },
  { label: 'Food & Dining', amount: '367.00' },
  { label: 'Activities', amount: '190.00' },
  { label: 'Transportation', amount: '170.00' },
  { label: 'Shopping', amount: '41.00' },
  { label: 'Other', amount: '15.00' },
  { label: 'Tickets & Entrance Fees', amount: '11.00' },
]

test('published actual spend takes precedence over the saved Guide budget', () => {
  const tripCost = resolvePublicGuideTripCost(eastCoastSnapshot, legacyEastCoastBudget)
  assert.equal(tripCost.source, 'published_actual')
  assert.equal(tripCost.totalCents, 302013)
  assert.deepEqual(tripCost.categories.map((category) => [category.key, category.amountCents]), [
    ['Transportation', 33936],
    ['Accommodation', 143479],
    ['Food & Dining', 73398],
    ['Tickets & Entrance Fees', 2900],
    ['Activities', 38000],
    ['Shopping', 5380],
    ['Other', 4920],
  ])
  assert.equal(divideSnapshotMoney(eastCoastSnapshot.total, eastCoastSnapshot.traveller_count!), '1510.07')
})

test('Guide budget is only used when there is no published actual snapshot', () => {
  const tripCost = resolvePublicGuideTripCost(null, legacyEastCoastBudget)
  assert.equal(tripCost.source, 'guide_budget')
  assert.equal(tripCost.totalCents, 151200)
})

test('Guide Trip Cost is hidden when the selected source has no positive canonical category', () => {
  const tripCost = resolvePublicGuideTripCost(null, [{ label: 'Shopping', amount: '0.00' }])
  assert.equal(tripCost.source, 'hidden')
  assert.equal(tripCost.totalCents, 0)
})
