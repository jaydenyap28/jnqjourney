import assert from 'node:assert/strict'
import test from 'node:test'
import { makeJob, projectPublication } from '../cloudflare/admin-preview/publication.mjs'
import { budgetBlockedUntil } from '../scripts/cloudflare/publication-budget.mjs'

const version = '2026-11-11T10:00:00.000Z'
const asset = 'a'.repeat(64) + '.png'
const spot = { id: 95000, name: 'Example Spot', updated_at: version, status: 'active', publication_status: 'published',
  image_url: '/admin-draft-media/' + asset, review_jayden: 'Never copy this field' }
const note = { slug: 'example-note', title: 'Example Note', updatedAt: version, published: true,
  blocks: [{ type: 'spot', spotId: 95001, title: 'Unapproved private relation' }] }
const guide = { slug: 'example-guide', title: 'Example Guide', updatedAt: version,
  days: [{ title: 'A day', attractions: [{ spotId: 95000 }, { spotId: 95001 }] }] }
const sources = { spots: [spot], notes: [note], guides: [guide] }
const pick = (kind, key) => ({ kind, key, version })
const picks = [pick('spot', '95000'), pick('note', 'example-note'), pick('guide', 'example-guide')]

test('explicit approved selection is deterministic, excludes drafts and private relation fields', async () => {
  const first = await makeJob(sources, picks)
  const second = await makeJob(sources, [...picks].reverse())
  assert.equal(first.id, second.id)
  assert.deepEqual(first.projection.media, [asset])
  assert.deepEqual(first.projection.records.find(row => row.kind === 'note').blocks, [])
  assert.deepEqual(first.projection.records.find(row => row.kind === 'guide').days[0].spotIds, [95000])
  assert.ok(!JSON.stringify(first.projection).includes('Never copy this field'))
})

test('stale, hidden, and draft versions cannot be queued', () => {
  assert.throws(() => projectPublication(sources, [{ ...picks[0], version: 'wrong' }]), { status: 409 })
  assert.throws(() => projectPublication({ ...sources, spots: [{ ...spot, publication_status: 'hidden' }] }, picks), { status: 409 })
  assert.throws(() => projectPublication({ ...sources, notes: [{ ...note, published: false }] }, picks), { status: 409 })
})

test('withdrawal removes the page, its unique media, and related Guide link', () => {
  const result = projectPublication(sources, picks.slice(1))
  assert.equal(result.records.length, 2)
  assert.deepEqual(result.media, [])
  assert.deepEqual(result.records.find(row => row.kind === 'guide').days[0].spotIds, [])
})

test('legacy URLs are not copied into this isolated release', () => {
  assert.throws(() => projectPublication({ ...sources, spots: [{ ...spot, image_url: 'https://example.com/photo.jpg' }] }, picks), { status: 422 })
})

test('runner enforces cooldown, daily cap, and monthly cap independently', () => {
  const now = Date.parse('2026-11-11T12:00:00.000Z')
  const attempt = startedAt => ({ startedAt })
  assert.equal(budgetBlockedUntil([attempt('2026-11-11T11:55:00.000Z')], now), '2026-11-11T12:05:00.000Z')
  assert.equal(budgetBlockedUntil(Array(8).fill(attempt('2026-11-11T09:00:00.000Z')), now), '2026-11-12T00:00:00.000Z')
  assert.equal(budgetBlockedUntil(Array(240).fill(attempt('2026-11-01T09:00:00.000Z')), now), '2026-12-01T00:00:00.000Z')
  assert.equal(budgetBlockedUntil([attempt('2026-11-11T11:50:00.000Z')], now), null)
})
