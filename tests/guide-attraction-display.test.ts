import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { guideAttractionDisplayName } from '../lib/guide-attraction-display.ts'
import { buildLocationPath } from '../lib/location-routing.ts'

test('trimmed custom displayName wins over canonical names without mutating data or binding', () => {
  const attraction = Object.freeze({ displayName: '  山顺烤肉  ', spotId: 487, spotSlug: 'spot-487' })
  const spot = Object.freeze({ id: 487, name: '山顺炭火烤肉朝鲜家族', name_cn: '' })
  assert.equal(guideAttractionDisplayName(attraction, spot), '山顺烤肉')
  assert.equal(attraction.displayName, '  山顺烤肉  ')
  assert.equal(spot.name, '山顺炭火烤肉朝鲜家族')
  assert.equal(buildLocationPath(spot.name, spot.id), '/spot/spot-487')
  assert.equal(guideAttractionDisplayName({ displayName: 'Ningle Terrace' }, { name: 'Ningle Terrace', name_cn: '精灵露台' }), 'Ningle Terrace')
})

test('missing, empty or whitespace custom names fall back to canonical then existing fallback', () => {
  for (const displayName of [undefined, null, '', ' \t\n ']) {
    assert.equal(guideAttractionDisplayName({ displayName }, { name: 'English', name_cn: ' 中文 ' }), '中文')
    assert.equal(guideAttractionDisplayName({ displayName }, { name: 'English', name_cn: ' ' }), 'English')
    assert.equal(guideAttractionDisplayName({ displayName }, {}, '地点'), '地点')
  }
  assert.equal(guideAttractionDisplayName(undefined, {}), '')
})

test('daily and segmented renderers use the shared precedence for card title and image alt', () => {
  const daily = fs.readFileSync(new URL('../app/guide/[slug]/page.tsx', import.meta.url), 'utf8')
  const segment = fs.readFileSync(new URL('../components/GuideSegmentItinerarySection.tsx', import.meta.url), 'utf8')
  assert.match(daily, /attractionDisplayName: attraction\.displayName/)
  assert.equal(daily.split('guideAttractionDisplayName({ displayName: spot.attractionDisplayName }, spot)').length - 1, 2)
  assert.equal(segment.split('guideAttractionDisplayName(attraction, spot)').length - 1, 1)
  assert.match(daily, /<EntityName entity=\{\{ \.\.\.spot, displayName: spot.attractionDisplayName \}\} \/>/)
  assert.match(segment, /<EntityName entity=\{\{ \.\.\.spot, displayName: attraction.displayName \}\} \/>/)
  for (const source of [daily, segment]) {
    assert.match(source, /href=\{buildLocationPath\(spot\.name, spot\.id\)\}/)
    assert.doesNotMatch(source, /href=\{buildLocationPath\([^)]*displayName/)
  }
})
