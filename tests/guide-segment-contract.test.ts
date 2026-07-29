import assert from 'node:assert/strict'
import test from 'node:test'

import { jiangnanGuideDraft, jiangnanPriceCandidates } from '../lib/guide-drafts.ts'

test('supports a complete journey timeline with confirmed city segments', () => {
  assert.equal(jiangnanGuideDraft.itineraryMode, 'segment')
  const segments = jiangnanGuideDraft.itinerarySegments || []
  assert.equal(segments.length, 6)
  assert.deepEqual(segments.map((item) => item.city), ['上海', '苏州', '乌镇', '杭州', '宏村／黟县', '南京'])
  assert.deepEqual(segments.map((item) => [item.dayStart, item.dayEnd]), [[1, 3], [4, 5], [6, 6], [7, 8], [9, 11], [12, 15]])
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
