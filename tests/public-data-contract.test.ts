import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import {
  createRequestDeduper,
  hasValidCoordinates,
  PRIVATE_NO_STORE,
  PUBLIC_CACHE_CONTROL,
  resolvePublicDataSources,
} from '../lib/public-data.ts'
import { resolvePublicSpotSources } from '../lib/public-spot.ts'

const root = process.cwd()
const read = (file: string) => readFile(path.join(root, file), 'utf8')

test('public locations snapshot has the lightweight schema', async () => {
  const payload = JSON.parse(await read('public-data/locations.json'))
  assert.equal(payload.schemaVersion, 1)
  assert.ok(payload.locations.length > 0)
  const allowed = ['category', 'id', 'latitude', 'longitude', 'name', 'region', 'shortSummary', 'slug', 'thumbnail']
  for (const location of payload.locations) {
    assert.deepEqual(Object.keys(location).sort(), allowed)
  }
})

test('Supabase quota errors fall back to the static snapshot', async () => {
  const fallback = { locations: [], regions: [] }
  const result = await resolvePublicDataSources({
    cdn: async () => null,
    supabase: async () => { throw new Error('exceed_egress_quota') },
    fallback: async () => fallback,
  })
  assert.equal(result.source, 'static-fallback')
  assert.equal(result.locations, fallback.locations)
})

test('Supabase timeouts fall back to the static snapshot', async () => {
  const result = await resolvePublicDataSources({
    cdn: async () => null,
    supabase: async () => { throw new Error('Supabase public data timed out') },
    fallback: async () => ({ locations: [], regions: [] }),
  })
  assert.equal(result.source, 'static-fallback')
})

test('invalid coordinates are rejected without failing the dataset', async () => {
  assert.equal(hasValidCoordinates({ latitude: 91, longitude: 10 }), false)
  assert.equal(hasValidCoordinates({ latitude: 1.5, longitude: 103.7 }), true)
  const payload = JSON.parse(await read('public-data/locations.json'))
  assert.ok(payload.locations.every(hasValidCoordinates))
})

