import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { confirmedSpotAliases, planSpotInvalidation, resolveSpotSnapshotSlug } from '../lib/spot-media-revalidation.ts'

const index = { schemaVersion: 1, slugs: ['spot-449', 'spot-450'] }
const snapshot = { schemaVersion: 1, spot: { id: 449, slug: 'spot-449', name: '上海外滩' } }
const aliases = confirmedSpotAliases({ '449': 'the-bund-shanghai', '450': 'other' }, snapshot.spot)
const plan = (slug: string) => planSpotInvalidation(449, slug, resolveSpotSnapshotSlug(449, index), snapshot, aliases)

test('ID and canonical alias refresh resolve the same unique snapshot and invalidate both identities', () => {
  assert.deepEqual(plan('spot-449'), plan('the-bund-shanghai-449'))
  assert.equal(plan('spot-449').snapshotSlug, 'spot-449')
  assert.deepEqual(plan('spot-449').tags, ['public-spot:spot-449', 'public-spot:the-bund-shanghai-449'])
  assert.deepEqual(plan('spot-449').paths, ['/spot/spot-449', '/api/spots/spot-449', '/spot/the-bund-shanghai-449', '/api/spots/the-bund-shanghai-449'])
})
test('unknown, wrong-ID and arbitrary path/tag aliases fail closed', () => {
  for (const slug of ['unknown-449', 'other-450', '../spot-449', 'spot-449?tag=public-spots', 'spot-449/../../', 'public-spots']) assert.throws(() => plan(slug))
})
test('missing snapshot and multiple snapshot identities fail before refresh', () => {
  assert.throws(() => resolveSpotSnapshotSlug(449, { schemaVersion: 1, slugs: [] }))
  assert.throws(() => resolveSpotSnapshotSlug(449, { schemaVersion: 1, slugs: ['spot-449', 'alias-449'] }))
})
test('alias collision and conflicting owner fail closed', () => {
  assert.throws(() => planSpotInvalidation(449, 'the-bund-shanghai-449', 'spot-449', snapshot, [...aliases, { spotId: 450, slug: 'the-bund-shanghai-449' }]))
  assert.throws(() => planSpotInvalidation(449, 'spot-449', 'spot-449', snapshot, [...aliases, { spotId: 450, slug: 'the-bund-shanghai-449' }]))
})
test('R2 read-back Spot ID or slug mismatch fails closed', () => {
  assert.throws(() => planSpotInvalidation(449, 'spot-449', 'spot-449', { ...snapshot, spot: { ...snapshot.spot, id: 450 } }, aliases))
  assert.throws(() => planSpotInvalidation(449, 'spot-449', 'spot-449', { ...snapshot, spot: { ...snapshot.spot, slug: 'wrong-449' } }, aliases))
})
test('refresh endpoint has no R2/Supabase writes, alias JSON requirement, or global purge', () => {
  const source = readFileSync('app/api/admin/public-data/spots/[id]/revalidate/route.ts', 'utf8')
  assert.doesNotMatch(source, /PutObjectCommand|\.upload\(|\.upsert\(|\.update\(\{|\.insert\(|\.delete\(|revalidateTag\('public-spots'\)/)
  assert.doesNotMatch(source, /spots\/\$\{payload.slug\}\.json/)
  assert.match(source, /resolveSpotSnapshotSlug/)
  assert.match(source, /confirmedSpotAliases/)
  assert.ok(source.indexOf('const plan = planSpotInvalidation') < source.indexOf('revalidateTag(tag)'))
})
