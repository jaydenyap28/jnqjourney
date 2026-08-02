import assert from 'node:assert/strict'
import test from 'node:test'

import { canonicalGuideBudgetItems, guideBudgetMoneyToCents } from '../lib/guide-budget.ts'

test('Japan canonical categories add to RM 7,715.00 and retain the recovered RM 692', () => {
  const budget = canonicalGuideBudgetItems([
    { label: 'Accommodation', amount: '2061' }, { label: 'Flights', amount: '1713' }, { label: 'Transportation', amount: '1450' },
    { label: 'Food & Dining', amount: '1137' }, { label: 'Shopping', amount: '662' }, { label: '门票', amount: '331' },
    { label: '其他', amount: '311' }, { label: '通讯', amount: '50' },
  ])
  assert.equal(budget.totalCents, 771500)
  assert.deepEqual(budget.categories.map((item) => [item.key, item.amountCents]), [
    ['Flights', 171300], ['Transportation', 145000], ['Accommodation', 206100], ['Food & Dining', 113700],
    ['Tickets & Entrance Fees', 33100], ['Internet & Communication', 5000], ['Shopping', 66200], ['Other', 31100],
  ])
})

test('aliases merge into canonical categories without changing the total', () => {
  const budget = canonicalGuideBudgetItems([
    { label: 'Ticket', amount: '100' }, { label: 'Admission', amount: '20' }, { label: 'eSIM', amount: '50' }, { label: 'Miscellaneous', amount: '30' },
  ])
  assert.deepEqual(budget.categories.map((item) => [item.key, item.amountCents]), [
    ['Tickets & Entrance Fees', 12000], ['Internet & Communication', 5000], ['Other', 3000],
  ])
  assert.equal(budget.totalCents, 20000)
})

test('empty and TBC categories do not create visible cards', () => {
  const budget = canonicalGuideBudgetItems([{ label: 'Flights', amount: '0' }, { label: 'Activities', amount: 'TBC' }, { label: 'Shopping', amount: '' }])
  assert.deepEqual(budget.categories, [])
  assert.equal(guideBudgetMoneyToCents('RM 1,234.50'), 123450)
})
