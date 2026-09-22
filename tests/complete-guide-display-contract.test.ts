import assert from 'node:assert/strict'
import fs from 'node:fs'
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
    [0, 2, 609], [3, 3, 615], [4, 4, 442], [5, 5, 433], [6, 7, 419], [8, 10, 807], [11, 14, 791],
  ])
  assert.ok(segments.every((segment) => !/待核对|待确认/.test(segment.accommodation || '')))
})

test('keeps Yixian actual visits in the confirmed Day 8–10 order', () => {
  const yixian = (jiangnanGuideDraft.itinerarySegments || []).find((segment) => segment.id === 'yixian')
  assert.ok(yixian)
  const day8 = yixian?.verifiedRoutes.find((route) => route.dayNumber === 8)
  const day9 = yixian?.verifiedRoutes.find((route) => route.dayNumber === 9)
  const day10 = yixian?.verifiedRoutes.find((route) => route.dayNumber === 10)
  assert.deepEqual(day8?.attractions?.map((item) => item.spotId), [785, 804])
  assert.deepEqual(day9?.attractions?.map((item) => item.spotId), [789, 787])
  assert.deepEqual(day10?.attractions?.map((item) => item.spotId), [790, 788])
  assert.deepEqual(yixian?.referenceRoutes?.[0]?.attractions, [])
  assert.ok(yixian?.verifiedRoutes.every((route) => !route.linkedSpots?.length))
})

test('keeps all 15 Jiangnan days on one canonical attraction source', () => {
  const routes = (jiangnanGuideDraft.itinerarySegments || [])
    .flatMap((segment) => segment.verifiedRoutes)
    .sort((left, right) => Number(left.dayNumber) - Number(right.dayNumber))
  assert.deepEqual(routes.map((route) => route.dayNumber), Array.from({ length: 15 }, (_, index) => index))
  assert.deepEqual(routes.map((route) => route.attractions?.map((item) => item.spotId)), [
    [],
    [446, 447, 449, 452],
    [453, 454, 458, 459],
    [436, 437, 438, 439],
    [440, 441, 445],
    [432],
    [420, 427],
    [422, 423, 426, 640, 429],
    [785, 804],
    [789, 787],
    [790, 788],
    [],
    [792, 794],
    [795, 797, 798, 802],
    [800, 801, 803],
  ])
  assert.equal(routes.flatMap((route) => route.attractions || []).length, 38)
  assert.ok(routes.every((route) => !route.linkedSpots?.length))
})

test('keeps Jiangnan dates and duration while presenting the arrival as Day 0', () => {
  const segments = jiangnanGuideDraft.itinerarySegments || []
  assert.equal(jiangnanGuideDraft.tripStartDate, '2025-11-04')
  assert.equal(jiangnanGuideDraft.tripEndDate, '2025-11-18')
  assert.equal(jiangnanGuideDraft.duration, '15天14夜')
  assert.deepEqual(segments.map((segment) => [segment.dayStart, segment.dayEnd]), [[0, 2], [3, 4], [5, 5], [6, 7], [8, 10], [11, 14]])
  assert.deepEqual(jiangnanGuideDraft.route.map((stop) => stop.stopLabel), ['Day 0–2', 'Day 3–4', 'Day 5', 'Day 6–7', 'Day 8–10', 'Day 11–14'])
  assert.equal(segments[0].transport, '凌晨抵达浦东机场后，搭乘守航夜宵线进入市区，再前往酒店入住。')
  assert.doesNotMatch(JSON.stringify(jiangnanGuideDraft), /原始路线记录|后台资料|数据中未提供|暂未录入|保留原记录|自动整理/)
})

test('public snapshot publisher reads authoritative Storage instead of its own public Guide output', () => {
  const source = fs.readFileSync(new URL('../scripts/publish-public-snapshots-r2.mjs', import.meta.url), 'utf8')
  assert.match(source, /currentAuthoritativeGuides/)
  assert.match(source, /_system\/guides-latest\.webp/)
  assert.doesNotMatch(source, /PRODUCTION_BASE}\/api\/guides/)
})
