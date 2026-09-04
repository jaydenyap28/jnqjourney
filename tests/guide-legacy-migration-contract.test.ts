import assert from 'node:assert/strict'
import test from 'node:test'

import { countLegacyGuideLinkedSpots, migrateLegacyGuideAttractionsUnique } from '../lib/guide-legacy-migration.ts'
import { JAPAN_GUIDE_ATTRACTION_CONTRACT } from '../lib/japan-guide-attractions.ts'

test('legacy Guide migration allows exactly one identity match', () => {
  const attractions = migrateLegacyGuideAttractionsUnique(
    { linkedSpots: ['Senso-ji Temple'] },
    [{ id: 357, name: 'Senso-ji Temple', name_cn: '浅草寺' }]
  )
  assert.deepEqual(attractions.map((item) => [item.spotId, item.spotSlug]), [[357, 'senso-ji-temple-357']])
})

test('ambiguous legacy Guide names fail closed', () => {
  assert.throws(
    () => migrateLegacyGuideAttractionsUnique(
      { linkedSpots: ['住吉神社'] },
      [
        { id: 334, name: 'Sumiyoshi Shrine', name_cn: '住吉神社' },
        { id: 999, name: 'Another Sumiyoshi Shrine', name_cn: '住吉神社' },
      ]
    ),
    /2 matching Spots/
  )
})

test('unmatched legacy Guide names fail closed', () => {
  assert.throws(
    () => migrateLegacyGuideAttractionsUnique(
      { linkedSpots: ['Missing Place'] },
      [{ id: 357, name: 'Senso-ji Temple', name_cn: '浅草寺' }]
    ),
    /no matching Spot/
  )
})

test('legacy displayName and order are preserved exactly', () => {
  const legacy = ['Ningle Terrace', '珈琲 森の時計']
  const attractions = migrateLegacyGuideAttractionsUnique(
    { linkedSpots: legacy },
    [
      { id: 375, name: 'Cafe Mori no Tokei', name_cn: '珈琲 森の時計' },
      { id: 374, name: 'Ningle Terrace', name_cn: '精灵露台' },
    ]
  )
  assert.deepEqual(attractions.map((item) => item.displayName), legacy)
  assert.deepEqual(attractions.map((item) => item.displayOrder), [0, 1])
  assert.deepEqual(attractions.map((item) => item.enabled), [true, true])
})

test('Japan Guide contract contains 10 days and 32 canonical attractions', () => {
  assert.equal(JAPAN_GUIDE_ATTRACTION_CONTRACT.length, 10)
  assert.equal(JAPAN_GUIDE_ATTRACTION_CONTRACT.flat().length, 32)
  assert.deepEqual(JAPAN_GUIDE_ATTRACTION_CONTRACT[8][0], [
    'Arakurayama Sengen Park', 364, 'arakurayama-sengen-park-364',
  ])
  assert.deepEqual(JAPAN_GUIDE_ATTRACTION_CONTRACT[3][1], ['泉源公园', 350, 'sengen-park-350'])
})

test('a saved canonical day never falls back to legacy linkedSpots', () => {
  const canonical = migrateLegacyGuideAttractionsUnique(
    {
      attractions: [{ spotId: 364, spotSlug: 'arakurayama-sengen-park-364', displayOrder: 0, enabled: true, displayName: 'Arakurayama Sengen Park' }],
      linkedSpots: ['泉源公园'],
    },
    []
  )
  assert.deepEqual(canonical.map((item) => item.spotId), [364])
})

test('new Guide saves reject legacy parallel arrays', () => {
  assert.equal(countLegacyGuideLinkedSpots({ days: [{ linkedSpots: ['浅草寺'] }] }), 1)
  assert.equal(countLegacyGuideLinkedSpots({
    days: [{ attractions: [{ spotId: 357 }], linkedSpots: [] }],
    itinerarySegments: [{ verifiedRoutes: [{ attractions: [{ spotId: 364 }], linkedSpots: [] }] }],
  }), 0)
})
