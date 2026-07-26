import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BudgetContractError,
  computeRequestSignature,
  computeSnapshotChecksum,
  validateMoneyBotSnapshot,
  validateRequestFreshness,
  verifyRequestSignature,
} from '../lib/server/guide-budget-contract.ts'
import type { MoneyBotBudgetSnapshot } from '../lib/guide-budget.ts'

function validSnapshot(): MoneyBotBudgetSnapshot {
  const payload: Omit<MoneyBotBudgetSnapshot, 'checksum'> = {
    event_key: 'configured-test-trip',
    guide_slug: 'malaysia-east-coast-route3-10d9n',
    title: 'Configured test trip',
    currency: 'MYR',
    scope: 'total_trip',
    traveller_count: 2,
    total: '150.00',
    categories: {
      Transportation: '50.00',
      'Food & Dining': '100.00',
    },
    transaction_count: 3,
    date_from: '2026-01-01',
    date_to: '2026-01-03',
    generated_at: '2026-01-04T00:00:00.000Z',
    confirmed_at: '2026-01-04T01:00:00.000Z',
    source: 'moneybot',
    snapshot_version: 1,
  }
  return { ...payload, checksum: computeSnapshotChecksum(payload) }
}

test('accepts a canonical confirmed MoneyBot snapshot', () => {
  const snapshot = validSnapshot()
  assert.equal(snapshot.checksum, '14fa3d5df5081fac1527c09d71ee3456ccd640322efd21a170653c98ea4e4a82')
  assert.deepEqual(validateMoneyBotSnapshot(snapshot), snapshot)
})

test('rejects total and category mismatches', () => {
  const snapshot = validSnapshot()
  snapshot.total = '151.00'
  assert.throws(() => validateMoneyBotSnapshot(snapshot), BudgetContractError)
})

test('rejects unknown fields so private ledger data cannot leak through', () => {
  const snapshot = { ...validSnapshot(), account: 'private-account' }
  assert.throws(() => validateMoneyBotSnapshot(snapshot), /Unknown snapshot fields/)
})

test('verifies raw-body HMAC signatures and rejects tampering', () => {
  const rawBody = JSON.stringify(validSnapshot())
  const signature = computeRequestSignature('test-secret', '1780000000000', 'nonce_123456789012', rawBody)
  assert.equal(
    verifyRequestSignature('test-secret', '1780000000000', 'nonce_123456789012', rawBody, signature),
    true
  )
  assert.equal(
    verifyRequestSignature('test-secret', '1780000000000', 'nonce_123456789012', `${rawBody} `, signature),
    false
  )
})

test('rejects timestamps outside the replay window', () => {
  assert.doesNotThrow(() => validateRequestFreshness('1780000000000', 1780000000000))
  assert.throws(() => validateRequestFreshness('1780000000000', 1780001000000), BudgetContractError)
})
