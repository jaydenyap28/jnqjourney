import assert from 'node:assert/strict'
import test from 'node:test'
import { snapshotTailEvent } from './snapshot-native-tail.mjs'
import { ORIGIN } from '../../cloudflare/spot-loop/snapshot-gateway.mjs'

const input = (path, headers = {}) => ({ event: { request: { url: ORIGIN + path, method: 'GET', headers }, response: { status: 404 } },
  cpuTime: 2, eventTimestamp: 1794300000000, id: 17, outcome: 'ok' })

test('keeps native CPU and Ray while dropping all other request headers', () => {
  const value = snapshotTailEvent(input('/spot/unknown', { 'X-JnQ-Acceptance': '1794300000000-0', 'CF-Ray': '1234567890abcdef-SIN', Authorization: 'LOCAL_SYNTHETIC_SECRET' }))
  assert.equal(value.cpuTime, 2)
  assert.equal(value.cfRay, '1234567890abcdef-SIN')
  assert.equal(value.acceptanceId, '1794300000000-0')
  assert.equal(value.correlation, 'header')
  assert.equal(value.nativeTraceId, 17)
  assert.ok(!JSON.stringify(value).includes('LOCAL_SYNTHETIC_SECRET'))
})

test('diagnostic path recovers a missing marker and conflicting markers reject association', () => {
  const path = '/__jnq_snapshot_observe/1794300000000-0'
  assert.equal(snapshotTailEvent(input(path)).correlation, 'diagnostic-path')
  const conflict = snapshotTailEvent(input(path, { 'X-JnQ-Acceptance': '1794300000000-1' }))
  assert.equal(conflict.acceptanceId, null)
  assert.equal(conflict.correlation, 'CONFLICT')
  assert.equal(snapshotTailEvent(input('/spot/unknown')).acceptanceId, null)
})

test('missing CPU stays UNKNOWN regardless of timestamps and control frames have no invocation', () => {
  const raw = input('/spot/unknown')
  delete raw.cpuTime
  assert.equal(snapshotTailEvent(raw).cpuTime, 'UNKNOWN')
  raw.cpuTime = '2'
  assert.equal(snapshotTailEvent(raw).cpuTime, 'UNKNOWN')
  raw.cpuTime = -1
  assert.equal(snapshotTailEvent(raw).cpuTime, 'UNKNOWN')
  assert.equal(snapshotTailEvent({ type: 'warning', message: 'sampling' }), null)
})

test('event metadata redacts fixture media key and rejects other origins', () => {
  const raw = input('/media/candidate/92061/00000000-0000-4000-8000-000000000000.png')
  assert.equal(snapshotTailEvent(raw).path, '/media/candidate/92061/REDACTED.png')
  raw.event.request.url = 'https://unrelated.invalid/'
  assert.equal(snapshotTailEvent(raw), null)
})
