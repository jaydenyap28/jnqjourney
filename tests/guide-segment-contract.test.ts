import assert from 'node:assert/strict'
import test from 'node:test'

import { jiangnanGuideDraft, jiangnanPriceCandidates } from '../lib/guide-drafts.ts'

test('supports a complete journey timeline with confirmed city segments', () => {
  assert.equal(jiangnanGuideDraft.itineraryMode, 'segment')
  const segments = jiangnanGuideDraft.itinerarySegments || []
  assert.equal(segments.length, 6)
  assert.deepEqual(segments.map((item) => item.city), ['上海', '苏州', '乌镇', '杭州', '宏村／黟县', '南京'])
  assert.deepEqual(segments.map((item) => [item.dayStart, item.dayEnd]), [[0, 2], [3, 4], [5, 5], [6, 7], [8, 10], [11, 14]])
  const start = Date.parse(`${jiangnanGuideDraft.tripStartDate}T00:00:00Z`)
  const offset = (date: string | undefined) => (Date.parse(`${date}T00:00:00Z`) - start) / 86400000
  for (const segment of segments) {
    assert.equal(segment.dayStart, offset(segment.dateStart))
    assert.equal(segment.dayEnd, offset(segment.dateEnd))
  }
  assert.equal(offset(jiangnanGuideDraft.tripEndDate) + 1, 15)
  assert.equal(jiangnanGuideDraft.duration, '15天14夜')
  assert.equal(segments[5].globalDayMappingStatus, 'pending')
})

test('keeps candidate prices pending and unavailable to the public layer', () => {
  assert.ok(jiangnanPriceCandidates.length > 0)
  for (const record of jiangnanPriceCandidates) {
    assert.equal(record.reviewStatus, 'pending')
    assert.equal(record.isKeyPrice, false)
    assert.equal(record.dayNumber, 0)
  }
})