test('public read paths contain no select-star query', async () => {
  const files = [
    'app/api/locations/route.ts',
    'app/api/regions/route.ts',
    'app/api/guides/route.ts',
    'app/api/affiliate-links/route.ts',
    'lib/server/public-data-resolver.ts',
    'lib/server/public-location-data.ts',
    'lib/server/travel-packages.ts',
    'lib/server/guide-budget-store.ts',
  ]
  for (const file of files) {
    const source = await read(file)
    assert.doesNotMatch(source, /\.select\([\s\S]*?['"`]\s*\*/, file)
  }
})

test('duplicate callers share one in-flight request', async () => {
  let calls = 0
  let release!: () => void
  const pending = new Promise<void>((resolve) => { release = resolve })
  const load = createRequestDeduper(async () => { calls += 1; await pending; return calls })
  const first = load()
  const second = load()
  assert.equal(first, second)
  assert.equal(calls, 1)
  release()
  assert.equal(await first, 1)
})

test('SSR data is passed to the client without an automatic hydration fetch', async () => {
  const [page, client] = await Promise.all([read('app/page.tsx'), read('components/HomePageClient.tsx')])
  assert.match(page, /resolvePublicData\(\)/)
  assert.match(page, /initialLocations=\{locations\}/)
  assert.doesNotMatch(client, /useEffect\([\s\S]{0,300}fetchPublicData\(/)
})

test('public cache header contract is stable', () => {
  assert.equal(PUBLIC_CACHE_CONTROL, 'public, s-maxage=3600, stale-while-revalidate=86400')
})

test('admin writes remain private and no-store', async () => {
  assert.equal(PRIVATE_NO_STORE, 'private, no-store, max-age=0')
  const sources = await Promise.all([
    read('app/api/admin/guides/route.ts'),
    read('app/api/admin/public-data/snapshot/route.ts'),
  ])
  assert.ok(sources.every((source) => source.includes('PRIVATE_NO_STORE')))
})

test('Guide writes revalidate collection and slug-specific cache tags', async () => {
  const source = await read('app/api/admin/guides/route.ts')
  assert.match(source, /revalidateTag\('guides'\)/)
  assert.match(source, /revalidateTag\(`guide:\$\{payload\.slug\}`\)/)
  assert.match(source, /revalidatePath\('\/api\/guides'\)/)
})

test('Longform public recovery has collection and slug revalidation without invoking save', async () => {
  const [route, store] = await Promise.all([
    read('app/api/admin/notes/route.ts'),
    read('lib/server/public-content-store.ts'),
  ])
  assert.match(route, /rawPayload\?\.action === 'revalidate-public'/)
  assert.match(route, /revalidateTag\(`note:\$\{slug\}`\)/)
  assert.match(store, /tags: \['notes', `note:\$\{slug\}`\]/)
  const recoveryBranch = route.slice(route.indexOf("rawPayload?.action === 'revalidate-public'"), route.indexOf('const previousSlug'))
  assert.doesNotMatch(recoveryBranch, /saveNotes\(/)
})

test('public Spot snapshots use the detail schema without private fields', async () => {
  const index = JSON.parse(await read('public-data/spots/index.json'))
  assert.equal(index.schemaVersion, 1)
  assert.equal(index.slugs.length, 547)
  assert.ok(index.slugs.includes('tachuan-academy-806'))
  const payload = JSON.parse(await read('public-data/spots/tachuan-academy-806.json'))
  assert.equal(payload.schemaVersion, 1)
  assert.equal(payload.spot.id, 806)
  assert.equal(payload.spot.slug, 'tachuan-academy-806')
  assert.match(payload.spot.description, /塔川书院/)
  assert.match(payload.spot.image_url, /\.r2\.dev\//)
  for (const forbidden of ['admin_notes', 'review_status', 'hmac', 'internal_audit']) {
    assert.equal(Object.hasOwn(payload.spot, forbidden), false)
  }
})

test('Supabase Spot quota failure falls back to a compatible snapshot', async () => {
  const fallback = JSON.parse(await read('public-data/spots/tachuan-academy-806.json')).spot
  const result = await resolvePublicSpotSources({
    cdn: async () => ({ status: 'not-found' }),
    supabase: async () => ({ status: 'failure', error: new Error('exceed_egress_quota') }),
    fallback: async () => ({ status: 'found', spot: fallback }),
  })
  assert.equal(result.status, 'found')
  assert.equal(result.status === 'found' && result.source, 'static-fallback')
  assert.equal(result.status === 'found' && result.spot.id, 806)
})

test('Supabase Spot timeout falls back instead of becoming not found', async () => {
  const fallback = JSON.parse(await read('public-data/spots/tachuan-academy-806.json')).spot
  const result = await resolvePublicSpotSources({
    cdn: async () => ({ status: 'failure', error: new Error('CDN timeout') }),
    supabase: async () => { throw new Error('Supabase public spot timed out') },
    fallback: async () => ({ status: 'found', spot: fallback }),
  })
  assert.equal(result.status, 'found')
  assert.equal(result.status === 'found' && result.source, 'static-fallback')
})

test('only authoritative zero rows plus a missing snapshot becomes 404', async () => {
  const missing = await resolvePublicSpotSources({
    cdn: async () => ({ status: 'not-found' }),
    supabase: async () => ({ status: 'not-found' }),
    fallback: async () => ({ status: 'not-found' }),
  })
  assert.equal(missing.status, 'not-found')

  const unavailable = await resolvePublicSpotSources({
    cdn: async () => ({ status: 'not-found' }),
    supabase: async () => ({ status: 'failure', error: new Error('network error') }),
    fallback: async () => ({ status: 'not-found' }),
  })
  assert.equal(unavailable.status, 'unavailable')

  const snapshotConfirmedMissing = await resolvePublicSpotSources({
    cdn: async () => ({ status: 'not-found' }),
    supabase: async () => ({ status: 'failure', error: new Error('network error') }),
    fallback: async () => ({ status: 'not-found', authoritative: true }),
  })
  assert.equal(snapshotConfirmedMissing.status, 'not-found')
})

test('Spot CDN hit performs zero Supabase calls', async () => {
  const fallback = JSON.parse(await read('public-data/spots/tachuan-academy-806.json')).spot
  let supabaseCalls = 0
  const result = await resolvePublicSpotSources({
    cdn: async () => ({ status: 'found', spot: fallback }),
    supabase: async () => { supabaseCalls += 1; return { status: 'not-found' } },
    fallback: async () => ({ status: 'not-found' }),
  })
  assert.equal(result.status, 'found')
  assert.equal(result.status === 'found' && result.source, 'cdn-cache')
  assert.equal(supabaseCalls, 0)
})

test('Spot public query is exact, field-whitelisted, and related Spots reuse public data', async () => {
  const [resolver, locations] = await Promise.all([
    read('lib/server/public-spot-resolver.ts'),
    read('lib/server/public-location-data.ts'),
  ])
  assert.doesNotMatch(resolver, /\.select\([\s\S]*?['"`]\s*\*/)
  assert.match(resolver, /\.eq\('id', id\)/)
  assert.match(resolver, /\.maybeSingle\(\)/)
  assert.doesNotMatch(resolver, /\.order\(/)
  const relatedBody = locations.slice(locations.indexOf('export async function fetchRelatedLocations'), locations.indexOf('export async function fetchRegionBySlug'))
  assert.match(relatedBody, /resolvePublicData\(\)/)
  assert.doesNotMatch(relatedBody, /\.from\(/)
})

test('Spot API and admin refresh preserve cache contracts', async () => {
  const [publicRoute, adminRoute, page, middleware] = await Promise.all([
    read('app/api/spots/[slug]/route.ts'),
    read('app/api/admin/public-data/spots/[id]/route.ts'),
    read('app/spot/[slug]/page.tsx'),
    read('middleware.ts'),
  ])
  assert.match(publicRoute, /PUBLIC_CACHE_CONTROL/)
  assert.match(publicRoute, /X-JNQ-Data-Source/)
  assert.match(adminRoute, /PRIVATE_NO_STORE/)
  assert.match(adminRoute, /revalidateTag\(`public-spot:\$\{spot\.slug\}`\)/)
  assert.match(page, /data-jnq-data-source=\{resolved\.source\}/)
  assert.match(middleware, /response\.status === 404/)
  assert.match(middleware, /status: 404/)
  assert.match(middleware, /'\/spot\/:path\*'/)
})
