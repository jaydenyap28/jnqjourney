import assert from 'node:assert/strict'
import test from 'node:test'
import { createSnapshotGateway, projectionHash, ORIGIN, SOURCE, SPOT_ID, SLUG, ZH, EN } from '../../cloudflare/spot-loop/snapshot-gateway.mjs'
import { PUBLIC_SPOT_FIELDS } from '../../cloudflare/spot-loop/publication-gate.mjs'

// Tests the gateway given trusted projection outcomes. This does not execute SQL.
const row = { ...Object.fromEntries(PUBLIC_SPOT_FIELDS.map(field => [field, null])), id: SPOT_ID,
  name: 'Local synthetic Spot', status: 'active', publication_status: 'published', updated_at: '2026-11-10T00:00:00Z',
  image_url: '/media/candidate/92061/00000000-0000-4000-8000-000000000000.png', images: [] }
const buildId = 'synthetic-build'
const data = `/_next/data/${buildId}${EN}.json`
const media = row.image_url
const routes = [ ['/', 503], [ZH, 404], [ZH + '?_rsc=gate', 404, { RSC: '1' }],
  [EN, 404], [data, 404], ['/api/locations', 503], [`/api/spots/${SLUG}`, 404],
  [`/spot/spot-${SPOT_ID}`, 404], [`/en/spot/spot-${SPOT_ID}`, 404], [media, 404] ]
const env = { SUPABASE_URL: SOURCE, SUPABASE_SERVICE_ROLE_KEY: 'LOCAL_SYNTHETIC_ONLY', SNAPSHOT_BUILD_ID: buildId,
  SNAPSHOT_PREFIX: 'snapshot-poc/1794299242468', SNAPSHOT_EXPIRES_AT: String(Math.floor(Date.now() / 1000) + 1200) }

test('every content representation rejects an ineligible trusted projection before R2 access', async () => {
  for (const state of ['hidden', 'closed', 'withdrawn']) {
    let reads = 0
    const gateway = createSnapshotGateway(async () => Response.json([]))
    for (const [route, status, headers] of routes) {
      const response = await gateway.fetch(new Request(ORIGIN + route, { headers }), { ...env, TEST_MEDIA: { get() { reads++; throw Error('PRIVATE_OBJECT_READ') } } })
      assert.equal(response.status, status, state + ' ' + route)
      assert.match(response.headers.get('cache-control'), /no-store/)
    }
    assert.equal(reads, 0)
  }
})

test('unknown, old content and query variants cannot address private snapshots', async () => {
  const gateway = createSnapshotGateway(() => { throw Error('UNEXPECTED_UPSTREAM_ACCESS') })
  for (const pathname of [ZH + '.html', ZH + '.rsc', '/_next/data/old-build' + EN + '.json',
    ZH + '?select=review_jayden', '/snapshot-poc/1794299242468/private/home-html', '/spot/unknown-92061']) {
    assert.equal((await gateway.fetch(new Request(ORIGIN + pathname), env)).status, 404)
  }
})

test('Next 14 RSC MIME is exact, native object version mismatch and source failure reject bytes', async () => {
  const revision = await projectionHash(row)
  const entry = { sha256: 'a'.repeat(64), bytes: 8, etag: 'synthetic-etag', version: 'synthetic-native-version' }
  const manifest = { buildId, spotId: SPOT_ID, updatedAt: row.updated_at, revision, objects: { 'zh-rsc': entry } }
  let version = entry.version
  const bucket = { async get(key) { return key.endsWith('/manifest.json') ? { size: 800, json: async () => manifest } : {
    version, etag: entry.etag, size: entry.bytes, body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('snapshot')); c.close() } }),
  } } }
  const gateway = createSnapshotGateway(async () => Response.json([row]))
  const request = () => new Request(ORIGIN + ZH + '?_rsc=test', { headers: { RSC: '1' } })
  let response = await gateway.fetch(request(), { ...env, TEST_MEDIA: bucket })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'text/x-component')
  assert.equal(await response.text(), 'snapshot')
  version = 'replaced-native-version'
  response = await gateway.fetch(request(), { ...env, TEST_MEDIA: bucket })
  assert.equal(response.status, 503)
  assert.equal(await response.text(), 'Publication snapshot unavailable')
  const failed = createSnapshotGateway(async () => new Response(null, { status: 503 }))
  assert.equal((await failed.fetch(request(), { ...env, TEST_MEDIA: bucket })).status, 503)
})
