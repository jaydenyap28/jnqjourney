import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
// Execute the real changed modules with isolated, offline dependency seams.
function load(file: string, mocks: Record<string, any>, globals: Record<string, any> = {}) {
  const context = { exports: {} as any, process, console, URL, Buffer, AbortSignal, setTimeout, clearTimeout, ...globals,
    require: (id: string) => {
      if (id in mocks) return mocks[id]
      if (id === '@/lib/internal-http') return require('../lib/internal-http.ts')
      if (id === 'server-only') return {}
      if (id.startsWith('@/')) throw new Error(`Missing offline mock: ${id}`)
      return require(id)
    } }
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText, context, { filename: file })
  return context.exports
}

test('Sitemap shares one slug map and one English collection, keeps completeness checks and canonical overrides', async () => {
  let mapReads = 0, englishReads = 0, eligibilityChecks = 0, packageReads = 0
  const slugMap: Record<string, string> = { '1': 'custom' }
  const collection = { localization: { records: [
    { canonicalPath: '/spot/custom-1', translationStatus: 'complete' },
    { canonicalPath: '/spot/place-2', translationStatus: 'complete' },
    { canonicalPath: '/spot/place-3', translationStatus: 'partial' },
  ] } }
  const loaded = load('app/sitemap.ts', {
    '@/lib/region-routing': { buildRegionPath: () => '/region/example-1' },
    '@/lib/site': { absoluteUrl: (s: string) => `https://example.test${s}` },
    '@/lib/server/location-slugs-store': {
      readLocationSlugMap: async () => { mapReads++; return slugMap },
      buildCanonicalLocationPath: async (_name: string, id: number, map: any) => {
        assert.equal(map, slugMap)
        return `/spot/${map[id] || 'place'}-${id}`
      },
    },
    '@/lib/server/public-location-data': {
      fetchAllLocationsForSitemap: async () => Array.from({ length: 547 }, (_, i) => ({ id: i + 1, name: 'place' })),
      fetchAllRegionsForSitemap: async () => [],
    },
    '@/lib/server/public-content-store': { readPublicGuides: async () => [], readPublicNotes: async () => [] },
    '@/lib/server/travel-packages': { readPublishedPackages: async () => { packageReads++; return [] } },
    '@/lib/server/english-page-data': {
      readEnglishCollections: async () => { englishReads++; return collection },
      englishPageData: async (parts: string[], _fresh: boolean, options: any) => {
        eligibilityChecks++
        assert.equal(options.collection, collection)
        assert.equal(options.includePackages, false)
        return { data: { status: parts[1] === 'custom-1' ? 'complete' : 'partial' } }
      },
    },
  })
  const routes = await loaded.default()
  assert.equal(mapReads, 1)
  assert.equal(englishReads, 1)
  assert.equal(packageReads, 1)
  assert.equal(eligibilityChecks, 2)
  assert.ok(routes.some((r: any) => r.url === 'https://example.test/spot/custom-1' && r.alternates))
  assert.ok(routes.some((r: any) => r.url === 'https://example.test/en/spot/custom-1'))
  assert.ok(!routes.some((r: any) => r.url === 'https://example.test/en/spot/place-2'))
})

test('explicit canonical map performs zero Storage reads, including an empty map', async () => {
  let reads = 0
  const store = load('lib/server/location-slugs-store.ts', {
    '@supabase/supabase-js': { createClient: () => { reads++; throw new Error('Storage must not run') } },
    '@/lib/location-routing': { slugifyLocationName: (s: string) => s.toLowerCase() },
  })
  assert.equal(await store.buildCanonicalLocationPath('Name', 1, { '1': 'custom' }), '/spot/custom-1')
  assert.equal(await store.buildCanonicalLocationPath('Name', 2, {}), '/spot/name-2')
  assert.equal(reads, 0)
})

test('real English eligibility renderer reuses the supplied collection and skips unrelated package queries', async () => {
  let packageReads = 0
  const collection = { locations: [], snapshotSlugs: {}, guides: [], localization: { records: [] },
    regions: [{ id: 1, slug: 'region-1', name: 'Region', shortSummary: 'Summary', parentId: null }] }
  const loaded = load('lib/server/english-page-data.ts', {
    '@/lib/publication-version': { publicationVersion: () => 'fixture-version' },
    '@/lib/server/guides-store': { normalizeGuidePayload: (v: any) => v },
    '@/lib/server/notes-store': { normalizeNotePayload: (v: any) => v },
    '@/lib/server/guide-price-highlights-store': {},
    '@/lib/content-relations': {},
    '@/lib/server/travel-packages': { readPublishedPackagesUncached: async () => { packageReads++; return [] } },
    '@/lib/guide-price-highlights': {},
    '@/lib/guide-budget': {},
    '@/lib/localization': { localizationRecord: () => null, applyLocalization: (value: any) => ({ value, status: 'complete' }) },
    '@/lib/entity-display-name': { resolveEntityDisplayName: (v: any) => ({ primary: v.name }) },
    '@/lib/public-region-media': {},
    '@/lib/server/public-content-media': {},
    './localization-snapshot': { readBilingualSnapshot: () => { throw new Error('Collection must be reused') } },
    '@/lib/homepage-localization': {},
  })
  const result = await loaded.englishPageData(['region', 'region-1'], false, { collection, includePackages: false })
  assert.equal(result.data.status, 'complete')
  assert.equal(result.data.title, 'Region')
  assert.equal(packageReads, 0)
  await loaded.englishPageData(['region', 'region-1'], false, { collection })
  assert.equal(packageReads, 1) // Normal page rendering retains its package cards.
})

