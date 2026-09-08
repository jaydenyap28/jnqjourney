import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeUnassignedVisits } from '../lib/guide-unassigned.ts'

const ref = { spotId: 900, spotSlug: 'example-900', displayOrder: 0, enabled: true, displayName: 'Example' }
test('actual visits and stays survive without invented days', () => {
  const result = normalizeUnassignedVisits({ attractions: [ref], accommodationStays: [{ accommodationId: 901 }], days: [] })
  assert.equal(result.attractions[0].spotSlug, 'example-900')
  assert.deepEqual(result.accommodationStays, [{ accommodationId: 901, note: undefined }])
})
test('Guide-specific stay display name survives without changing identity or day assignment', () => {
  const value = normalizeUnassignedVisits({ accommodationStays: [{ accommodationId: 808, displayName: ' Villa Paddy ' }] })
  assert.deepEqual(value.accommodationStays, [{ accommodationId: 808, displayName: 'Villa Paddy', note: undefined }])
})
test('reject parallel itinerary, duplicate or mismatched identity and invented stay range', () => {
  for (const value of [
    { days: [{ dayLabel: 'Day 1' }] }, { itinerarySegments: [{}] }, { linkedSpots: ['Example'] },
    { attractions: [ref, ref] }, { attractions: [{ ...ref, spotSlug: 'wrong-901' }] },
    { attractions: [ref], accommodationStays: [{ accommodationId: 900 }] },
    { accommodationStays: [{ accommodationId: 901, dayStart: 1 }] },
  ]) assert.throws(() => normalizeUnassignedVisits(value))
})
