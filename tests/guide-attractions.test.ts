import assert from 'node:assert/strict'
import test from 'node:test'

import { orderedGuideAttractions } from '../lib/guide-attractions.ts'
import { resolveGuideAttraction } from '../lib/guide-segment-spots.ts'

const spots = [
  { id: 785, name: 'Hongcun Scenic Area', name_cn: '宏村风景区' },
  { id: 787, name: 'Lucun Viewing Platform', name_cn: '卢村观景台' },
  { id: 789, name: 'Bishan Village', name_cn: '碧山村' },
]

test('canonical attractions keep the saved order and explicit empty arrays', () => {
  const ordered = orderedGuideAttractions({
    attractions: [
      { spotId: 789, displayOrder: 2, enabled: true },
      { spotId: 785, displayOrder: 0, enabled: true },
      { spotId: 787, displayOrder: 1, enabled: false },
    ],
    linkedSpots: ['ignored legacy value'],
  })
  assert.deepEqual(ordered.map((item) => item.spotId), [785, 789])
  assert.deepEqual(orderedGuideAttractions({ attractions: [], linkedSpots: ['must not return'] }), [])
})

test('canonical IDs take precedence over display text and never merge nearby names', () => {
  assert.equal(resolveGuideAttraction({ spotId: 787, displayOrder: 0, displayName: '卢村' }, spots)?.id, 787)
  assert.equal(resolveGuideAttraction({ spotId: 789, displayOrder: 0, displayName: '卢村' }, spots)?.id, 789)
})

test('moving a reference between days leaves no static fallback duplicate', () => {
  const days = [
    { attractions: [{ spotId: 785, displayOrder: 0 }] },
    { attractions: [] },
  ]
  assert.deepEqual(orderedGuideAttractions(days[0]).map((item) => item.spotId), [785])
  assert.deepEqual(orderedGuideAttractions(days[1]), [])
})
