import assert from 'node:assert/strict'
import test from 'node:test'

import { canonicalTripCostCategory, GUIDE_TRIP_COST_CATEGORIES, orderedTripCostCategoryEntries } from '../lib/guide-budget.ts'

test('normalises documented historical Trip Cost aliases', () => {
  assert.equal(canonicalTripCostCategory('Air Ticket'), 'Flights')
  assert.equal(canonicalTripCostCategory('Local Transport'), 'Transportation')
  assert.equal(canonicalTripCostCategory('Meals'), 'Food & Dining')
  assert.equal(canonicalTripCostCategory('Admission'), 'Tickets & Entrance Fees')
  assert.equal(canonicalTripCostCategory('SIM Card'), 'Internet & Communication')
  assert.equal(canonicalTripCostCategory('not-a-category'), null)
})

test('uses one stable canonical order and omits empty categories at the caller', () => {
  assert.deepEqual(GUIDE_TRIP_COST_CATEGORIES.map((category) => category.key), [
    'Flights', 'Transportation', 'Accommodation', 'Food & Dining', 'Tickets & Entrance Fees', 'Activities', 'Internet & Communication', 'Shopping', 'Other',
  ])
  assert.deepEqual(orderedTripCostCategoryEntries([
    { key: 'Shopping', amount: 1 }, { key: 'Flights', amount: 1 }, { key: 'Accommodation', amount: 1 },
  ]).map((item) => item.key), ['Flights', 'Accommodation', 'Shopping'])
})