test('Guide and Note detail reads share collection downloads and retain alias/filter/invalidation behavior', async () => {
  let guideLoads = 0, noteLoads = 0
  const entries = new Map<string, Promise<unknown>>()
  const store = load('lib/server/public-content-store.ts', {
    'next/cache': { unstable_cache: (fn: any, key: string[]) => () => {
      const id = key.join(':')
      if (!entries.has(id)) entries.set(id, Promise.resolve().then(fn))
      return entries.get(id)
    } },
    '@/lib/guide-publication': { freshGuideSnapshotUrl: () => { throw new Error('No CDN configured') } },
    '@/lib/server/guides-store': { readGuides: async () => { guideLoads++; return [{ slug: 'a', aliases: ['old-a'] }, { slug: 'b' }] }, normalizeGuidePayload: (v: any) => v },
    '@/lib/server/notes-store': { readPublishedNotes: async () => { noteLoads++; return [{ slug: 'n', aliases: ['old-n'] }, { slug: 'm' }] }, normalizeNotePayload: (v: any) => v },
  }, { process: { env: {} } })
  assert.equal((await store.readPublicGuideBySlug('old-a')).slug, 'a')
  assert.equal((await store.readPublicGuideBySlug('b')).slug, 'b')
  assert.equal(await store.readPublicGuideBySlug('missing'), null)
  assert.equal((await store.readPublicNoteBySlug('old-n')).slug, 'n')
  assert.equal((await store.readPublicNoteBySlug('m')).slug, 'm')
  assert.equal(guideLoads, 1)
  assert.equal(noteLoads, 1)
  assert.deepEqual([...entries.keys()], ['public-guides-v4','public-notes-v3'])
  entries.clear() // Model the existing Admin collection + per-slug tag purge.
  await store.readPublicGuideBySlug('a')
  assert.equal(guideLoads, 2)
})

test('Spot routing checks visibility first; redirect/hidden skips detail; errors never publish a page', async () => {
  let routing: any = { visible: true }, detail: any = { source: 'cdn-cache' }, reads = 0
  const route = load('app/api/spot-routing/[slug]/route.ts', {
    '@/lib/location-routing': { extractLocationIdFromSlug: () => 1 },
    '@/lib/server/spot-routing': { readSpotRouting: async () => routing },
    '@/lib/server/public-spot-resolver': { getPublicSpotBySlug: async () => { reads++; if (detail instanceof Error) throw detail; return detail } },
    '@/lib/server/localization-snapshot': { readLocalizationSnapshot: async () => ({ records: [] }) },
    '@/lib/localization': { applyLocalization: () => ({ status: 'missing' }), localizationRecord: () => null },
  })
  const get = () => route.GET(new Request('http://localhost'), { params: { slug: 'test-1' } })
  assert.equal((await get()).headers.get('X-JNQ-Data-Source'), 'cdn-cache')
  routing = { visible: false }
  assert.equal((await get()).status, 200)
  routing = { destination: '/notes/new', status: 301 }
  assert.equal((await (await get()).json()).destination, '/notes/new')
  assert.equal(reads, 1)
  routing = { visible: true }
  detail = null
  assert.equal((await get()).status, 404)
  detail = new Error('Unavailable')
  const failed = await get()
  assert.equal(failed.status, 503)
  assert.equal(failed.headers.get('cache-control'), 'no-store')
})

test('Spot Middleware makes one HTTP request and preserves redirect, hidden, missing, outage and source behavior', async () => {
  const { NextRequest } = require('next/server')
  let body: any = { visible: true }, status = 200, calls = 0
  const middleware = load('middleware.ts', {}, { fetch: async (url: URL, options: any) => {
    calls++
    assert.match(url.pathname, /^\/api\/spot-routing\//)
    assert.equal(options.cache, 'no-store')
    return Response.json(body, { status, headers: { 'X-JNQ-Data-Source': 'static-fallback' } })
  } }).middleware
  for (const pathname of ['/spot/old-1', '/en/spot/old-1']) {
    calls = 0
    const response = await middleware(new NextRequest(`http://localhost${pathname}`))
    assert.equal(response.headers.get('x-middleware-next'), '1')
    assert.equal(response.headers.get('X-JNQ-Data-Source'), 'static-fallback')
    assert.equal(calls, 1)
  }
  body = { destination: '/notes/new', status: 302 }
  assert.equal((await middleware(new NextRequest('http://localhost/spot/old-1'))).status, 302)
  body = { visible: false }
  assert.equal((await middleware(new NextRequest('http://localhost/spot/old-1'))).status, 404)
  status = 404
  assert.equal((await middleware(new NextRequest('http://localhost/spot/old-1'))).status, 404)
  status = 503
  const failed = await middleware(new NextRequest('http://localhost/spot/old-1'))
  assert.equal(failed.status, 503)
  assert.equal(failed.headers.get('Retry-After'), '30')
})

test('offline guard rejects external fetch and sockets before any connection', async () => {
  const { spawnSync } = require('node:child_process')
  const result = spawnSync(process.execPath, ['--require', './scripts/lib/offline-network-guard.cjs', '-e', `
    const assert = require('node:assert/strict');
    (async () => {
      await assert.rejects(fetch('https://example.com'), {code:'OFFLINE_VALIDATION'});
      assert.throws(() => require('node:https').get('https://example.com'), {code:'OFFLINE_VALIDATION'});
      assert.throws(() => require('node:net').connect(443, 'example.com'), {code:'OFFLINE_VALIDATION'});
    })().catch(() => process.exitCode = 1);
  `], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
})
