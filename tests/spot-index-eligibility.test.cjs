const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { NextRequest } = require('next/server')

function loader(mocks = {}, globals = {}) {
  const cache = new Map()
  function load(file) {
    file = path.resolve(file)
    if (cache.has(file)) return cache.get(file).exports
    const mod = { exports: {} }; cache.set(file, mod)
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText
    const req = id => {
      if (id in mocks) return mocks[id]
      if (id === 'server-only') return {}
      if (id.startsWith('@/') || id.startsWith('.')) {
        const base = id.startsWith('@/') ? path.resolve(id.slice(2)) : path.resolve(path.dirname(file), id)
        const resolved = ['', '.ts', '.tsx', '.json'].map(ext => base + ext).find(f => fs.existsSync(f) && fs.statSync(f).isFile())
        if (!resolved) throw new Error(`Missing dependency ${id}`)
        return resolved.endsWith('.json') ? JSON.parse(fs.readFileSync(resolved, 'utf8')) : load(resolved)
      }
      return require(id)
    }
    const scope = { process: { env: {}, cwd: () => process.cwd() }, console, URL, Request, Response, Buffer, AbortSignal, setTimeout, clearTimeout, ...globals }
    new Function('require', 'module', 'exports', ...Object.keys(scope), code)(req, mod, mod.exports, ...Object.values(scope))
    return mod.exports
  }
  return load
}

const { evaluateSpotQuality } = loader()('lib/spot-quality.ts')
const qualified = { id: 1, name: 'Fixture Spot', publication_status: null, description: 'A'.repeat(300), images: ['a', 'b', 'c', 'd'], visit_date: '2025-01-01', address: 'Fixture' }

test('the deployed five editorial qualification paths remain unchanged', () => {
  for (const spot of [
    { experience_zh: 'A'.repeat(120), images: ['a', 'b'], visit_date: '2025-01-01' },
    qualified,
    { ...qualified, description: 'A'.repeat(220), video_url: 'https://video.invalid' },
    { description: 'A'.repeat(180), experience_zh: 'B'.repeat(60), images: ['a', 'b'] },
    { description: 'A'.repeat(180), related_note_slugs: ['fixture'], images: ['a', 'b'] },
  ]) assert.equal(evaluateSpotQuality(spot).indexable, true)
  assert.equal(evaluateSpotQuality({ ...qualified, description: 'A'.repeat(219), video_url: 'https://video.invalid' }).indexable, false)
  assert.equal(evaluateSpotQuality({ ...qualified, images: ['a'] }).indexable, false)
  assert.equal(evaluateSpotQuality({ ...qualified, seo_title_zh: null }).indexable, true)
})

test('metadata, detail API, routing and middleware agree for thin, qualified and fallback pages', async () => {
  for (const [spot, source, expected] of [
    [{ ...qualified, description: 'A'.repeat(205) }, 'cdn-cache', false],
    [qualified, 'cdn-cache', true],
    [qualified, 'static-fallback', false],
  ]) {
    const mocks = {
      '@/lib/server/public-spot-resolver': { getPublicSpotBySlug: async () => ({ spot, source, quality: evaluateSpotQuality(spot) }) },
      '@/lib/server/spot-routing': { readSpotRouting: async () => ({ visible: true }) },
      '@/lib/server/location-slugs-store': { buildPublicCanonicalLocationPath: async () => '/spot/fixture-1' },
      '@/lib/server/localized-seo': { chineseLocalizedAlternates: async () => ({ canonical: '/spot/fixture-1' }) },
      '@/components/SpotPageView': { __esModule: true, default: () => null },
      '@/lib/server/public-location-data': {}, '@/lib/server/public-content-store': {}, '@/lib/server/travel-packages': {},
    }
    const load = loader(mocks)
    const metadata = await load('app/spot/[slug]/page.tsx').generateMetadata({ params: { slug: 'fixture-1' } })
    assert.equal(metadata.robots.index, expected)
    const details = await load('app/api/spots/[slug]/route.ts').GET(new Request('https://fixture.invalid'), { params: { slug: 'fixture-1' } })
    assert.equal(details.headers.get('X-JNQ-SEO-Indexable'), expected ? '1' : '0')
    const routing = await load('app/api/spot-routing/[slug]/route.ts').GET(new Request('https://fixture.invalid/spot/fixture-1'), { params: { slug: 'fixture-1' } })
    assert.equal((await routing.clone().json()).visible, true, 'quality must not hide a public page')
    assert.equal(routing.headers.get('X-JNQ-SEO-Indexable'), String(expected))
    const guarded = await loader({}, { fetch: async () => routing })('middleware.ts').middleware(new NextRequest('https://fixture.invalid/spot/fixture-1'))
    assert.equal(guarded.status, 200)
    assert.equal(guarded.headers.get('X-Robots-Tag')?.includes('noindex') || false, !expected)
  }
})

