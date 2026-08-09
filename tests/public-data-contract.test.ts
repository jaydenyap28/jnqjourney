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
