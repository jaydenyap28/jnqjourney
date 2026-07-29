import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  attractionIdFromPriceSlug,
  formatPriceHighlightAmount,
  isGuideDayCostPriceHighlight,
  isPublishableGuidePrice,
  matchesAttractionPriceHighlight,
  toPublicGuidePriceHighlight,
  type GuidePriceHighlight,
} from '../lib/guide-price-highlights.ts'

const guideSlug = 'china-harbin-xuegu-changbai-beijing-11d10n'
const records = JSON.parse(
  await readFile(new URL('../data/guide-price-highlights.json', import.meta.url), 'utf8')
) as GuidePriceHighlight[]

test('uses unique IDs and integer minor-unit amounts', () => {
  assert.equal(new Set(records.map((record) => record.id)).size, records.length)
  for (const record of records) {
    assert.equal(Number.isSafeInteger(record.amountMinor), true)
    assert.equal(record.amountMinor >= 0, true)
  }
})

test('maps every candidate to the Northeast Guide, a Day, and an explicit display target', () => {
  for (const record of records) {
    assert.equal(record.guideSlug, guideSlug)
    assert.equal(Number.isInteger(record.dayNumber) && record.dayNumber > 0, true)
    assert.equal(Boolean(record.displayTargetId), true)
    if (record.displayTargetType === 'attraction') {
      assert.equal(record.displayTargetId, record.attractionSlug)
      assert.equal(attractionIdFromPriceSlug(record.displayTargetId) !== null, true)
    }
  }
})

test('publishes only the explicitly approved, evidence-complete records', () => {
  const publicRecords = records
    .map(toPublicGuidePriceHighlight)
    .filter((record): record is NonNullable<typeof record> => Boolean(record))
  assert.equal(publicRecords.length, 10)
  assert.deepEqual(
    publicRecords
      .filter((record) => record.isKeyPrice)
      .sort((left, right) => left.displayPriority - right.displayPriority)
      .map((record) => record.dayNumber),
    [2, 4, 4, 4, 6, 6, 7, 9, 11]
  )
  assert.equal(
    publicRecords.some((record) => record.id === 'harbin-to-snow-valley-charter-2025' && record.isKeyPrice),
    false
  )
  for (const record of records.filter((record) => record.evidenceStatus !== 'confirmed')) {
    assert.equal(toPublicGuidePriceHighlight(record), null)
  }
})

test('does not publish conflict or missing evidence even if review status is changed', () => {
  for (const record of records.filter((item) => item.evidenceStatus !== 'confirmed')) {
    assert.equal(isPublishableGuidePrice({ ...record, reviewStatus: 'approved' }), false)
  }
})

test('requires a positive amount, explicit unit, and paid date before approval', () => {
  const base = records.find((record) => record.evidenceStatus === 'confirmed')
  assert.ok(base)
  assert.equal(isPublishableGuidePrice({ ...base, reviewStatus: 'approved', amountMinor: 0 }), false)
  assert.equal(isPublishableGuidePrice({ ...base, reviewStatus: 'approved', unit: 'unspecified' }), false)
  assert.equal(isPublishableGuidePrice({ ...base, reviewStatus: 'approved', paidDate: null }), false)
})

test('sanitizes internal evidence fields from approved public records', () => {
  const base = records.find(
    (record) =>
      record.evidenceStatus === 'confirmed' &&
      record.unit !== 'unspecified' &&
      record.paidDate
  )
  assert.ok(base)
  const publicRecord = toPublicGuidePriceHighlight({ ...base, reviewStatus: 'approved' })
  assert.ok(publicRecord)
  assert.equal('sources' in publicRecord, false)
  assert.equal('confidence' in publicRecord, false)
  assert.equal('reviewStatus' in publicRecord, false)
  assert.equal('conflictDetails' in publicRecord, false)
  assert.equal('note' in publicRecord, false)
  assert.equal('priceType' in publicRecord, false)
})

test('formats minor-unit amounts without floating-point arithmetic', () => {
  assert.equal(formatPriceHighlightAmount('CNY', 17689), 'CNY 176.89')
  assert.equal(formatPriceHighlightAmount('MYR', 31632), 'MYR 316.32')
})

test('retains the expected evidence review distribution', () => {
  const counts = records.reduce<Record<string, number>>((total, record) => {
    total[record.evidenceStatus] = (total[record.evidenceStatus] || 0) + 1
    return total
  }, {})
  assert.deepEqual(counts, { confirmed: 10, conflict: 2, missing: 3 })
})

test('keeps unresolved candidate IDs pending', () => {
  assert.deepEqual(
    records
      .filter((record) => record.reviewStatus === 'pending')
      .map((record) => record.id),
    [
      'snow-village-admission-ledger-2025',
      'snow-village-admission-note-2025',
      'changbai-waterfall-snowmobile-2025',
      'mutianyu-admission-listed-2025',
      'mutianyu-shuttle-listed-2025',
    ]
  )
})

test('keeps transport prices out of attraction cards and routes them to day cost notes', () => {
  const charter = records.find((record) => record.id === 'harbin-to-snow-valley-charter-2025')
  assert.ok(charter)
  assert.equal(charter.displayTargetType, 'route')
  assert.equal(charter.priceCategory, 'transport')
  assert.equal(matchesAttractionPriceHighlight(charter, 'xue-gu-xuegu-497'), false)
  assert.equal(isGuideDayCostPriceHighlight(charter, guideSlug, 3), true)
  assert.equal(charter.isKeyPrice, false)
})

test('requires an exact attraction slug and never infers an attraction from only a day', () => {
  const iceWorld = records.find((record) => record.id === 'harbin-ice-world-ticket-2025')
  assert.ok(iceWorld)
  assert.equal(matchesAttractionPriceHighlight(iceWorld, 'bing-xue-da-shi-jie-harbin-511'), true)
  assert.equal(matchesAttractionPriceHighlight(iceWorld, 'yang-cao-shan-xuegu-498'), false)
  const dayOnly = {
    ...iceWorld,
    displayTargetType: 'day' as const,
    displayTargetId: `${guideSlug}:day-2`,
    attractionSlug: undefined,
  }
  assert.equal(matchesAttractionPriceHighlight(dayOnly, 'bing-xue-da-shi-jie-harbin-511'), false)
  assert.equal(isGuideDayCostPriceHighlight(dayOnly, guideSlug, 2), true)
})

test('keeps Yangcaoshan together and prevents North Slope and hot spring cross-mapping', () => {
  const yang = records.filter((record) => record.displayTargetId === 'yang-cao-shan-xuegu-498')
  assert.deepEqual(yang.map((record) => record.optionLabelZh).sort(), ['羊草山门票', '马拉爬犁', '雪地摩托'].sort())
  const north = records.find((record) => record.id === 'changbai-north-slope-net-package-2025')
  const hotSpring = records.find((record) => record.id === 'lanjing-hot-spring-2025')
  assert.ok(north)
  assert.ok(hotSpring)
  assert.equal(matchesAttractionPriceHighlight(north, hotSpring.displayTargetId), false)
  assert.equal(matchesAttractionPriceHighlight(hotSpring, north.displayTargetId), false)
})
