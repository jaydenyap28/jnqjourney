import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { migrateLegacyGuideAttractionsUnique } from '../lib/guide-legacy-migration.ts'
import { EAST_COAST_SEMANTIC_HASH, planEastCoastMigration, validateEastCoastCanonical, guideSemanticHash } from '../lib/east-coast-guide-migration.ts'

test('punctuation normalization uniquely binds Steven while preserving the original displayName', () => {
  const refs = migrateLegacyGuideAttractionsUnique({ linkedSpots: ['Steven’s Coffee House'] }, [{ id: 218, name: "Steven's Coffee House" }])
  assert.deepEqual(refs, [{ spotId: 218, spotSlug: 'steven-s-coffee-house-218', displayOrder: 0, enabled: true, displayName: 'Steven’s Coffee House' }])
})

test('punctuation-normalized collision fails closed even if one name is verbatim', () => {
  assert.throws(() => migrateLegacyGuideAttractionsUnique({ linkedSpots: ['Steven’s Coffee House'] }, [
    { id: 218, name: "Steven's Coffee House" }, { id: 999, name: 'Steven’s Coffee House' },
  ]), /2 matching Spots/)
})

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/east-coast-authoritative-before.json', import.meta.url), 'utf8'))
const index = JSON.parse(fs.readFileSync(new URL('../public-data/spots/index.json', import.meta.url), 'utf8'))
const locations = index.slugs.map((slug: string) => JSON.parse(fs.readFileSync(new URL(`../public-data/spots/${slug}.json`, import.meta.url), 'utf8')).spot)

test('East Coast 69 canonical refs preserve names, order, semantic hash and clear linkedSpots', () => {
  const before = JSON.stringify(fixture)
  const { after, validation } = planEastCoastMigration(fixture, locations)
  assert.equal(JSON.stringify(fixture), before)
  assert.equal(after.days.length, 10)
  assert.equal(after.days.flatMap((d: any) => d.attractions).length, 69)
  assert.equal(after.days.flatMap((d: any) => d.linkedSpots).length, 0)
  assert.equal(guideSemanticHash(after), EAST_COAST_SEMANTIC_HASH)
  assert.equal(validation.semanticChanges, 0)
  for (const [index, day] of after.days.entries()) {
    assert.deepEqual(day.attractions.map((a: any) => a.displayName), fixture.days[index].linkedSpots)
    assert.deepEqual(day.attractions.map((a: any) => a.displayOrder), day.attractions.map((_: any, i: number) => i))
  }
})

test('canonical contract rejects lost refs, order drift, changed itinerary and parallel arrays', () => {
  const { after } = planEastCoastMigration(fixture, locations)
  for (const mutate of [
    (g: any) => g.days[0].attractions.pop(),
    (g: any) => g.days[0].attractions.reverse(),
    (g: any) => { g.days[0].summary += ' changed' },
    (g: any) => { g.days[0].linkedSpots = ['legacy'] },
    (g: any) => { g.days[3].attractions[4].spotId = 999 },
  ]) {
    const changed = structuredClone(after)
    mutate(changed)
    assert.throws(() => validateEastCoastCanonical(changed))
  }
})
