const test = require('node:test')
const assert = require('node:assert/strict')
require('next/dist/server/node-environment')
const serverReact = require('next/dist/compiled/react')
require('react').cache ??= serverReact.cache
const { NextRequest } = require('next/server')
const { unstable_cache } = require('next/cache')
const { staticGenerationAsyncStorage } = require('next/dist/client/components/static-generation-async-storage.external')
const { AppRouteRouteModule } = require('next/dist/server/future/route-modules/app-route/module')
const { default: ResponseCache } = require('next/dist/server/response-cache')
const { loader } = require('./helpers/spot-travel-loader.cjs')

const spot = {
  id: 41, name: 'Fixture', slug: 'fixture-41', description: 'a'.repeat(300),
  images: ['a', 'b', 'c', 'd'], visit_date: '2025-01-01', address: 'Fixture',
}
const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://db.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture' }

test('twenty guarded Spot requests share one quality calculation and one slug download', async t => {
  const counts = { internal: 0, live: 0, index: 0, detail: 0, quality: 0, slug: 0 }
  const { evaluateSpotQuality } = loader()('lib/spot-quality.ts')
  const values = new Map()
  const incrementalCache = {
    fetchCacheKey: async key => key,
    get: async key => values.get(key),
    set: async (key, value, { tags, revalidate }) => {
      assert.equal(revalidate, 3600)
      values.set(key, { value, tags })
    },
  }
  let live = { visible: true }, alias = 'fixture', detail = spot, storageFailure = false
  let handler
  const load = loader({
    'next/cache': { unstable_cache },
    '@/lib/spot-quality': { evaluateSpotQuality: value => { counts.quality++; return evaluateSpotQuality(value) } },
    '@/lib/server/spot-routing': { readSpotRouting: async () => { counts.live++; return live } },
    '@supabase/supabase-js': { createClient: () => ({
      storage: { from: () => ({ download: async () => {
        counts.slug++
        return storageFailure ? { error: { status: 500 } } : { data: { text: async () => JSON.stringify({ 41: alias }) } }
      } }) },
    }) },
  }, { process: { env: { ...env, PUBLIC_DATA_CDN_BASE_URL: 'https://cdn.invalid' }, cwd: process.cwd }, fetch: async (input, init) => {
    const url = new URL(input)
    if (url.origin === 'https://site.invalid') {
      counts.internal++
      assert.equal(init.cache, 'no-store')
      assert.match(url.pathname, /^\/api\/spot-routing\//)
      return staticGenerationAsyncStorage.run({ incrementalCache, revalidate: 3600, urlPathname: url.pathname }, () =>
        handler(new Request(url), { params: { slug: url.pathname.split('/').at(-1) } }))
    }
    assert.equal(url.origin, 'https://cdn.invalid')
    if (url.pathname.endsWith('/index.json')) {
      counts.index++
      return Response.json({ schemaVersion: 1, slugs: ['fixture-41'] })
    }
    counts.detail++
    return Response.json({ schemaVersion: 1, spot: detail })
  } })
  handler = load('app/api/spot-routing/[slug]/route.ts').GET
  const guard = load('middleware.ts').middleware
  const visit = slug => guard(new NextRequest(`https://site.invalid/spot/${slug}`))
  for (let i = 0; i < 20; i++) {
    const response = await visit('fixture-41')
    assert.equal(response.headers.get('X-JNQ-SEO-Indexable'), 'true', JSON.stringify({ status: response.status, counts }))
  }
  assert.deepEqual(counts, { internal: 20, live: 20, index: 1, detail: 1, quality: 1, slug: 1 })
  t.diagnostic(JSON.stringify(counts))

  // A warm payload and alias must not authorize a newly hidden record.
  live = { visible: false }
  assert.equal((await visit('fixture-41')).status, 404)
  assert.equal(counts.slug, 1)
  live = { visible: false, destination: '/notes/new', status: 302 }
  assert.equal((await visit('fixture-41')).status, 302)
  assert.equal(counts.quality, 1)

  live = { visible: true }
  alias = 'changed'
  detail = { ...spot, description: 'thin' }
  for (const [key, entry] of values) {
    if (entry.tags.some(tag => ['public-location-slugs', 'public-spot:spot-41'].includes(tag))) values.delete(key)
  }
  const redirected = await visit('fixture-41')
  assert.equal(redirected.status, 301)
  assert.equal(redirected.headers.get('location'), 'https://site.invalid/spot/changed-41')
  assert.equal((await visit('changed-41')).headers.get('X-Robots-Tag'), 'noindex, nofollow')
  assert.equal(counts.quality, 2)
  assert.equal(counts.slug, 2)

  for (const [key, entry] of values) if (entry.tags.includes('public-location-slugs')) values.delete(key)
  storageFailure = true
  assert.equal((await visit('changed-41')).status, 503)
  storageFailure = false
  assert.equal((await visit('changed-41')).status, 200)
})

test('twenty Package requests use no same-site API and keep checking publication', async t => {
  let reads = 0, rows = [{ id: 1 }], failure = false
  const load = loader({}, { process: { env }, fetch: async (url, init) => {
    reads++
    assert.equal(url.origin, env.NEXT_PUBLIC_SUPABASE_URL)
    assert.equal(url.pathname, '/rest/v1/travel_packages')
    assert.equal(url.searchParams.get('status'), 'eq.published')
    assert.equal(url.searchParams.get('slug'), 'eq.fixture')
    assert.equal(init.cache, 'no-store')
    assert.equal(init.redirect, 'error')
    assert.ok(init.signal)
    return failure ? new Response(null, { status: 502 }) : Response.json(rows)
  } })
  const guard = load('middleware.ts').middleware
  const visit = slug => guard(new NextRequest(`https://site.invalid/packages/${slug}`))
  for (let i = 0; i < 20; i++) assert.equal((await visit('fixture')).headers.get('X-JnQ-Package-Guard'), 'published')
  assert.equal(reads, 20)
  t.diagnostic('20 requests, 0 same-site calls, 20 live database reads')
  rows = []
  assert.equal((await visit('fixture')).status, 404)
  rows = { error: 'invalid' }
  assert.equal((await visit('fixture')).status, 503)
  failure = true
  const unavailable = await visit('fixture')
  assert.equal(unavailable.status, 503)
  assert.match(unavailable.headers.get('cache-control'), /no-store/)
  assert.equal((await visit('tioman-aman-resort-3d2n')).status, 308)
  assert.equal((await visit('invalid.slug')).status, 404)
  assert.equal(reads, 23)
})

test('Guide and Note metadata, body and related links share collection work within a render', async t => {
  const counts = { guide: 0, note: 0 }
  const guide = { slug: 'guide', aliases: ['old-guide'], title: 'Guide' }
  const note = { slug: 'note', aliases: ['old-note'], title: 'Note', published: true }
  const load = loader({
    react: serverReact,
    'next/cache': { unstable_cache: fn => fn },
    '@/lib/server/guides-store': { readGuides: async () => { counts.guide++; return [guide] } },
    '@/lib/server/notes-store': { readPublishedNotes: async () => { counts.note++; return [note] } },
  })
  const store = load('lib/server/public-content-store.ts')
  const slot = serverReact.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentCache
  const previous = slot.current
  t.after(() => { slot.current = previous })
  for (let render = 1; render <= 2; render++) {
    const resources = new Map()
    slot.current = { getCacheForType(factory) {
      if (!resources.has(factory)) resources.set(factory, factory())
      return resources.get(factory)
    } }
    const results = await Promise.all([
      store.readPublicGuideBySlug('old-guide'), store.readPublicGuideBySlug('old-guide'), store.readPublicGuides(),
      store.readPublicNoteBySlug('old-note'), store.readPublicNoteBySlug('old-note'), store.readPublicNotes(),
    ])
    assert.deepEqual(results, [guide, guide, [guide], note, note, [note]])
    assert.deepEqual(counts, { guide: render, note: render })
  }
  t.diagnostic('Three collection consumers per type in each render, one underlying reader call per type.')
})

test('Next 14 runs the live Sitemap inventory at regeneration without a static bailout', async t => {
  const initialFetch = global.fetch
  let inventory = 0, unavailable = false
  global.fetch = async url => {
    assert.equal(String(url), 'https://db.invalid/quality-inventory')
    inventory++
    return unavailable ? new Response(null, { status: 503 }) : Response.json([spot])
  }
  t.after(() => { global.fetch = initialFetch })
  const load = loader({
    react: { cache: fn => fn },
    '@/lib/server/location-slugs-store': { readLocationSlugMap: async () => ({}), buildCanonicalLocationPath: async () => '/spot/fixture-41' },
    '@/lib/server/public-content-store': { readPublicGuides: async () => [], readPublicNotes: async () => [] },
    '@/lib/server/travel-packages': { readPublishedPackages: async () => [] },
    '@/lib/server/english-page-data': { readEnglishCollections: async () => ({ localization: { records: [] } }) },
    '@/lib/server/public-data-resolver': { resolvePublicData: async () => ({ locations: [spot], regions: [] }) },
    '@supabase/supabase-js': { createClient: (_url, _key, options) => ({
      from: () => ({ select: () => ({ eq: () => ({
        abortSignal: async signal => {
          const response = await options.global.fetch('https://db.invalid/quality-inventory', { signal })
          return response.ok ? { data: await response.json() } : { error: 'unavailable' }
        },
      }) }) }),
    }) },
  }, { process: { env, cwd: process.cwd }, fetch: (...args) => global.fetch(...args) })
  const sitemap = load('app/sitemap.ts')
  const execute = async (dynamic, supportsDynamicResponse = false) => {
    const route = new AppRouteRouteModule({
      userland: { dynamic, revalidate: sitemap.revalidate, GET: async () => Response.json(await sitemap.default()) },
      definition: { pathname: '/sitemap.xml' },
      resolvedPagePath: 'app/sitemap.ts',
    })
    const context = { prerenderManifest: {}, renderOpts: { supportsDynamicResponse, experimental: {} } }
    return { response: await route.handle(new NextRequest('https://site.invalid/sitemap.xml'), context), context }
  }
  await assert.rejects(() => execute(undefined), /no-store fetch|Dynamic server usage/)
  assert.equal(inventory, 0)

  for (let i = 0; i < 20; i++) assert.equal((await execute(undefined, true)).response.status, 200)
  assert.equal(inventory, 20)
  inventory = 0
  const responseCache = new ResponseCache(false)
  const entries = new Map()
  const incrementalCache = {
    get: async key => entries.get(key),
    set: async (key, value, { revalidate }) => entries.set(key, { value, curRevalidate: revalidate }),
  }
  for (let i = 0; i < 20; i++) {
    const result = await responseCache.get('/sitemap.xml', async () => {
      const { response, context } = await execute(sitemap.dynamic)
      return {
        revalidate: context.renderOpts.store.revalidate,
        value: { kind: 'APP_ROUTE', body: Buffer.from(await response.arrayBuffer()), status: response.status },
      }
    }, { incrementalCache })
    assert.equal(result.revalidate, 3600)
    assert.ok(JSON.parse(result.value.body).some(entry => entry.url.endsWith('/spot/fixture-41')))
  }
  assert.equal(inventory, 1)
  unavailable = true
  await assert.rejects(() => execute(sitemap.dynamic), /quality inventory is unavailable/)
  assert.equal(inventory, 2)
  t.diagnostic('20 requests: baseline 20 inventory reads, patched Next ResponseCache 1 read with 3600s revalidate.')
})
