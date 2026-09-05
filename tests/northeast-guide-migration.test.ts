import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { migrateLegacyGuideAttractionsUnique } from '../lib/guide-legacy-migration.ts'
import { NORTHEAST_SLUG, NORTHEAST_SEMANTIC_HASH, NORTHEAST_IDS, migrateReviewedNortheastDay, planNortheastMigration, validateNortheastCanonical } from '../lib/northeast-guide-migration.ts'
import { guideSemanticHash } from '../lib/east-coast-guide-migration.ts'

const reviewed = { id: 487, name: '山顺炭火烤肉朝鲜家族' }
test('reviewed override is scoped to exact Guide and legacyName; global matcher stays closed', () => {
  assert.equal(migrateReviewedNortheastDay(NORTHEAST_SLUG, { linkedSpots: ['山顺烤肉'] }, [reviewed])[0].spotId, 487)
  assert.throws(() => migrateReviewedNortheastDay('another-guide', { linkedSpots: ['山顺烤肉'] }, [reviewed]), /no matching Spot/)
  for (const name of ['山顺', '山顺烤肉 ', '山顺餐馆']) {
    assert.throws(() => migrateReviewedNortheastDay(NORTHEAST_SLUG, { linkedSpots: [name] }, [reviewed]), /no matching Spot/)
  }
  assert.throws(() => migrateLegacyGuideAttractionsUnique({ linkedSpots: ['山顺烤肉'] }, [reviewed]), /no matching Spot/)
})
test('ambiguous normal names and conflicting reviewed names fail closed', () => {
  assert.throws(() => migrateReviewedNortheastDay(NORTHEAST_SLUG, { linkedSpots: ['Test'] }, [{ id: 1, name: 'Test' }, { id: 2, name: 'TEST' }]), /2 matching Spots/)
  assert.throws(() => migrateReviewedNortheastDay(NORTHEAST_SLUG, { linkedSpots: ['山顺烤肉'] }, [reviewed, { id: 9, name: '山顺烤肉' }]), /conflicts/)
})
test('missing, duplicate or changed reviewed Spot identity fails', () => {
  for (const locations of [[], [reviewed, reviewed], [{ ...reviewed, name: 'Another restaurant' }]]) {
    assert.throws(() => migrateReviewedNortheastDay(NORTHEAST_SLUG, { linkedSpots: ['山顺烤肉'] }, locations))
  }
})
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/northeast-authoritative-before.json', import.meta.url), 'utf8'))
const locations = NORTHEAST_IDS.flat().map(id => JSON.parse(fs.readFileSync(new URL(`../public-data/spots/spot-${id}.json`, import.meta.url), 'utf8')).spot)
test('Northeast 27 canonical attractions preserve displayName, order, protected data and semantic hash', () => {
  const original = JSON.stringify(fixture)
  const { after, validation } = planNortheastMigration(fixture, locations)
  assert.equal(JSON.stringify(fixture), original)
  assert.equal(after.days.length, 11)
  assert.deepEqual(after.days.map((d: any) => d.attractions.length), [5,4,1,2,3,2,4,1,1,3,1])
  assert.equal(after.days.flatMap((d: any) => d.attractions).length, 27)
  assert.equal(after.days.flatMap((d: any) => d.linkedSpots).length, 0)
  assert.equal(guideSemanticHash(after), NORTHEAST_SEMANTIC_HASH)
  assert.equal(validation.semanticChanges, 0)
  for (const [i, day] of after.days.entries()) {
    assert.deepEqual(day.attractions.map((a: any) => a.displayName), fixture.days[i].linkedSpots)
    assert.deepEqual(day.attractions.map((a: any) => a.displayOrder), day.attractions.map((_: any, n: number) => n))
    const { attractions, linkedSpots, ...rest } = day
    const { linkedSpots: legacy, ...beforeRest } = fixture.days[i]
    assert.deepEqual(rest, beforeRest)
  }
  assert.deepEqual(after.days[4].attractions[0], { spotId: 487, spotSlug: 'spot-487', displayOrder: 0, enabled: true, displayName: '山顺烤肉' })
})
test('contracts reject parallel arrays, semantic changes, ID/slug/order changes and rerun', () => {
  const { after } = planNortheastMigration(fixture, locations)
  for (const mutate of [
    (g: any) => g.days[0].attractions.pop(),
    (g: any) => g.days[0].attractions.reverse(),
    (g: any) => { g.days[4].attractions[0].displayName = reviewed.name },
    (g: any) => { g.days[4].attractions[0].spotSlug = 'spot-488' },
    (g: any) => { g.days[0].summary += ' changed' },
    (g: any) => { g.days[0].linkedSpots = ['legacy'] },
  ]) {
    const changed = structuredClone(after); mutate(changed)
    assert.throws(() => validateNortheastCanonical(changed))
  }
  assert.throws(() => planNortheastMigration(after, locations), /27 legacy refs/)
})
