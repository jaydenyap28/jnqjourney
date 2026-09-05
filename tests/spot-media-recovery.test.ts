import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { availability, assertNoGenericSpotPublish, buildMediaRecovery, safeUniqueImages, validateCandidate, validate449Pilot } from '../scripts/lib/spot-media-recovery.mjs'
import { verifySpotRevalidation } from '../lib/spot-media-revalidation.ts'

const row = JSON.parse(readFileSync(new URL('./fixtures/spot-449-authoritative-media.json', import.meta.url), 'utf8'))
const before = {
  schemaVersion: 1, source: { type: 'static-lightweight-location-snapshot' },
  spot: { id: 449, slug: 'spot-449', name: '上海外滩', description: 'Preserve public text exactly', latitude: 31.24002, longitude: 121.49073, region_id: 69,
    image_url: row.image_url, images: [row.image_url], video_url: null, facebook_video_url: null },
}
const make = () => buildMediaRecovery(before, row, '2026-09-05T00:00:00.000Z').candidate

test('Spot 449 fixture: independent cover + six authoritative gallery URLs = seven display items', () => {
  const candidate = make()
  const result = validate449Pilot(before, row, candidate)
  assert.equal(result.galleryCount, 6)
  assert.equal(result.uniqueDisplayCount, 7)
  assert.deepEqual(candidate.spot.images, row.images)
  assert.deepEqual(result.nonMediaDiff, [])
  assert.equal(result.nonMediaBeforeSha256, result.nonMediaAfterSha256)
  assert.equal(before.spot.images.length, 1)
})

test('lightweight source cannot masquerade as full detail media, even with correct images', () => {
  const candidate = make()
  candidate.source.type = 'static-lightweight-location-snapshot'
  assert.throws(() => validateCandidate(before, row, candidate), /lightweight/)
})

test('gallery count regression fails closed', () => {
  const candidate = make()
  candidate.spot.images = candidate.spot.images.slice(0, 1)
  assert.throws(() => validateCandidate(before, row, candidate), /count regression/)
})

test('missing authoritative URL fails closed even at the same count', () => {
  const candidate = make()
  candidate.spot.images[1] = row.image_url
  assert.throws(() => validateCandidate(before, row, candidate), /Missing authoritative/)
})

test('image order preservation fails on reordered gallery', () => {
  const candidate = make()
  candidate.spot.images.reverse()
  assert.throws(() => validateCandidate(before, row, candidate), /order/)
})

for (const field of ['image_url', 'video_url', 'facebook_video_url']) {
  test(`${field} preserves authoritative value`, () => {
    const candidate = make()
    assert.equal(candidate.spot[field], row[field])
    candidate.spot[field] = null
    assert.throws(() => validateCandidate(before, row, candidate), new RegExp(field))
  })
}

test('429 means unknown; neither 429 nor other HTTP failures delete authoritative URLs', () => {
  assert.equal(availability(429), 'unknown')
  assert.equal(availability(null), 'unknown')
  const statuses = row.images.map((_: string, i: number) => i === 0 ? 404 : 429)
  assert.equal(statuses.length, 6)
  // Builder deliberately has no HTTP-filter input or network dependency.
  assert.deepEqual(make().spot.images, row.images)
})

test('safe cover/gallery dedupe keeps a single cover and first occurrence order', () => {
  assert.deepEqual(safeUniqueImages([row.image_url, row.image_url]), [row.image_url])
  assert.deepEqual(safeUniqueImages([row.image_url, ...row.images, row.images[0]]), [row.image_url, ...row.images])
  assert.deepEqual(safeUniqueImages([row.image_url, `${row.image_url}#focus=20,30`]), [row.image_url])
})

test('external query variations and similar filenames are not merged', () => {
  const urls = ['https://example.com/image?id=1', 'https://example.com/image?id=2', 'https://example.com/image-1.jpg', 'https://example.com/image-1-copy.jpg']
  assert.deepEqual(safeUniqueImages(urls), urls)
})