test('Sitemap batch excludes thin/draft/hidden rows and fails on unavailable quality inventory', async () => {
  const rows = [qualified, { ...qualified, id: 2, description: 'A'.repeat(205) }, { ...qualified, id: 3, publication_status: 'draft' }, { ...qualified, id: 4, publication_status: 'hidden' }]
  let failure = false, queries = 0
  const read = loader({
    react: { cache: fn => fn }, 'next/cache': { unstable_cache: fn => fn },
    './supabase-read-key': { supabaseReadKey: () => 'fixture' },
    '@supabase/supabase-js': { createClient: () => ({ from: table => {
      assert.equal(table, 'locations'); queries++
      return { select: () => ({ eq: (key, value) => {
        assert.equal(key, 'status'); assert.equal(value, 'active')
        return { abortSignal: async signal => { assert.ok(signal); return failure ? { error: { message: 'unavailable' } } : { data: rows } } }
      } }) }
    } }) },
    '@/lib/server/public-data-resolver': { resolvePublicData: async () => ({ locations: rows.map(s => ({ ...s, slug: `published-${s.id}` })) }) },
    '@/lib/server/public-spot-resolver': {},
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.invalid' } } })('lib/server/public-location-data.ts').fetchAllLocationsForSitemap
  const result = await read()
  assert.deepEqual(result.map(row => row.id), [1]); assert.equal(result[0].slug, 'published-1')
  failure = true
  await assert.rejects(read, /quality inventory is unavailable/)
  assert.equal(queries, 2, 'one inventory query per generation, never one per Spot')
})

test('complete English translations cannot re-add an excluded Spot to either sitemap language', async () => {
  const url = path => `https://www.jnqjourney.com${path}`
  let englishCalls = 0
  const routes = await loader({
    '@/lib/region-routing': {}, '@/lib/site': { absoluteUrl: url },
    '@/lib/server/location-slugs-store': { readLocationSlugMap: async () => ({}), buildCanonicalLocationPath: async () => '/spot/published-1' },
    '@/lib/server/public-location-data': { fetchAllLocationsForSitemap: async () => [{ id: 1, name: 'Fixture', slug: 'published-1' }], fetchAllRegionsForSitemap: async () => [] },
    '@/lib/server/public-content-store': { readPublicGuides: async () => [], readPublicNotes: async () => [] },
    '@/lib/server/travel-packages': { readPublishedPackages: async () => [] },
    '@/lib/server/english-page-data': {
      readEnglishCollections: async () => ({ localization: { records: [1, 2].map(id => ({ canonicalPath: `/spot/published-${id}`, translationStatus: 'complete' })) } }),
      englishPageData: async () => { englishCalls++; return { data: { status: 'complete' } } },
    },
  })('app/sitemap.ts').default()
  assert.ok(routes.some(r => r.url === url('/en/spot/published-1')))
  assert.ok(!routes.some(r => r.url.endsWith('published-2')))
  assert.equal(englishCalls, 1)
})
