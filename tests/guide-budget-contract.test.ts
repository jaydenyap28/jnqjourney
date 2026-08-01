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
import { divideSnapshotMoney, type MoneyBotBudgetSnapshot } from '../lib/guide-budget.ts'

function validSnapshot(): MoneyBotBudgetSnapshot {
  const payload: Omit<MoneyBotBudgetSnapshot, 'checksum'> = {
    source: 'moneybot_project',
    source_project_key: '东海岸自驾游',
    source_project_name: '东海岸自驾游',
    guide_slug: 'malaysia-east-coast-route3-10d9n',
    currency: 'MYR',
    scope: 'total_trip',
    traveller_count: 2,
    total: '150.00',
    categories: {
      Transportation: '50.00',
      'Food & Dining': '100.00',
    },
    transaction_count: 3,
    generated_at: '2026-01-04T00:00:00.000Z',
    confirmed_at: '2026-01-04T01:00:00.000Z',
    snapshot_version: 1,
  }
  return { ...payload, checksum: computeSnapshotChecksum(payload) }
}

test('accepts a canonical confirmed MoneyBot snapshot', () => {
  const snapshot = validSnapshot()
  assert.equal(snapshot.checksum, 'c951a3e5b3b681bf9864ec585337e3a73e5396e09dbfbe2a63b2203e627844b5')
  assert.deepEqual(validateMoneyBotSnapshot(snapshot), snapshot)
})

test('preserves microsecond ISO timestamps when verifying the MoneyBot checksum', () => {
  const { checksum: ignored, ...base } = validSnapshot()
  void ignored
  const payload = {
    ...base,
    generated_at: '2026-07-26T10:50:38.837270Z',
    confirmed_at: '2026-07-26T10:50:38.837270Z',
  }
  const checksum = computeSnapshotChecksum(payload)
  assert.equal(validateMoneyBotSnapshot({ ...payload, checksum }).checksum, checksum)
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

test('canonicalises signed historical category aliases without altering the signed payload', () => {
  const { checksum: ignored, ...base } = validSnapshot()
  void ignored
  const payload = { ...base, categories: { Transport: '50.00', Meals: '100.00' } }
  const checksum = computeSnapshotChecksum(payload)
  assert.deepEqual(validateMoneyBotSnapshot({ ...payload, checksum }).categories, {
    Transportation: '50.00',
    'Food & Dining': '100.00',
  })
})

test('rejects the legacy event selector and full date detail', () => {
  const snapshot = {
    ...validSnapshot(),
    event_key: 'legacy-event',
    date_from: '2026-01-01',
    date_to: '2026-01-03',
  }
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

test('calculates per-traveller actual spend from cents without floating point drift', () => {
  assert.equal(divideSnapshotMoney('3020.13', 2), '1510.07')
})