test('authoritative existing duplicates are retained in the data, deduped only for display count', () => {
  const duplicateRow = { ...row, images: [row.image_url, row.image_url] }
  const { candidate, validation } = buildMediaRecovery(before, duplicateRow, '2026-09-05')
  assert.equal(candidate.spot.images.length, 2)
  assert.equal(validation.uniqueDisplayCount, 1)
})

test('missing authoritative images cannot be inferred from thumbnail or cover', () => {
  assert.throws(() => buildMediaRecovery(before, { ...row, images: undefined, thumbnail: row.image_url }, '2026-09-05'), /complete string array/)
})

test('any non-media semantic change blocks media-only recovery', () => {
  for (const [field, value] of Object.entries({ name: 'Other', description: 'New text', latitude: 0, region_id: 1, relations: [] })) {
    const candidate = make()
    candidate.spot[field] = value
    assert.throws(() => validateCandidate(before, row, candidate), /Non-media semantic change/)
  }
})

test('identity, provenance and snapshot envelope tampering fails closed', () => {
  const candidate = make()
  candidate.source.authoritativeMediaSha256 = 'bad'
  assert.throws(() => validateCandidate(before, row, candidate), /provenance/)
  assert.throws(() => validateCandidate(before, { ...row, id: 12 }, make()), /identity/)
  assert.throws(() => validateCandidate(before, { ...row, status: 'draft' }, make()), /status/)
  assert.throws(() => validateCandidate(before, row, { ...make(), unrelated: true }), /envelope/)
})

test('generic publisher blocks any Spot detail and index before uploads', () => {
  assert.throws(() => assertNoGenericSpotPublish(['public-data/spots/spot-449.json']), /cannot publish/)
  assert.throws(() => assertNoGenericSpotPublish(['public-data/spots/index.json']), /cannot publish/)
  assert.doesNotThrow(() => assertNoGenericSpotPublish(['public-data/guides.json']))
  const source = readFileSync('scripts/publish-public-snapshots-r2.mjs', 'utf8')
  assert.ok(source.indexOf('assertNoGenericSpotPublish(files') < source.indexOf('new PutObjectCommand'))
  assert.doesNotMatch(source, /readdirSync\(spotDir\)/)
})

test('lightweight builder is create-only, rejects replacement and never invents images from thumbnail', () => {
  const source = readFileSync('scripts/build-public-spot-fallbacks.mjs', 'utf8')
  assert.match(source, /if \(replaceLightweight\) throw new Error/)
  assert.match(source, /flag: 'wx'/)
  assert.doesNotMatch(source, /images:\s*location\.thumbnail/)
})

test('precise revalidation requires an authenticated fresh signed payload', () => {
  const now = Date.now(), secret = 'test-secret-only'
  const body = JSON.stringify({ slug: 'spot-449', sha256: 'a'.repeat(64), issuedAt: now })
  const signature = createHmac('sha256', secret).update(body).digest('hex')
  assert.equal(verifySpotRevalidation(body, signature, secret, now).slug, 'spot-449')
  assert.throws(() => verifySpotRevalidation(body, signature, 'wrong-secret', now))
  assert.throws(() => verifySpotRevalidation(body, signature, secret, now + 61000))
  assert.throws(() => verifySpotRevalidation(body, '', secret, now))
})

test('revalidation route cannot rebuild/write and only targets the requested Spot', () => {
  const source = readFileSync('app/api/admin/public-data/spots/[id]/revalidate/route.ts', 'utf8')
  assert.doesNotMatch(source, /PutObjectCommand|uploadPublic|supabase\.from|revalidateTag\('public-spots'\)/)
  assert.match(source, /revalidateTag\(`public-spot:\$\{payload.slug\}`\)/)
  assert.match(source, /PRIVATE_NO_STORE/)
})
