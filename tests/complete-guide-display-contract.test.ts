import assert from 'node:assert/strict'
import test from 'node:test'

import { jiangnanGuideDraft } from '../lib/guide-drafts.ts'
import { getGuideSpotCover } from '../lib/guide-segment-spots.ts'
import { formatShortText } from '../lib/short-text.ts'

test('formats compact UI copy without changing decimals or internal punctuation', () => {
  assert.equal(formatShortText('抵达上海。'), '抵达上海')
  assert.equal(formatShortText('价格约 RM3.20。'), '价格约 RM3.20')
  assert.equal(formatShortText('抵达后，先安顿住宿。'), '抵达后，先安顿住宿')
  assert.equal('这是一段完整正文。保持原样。', '这是一段完整正文。保持原样。')
})

test('uses the same cover fallback order for stay and attraction sources', () => {
  assert.equal(getGuideSpotCover({ image_url: 'cover.webp', images: ['gallery.webp'] }), 'cover.webp')
  assert.equal(getGuideSpotCover({ image_url: '', images: ['', 'gallery.webp'] }), 'gallery.webp')
  assert.equal(getGuideSpotCover({ image_url: '', images: [] }), '/placeholder-image.jpg')
})

test('binds Jiangnan stays by exact accommodation IDs and keeps names public-ready', () => {
  const segments = jiangnanGuideDraft.itinerarySegments || []
  const stayDays = segments.flatMap((segment) => segment.accommodationStays || [])
  assert.deepEqual(stayDays.map((stay) => [stay.dayStart, stay.dayEnd, stay.accommodationId]), [
    [1, 3, 609], [4, 4, 615], [5, 5, 442], [6, 6, 433], [7, 8, 419], [9, 11, 807], [12, 15, 791],
  ])
  assert.ok(segments.every((segment) => !/待核对|待确认/.test(segment.accommodation || '')))
})

test('puts Bishan Village and Xiuli Water Town on verified Day 11 only', () => {
  const yixian = (jiangnanGuideDraft.itinerarySegments || []).find((segment) => segment.id === 'yixian')
  assert.ok(yixian)
  const day10 = yixian?.verifiedRoutes.find((route) => route.dayNumber === 10)
  const day11 = yixian?.verifiedRoutes.find((route) => route.dayNumber === 11)
  assert.deepEqual(day10?.linkedSpots, ['宏村', '南湖', '卢村', '塔川'])
  assert.deepEqual(day11?.linkedSpots, ['碧山村', '秀里水镇'])
  assert.deepEqual(yixian?.referenceRoutes?.[0]?.linkedSpots, ['奇墅湖'])
})
