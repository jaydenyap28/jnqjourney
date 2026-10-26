import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import { planPublication, validPublicationPath } from '../lib/publication-plan.ts'
import { publicationVersion, spotPublicationVersion } from '../lib/publication-version.ts'
import { verifyHtmlValues } from '../lib/publication-html.ts'
const require = createRequire(import.meta.url)
function load(file: string, mocks: Record<string, any>, globals: Record<string, any> = {}) {
  const context = { exports: {} as any, process, console, URL, Buffer, Request, Response, Headers, AbortSignal, setTimeout, clearTimeout, ...globals,
    require: (id: string) => id in mocks ? mocks[id] : id === '@/lib/internal-http' ? require('../lib/internal-http.ts') : id === 'server-only' ? {} : id.startsWith('@/') ? (() => { throw new Error(`Missing mock ${id}`) })() : require(id) }
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, context)
  return context.exports
}
const guide = (slug: string, id = 1): any => ({ slug, aliases: [], title: slug, route: [], days: [{ attractions: [{ spotId: id }], routeItems: [] }], attractions: [], accommodationStays: [] })
const note = (slug: string, id = 1): any => ({ slug, aliases: [], title: slug, published: true, blocks: [], tags: [], relatedRegionIds: [], relatedSpotIds: [id], relatedNoteSlugs: [] })
const catalog: any = { locations: [
  { id: 1, slug: 'one-1', name: 'One', region: { id: 10 } }, { id: 2, slug: 'two-2', name: 'Two', region: { id: 10 } },
  { id: 3, slug: 'three-3', name: 'Three', region: { id: 20 } }],
  regions: [{ id: 10, slug: 'north-10', name: 'North' }, { id: 20, slug: 'south-20', name: 'South' }],
  guides: [guide('g-one'), guide('g-two', 3)], notes: [note('n-one'), note('n-two', 3)] }

test('Guide static regeneration never converts a Next 14 no-store bailout into a cached fallback', async () => {
  let current = 'v1', fallback = 0, fail: any
  const inits: any[] = []
  const store = load('lib/server/public-content-store.ts', {
    'next/cache': { unstable_cache: (fn: any) => fn }, '@/lib/guide-publication': { freshGuideSnapshotUrl: () => `http://cdn/guides?fresh=${current}` },
    '@/lib/server/guides-store': { normalizeGuidePayload: (v: any) => v, readGuides: async () => { fallback++; return [{ title: 'bundled old' }] } },
    '@/lib/server/notes-store': {},
  }, { process: { env: { PUBLIC_DATA_CDN_BASE_URL: 'http://cdn' } }, fetch: async (_url: string, init: any) => {
    inits.push(init)
    if (fail) throw fail
    // The actual Next 14 patch-fetch performs this exact explicit-init check.
    if (init.cache === 'no-store') throw Object.assign(new Error('Dynamic server usage'), { digest: 'DYNAMIC_SERVER_USAGE' })
    return Response.json({ schemaVersion: 1, guides: [{ slug: 'g', title: current }] })
  } })
  assert.equal((await store.readPublicGuideBySlug('g')).title, 'v1')
  current = 'v2'
  assert.equal((await store.readPublicGuideBySlug('g')).title, 'v2'); assert.equal(fallback, 0)
  assert.ok(inits.every(init => !('cache' in init)))
  fail = Object.assign(new Error('framework control'), { digest: 'DYNAMIC_SERVER_USAGE' })
  await assert.rejects(store.readPublicGuides(), /framework control/); assert.equal(fallback, 0)
  fail = new Error('real CDN outage')
  assert.equal((await store.readPublicGuides())[0].title, 'bundled old'); assert.equal(fallback, 1)
})

test('batch spot scope deduplicates old/new identities and related neighbours without touching unrelated regions', () => {
  const plan = planPublication({ kind: 'spot', ids: [1, 1], previousSlugs: ['old-one-1'] }, {
    ...catalog, previousLocations: [{ id: 1, slug: 'old-one-1', name: 'One', region: { id: 10 } }] as any,
  })
  for (const route of ['/spot/one-1', '/spot/old-one-1', '/spot/two-2', '/guide/g-one', '/notes/n-one', '/region/north-10', '/sitemap.xml']) assert.ok(plan.paths.includes(route), route)
  for (const route of ['/spot/three-3', '/notes/n-two', '/guide/g-two', '/region/south-20']) assert.ok(!plan.paths.includes(route), route)
  assert.ok(plan.englishPaths.includes('/en/spot/old-one-1'))
  assert.equal(plan.englishPaths.length, new Set(plan.englishPaths).size)
})

test('Guide/Note aliases and deletes retain dependency scope; prices do not rewrite unrelated listings', () => {
  const old = { ...guide('gone'), aliases: ['older'], days: [{ routeItems: [{ type: 'note', noteSlug: 'n-gone' }] }] }
  const removed = { ...note('n-gone'), aliases: ['n-old'] }
  const input = { ...catalog, previousGuides: [old], previousNotes: [removed], relatedNoteSlugsBySpot: { '1': ['n-gone'] } }
  const gp = planPublication({ kind: 'guide', slugs: ['gone'], previousSlugs: ['older'] }, input)
  assert.ok(gp.paths.includes('/guide/older')); assert.ok(gp.englishPaths.includes('/en/guide/gone'))
  const np = planPublication({ kind: 'note', slugs: ['n-gone'] }, input)
  for (const route of ['/notes/n-old', '/guide/gone', '/spot/one-1']) assert.ok(np.paths.includes(route), route)
  const price = planPublication({ kind: 'price', slugs: ['g-one'] }, catalog)
  assert.ok(price.englishPaths.includes('/en/guide/g-one'))
  assert.ok(!price.paths.includes('/')); assert.ok(!price.paths.includes('/guide/g-two'))
  const widget = planPublication({ kind: 'widget', widgetIds: ['w'] }, { ...catalog, notes: [{ ...note('target'), blocks: [{ klookWidgetIds: ['w'] }] }, note('unrelated')] })
  assert.deepEqual(widget.paths, ['/notes/target']); assert.deepEqual(widget.englishPaths, [])
  const affiliate = planPublication({ kind: 'affiliate', ids: [4] }, { ...catalog, notes: [{ ...note('target'), blocks: [{ affiliateIds: [4] }] }, note('unrelated')] })
  assert.deepEqual(affiliate.paths, ['/api/affiliate-links', '/notes/target'])
})

test('publication paths reject arbitrary admin paths, external origins and encoded traversal', () => {
  for (const path of ['/admin', '//external.test', '/en/../admin', '/en/spot/a%2f..', '/api/admin/guides']) assert.equal(validPublicationPath(path), false)
  for (const path of ['/en', '/sitemap.xml', '/en/spot/a-1', '/notes/中文']) assert.equal(validPublicationPath(path), true)
  assert.throws(() => planPublication({ kind: 'guide', slugs: ['../../admin'] }, catalog), /Invalid/)
})

function coordinator(transport: (url: string, init: any) => Promise<Response>, events: string[]) {
  return load('lib/server/publication.ts', {
    'next/cache': { revalidateTag: (s: string) => events.push(`tag:${s}`), revalidatePath: (s: string) => events.push(`path:${s}`) },
    '@/lib/publication-plan': { planPublication, validPublicationPath }, '@/lib/publication-version': { publicationVersion, spotPublicationVersion },
    '@/lib/server/public-spot-resolver': {readAuthoritativePublicSpotById:async()=>null},
    '@/lib/server/publication-values': {publicationValueChecks:async()=>[]}, '@/lib/publication-html': {verifyHtmlValues},
    '@/lib/server/guides-store': { normalizeGuidePayload: (v: any) => v }, '@/lib/server/notes-store': { normalizeNotePayload: (v: any) => v },
    '@/lib/site': { getSiteUrl: () => new URL('https://site.invalid') }, '@supabase/supabase-js': {},
  }, { process: { env: { PUBLIC_DATA_CDN_BASE_URL: 'http://cdn.invalid' } }, fetch: transport })
}

test('writer reads published data then invalidates App tags; Pages ISR is deferred until the independent request', async () => {
  const events: string[] = []; let fail = false
  const loaded = coordinator(async (url, init) => {
    assert.equal(init.cache, 'no-store')
    if (url.includes('/public-data/')) {
      const name = new URL(url).pathname.split('/').at(-1)!.replace('.json', '')
      if (fail) return Response.json({}, {status:503})
      events.push(`source:${name}`); return Response.json({ schemaVersion: 1, [name]: catalog[name] })
    }
    assert.equal(new URL(url).pathname, '/api/admin/publication-revalidate')
    assert.equal(init.method, 'POST'); assert.equal(init.headers.authorization, 'Bearer fixture')
    events.push('english'); return Response.json({ ok: !fail }, { status: fail ? 503 : 200 })
  }, events)
  const request = new Request('http://localhost/api/admin/guides', { headers: { authorization: 'Bearer fixture' } })
  const receipt = await loaded.invalidatePublication(request, { kind: 'guide', slugs: ['g-one'] })
  assert.equal(receipt.state, 'verification-required'); assert.equal(receipt.checks[0].version, publicationVersion(catalog.guides[0]))
  assert.ok(!events.includes('english')); assert.ok(receipt.plan.englishPaths.length>0)
  assert.ok(events.indexOf('tag:guides') > events.indexOf('source:guides'))
  fail = true
  await assert.rejects(loaded.invalidatePublication(request, { kind: 'guide', slugs: ['g-one'] }), /snapshot unavailable/)
  const response = loaded.publicationFailure(new Error('failed'), { kind: 'guide', slugs: ['g-one'] })
  assert.equal(response.status, 503)
  const body = await response.json(); assert.equal(body.partial, true); assert.equal(body.publication.retry.url, '/api/admin/publication-retry')
  const recovery = await loaded.publicationFailure({stage:'snapshot',change:{kind:'spot',ids:[1],previousPaths:['/spot/new-1']}},{kind:'spot',ids:[1],previousPaths:['/spot/old-1']},true,{state:'partial',affected:1,expected:2})
  const recoveryBody=await recovery.json()
  assert.equal(recoveryBody.publication.retry.url,'/api/admin/public-data/spots/batch')
  assert.deepEqual([...recoveryBody.publication.retry.body.previousPaths].sort(),['/spot/new-1','/spot/old-1'])
  assert.equal(recoveryBody.mutation.state,'partial')
  assert.throws(() => loaded.publicationOrigin(new Request('https://attacker.invalid/path')), /Untrusted/)
})

test('independent public read-back catches a stale HTML version even when API and status are correct', async () => {
  const version = publicationVersion({ title: 'new' }); let old = true
  const loaded = coordinator(async (url) => url.includes('/api/guides')
    ? Response.json({}, { headers: { 'X-JNQ-Content-Version': version } })
    : new Response(`<meta name="jnq-content-version" content="${old ? 'old' : version}">`), [])
  const checks = [{ path: '/api/guides?slug=g', status: 200, version, htmlPath: '/guide/g' }]
  const request = new Request('http://localhost/api/admin/publication-verify')
  assert.equal((await loaded.verifyPublication(request, checks)).ok, false)
  old = false; assert.equal((await loaded.verifyPublication(request, checks)).ok, true)
  await assert.rejects(loaded.verifyPublication(request, []), /at least one/)
  assert.equal((await loaded.verifyPublication(request, [{ path: '/guide/g', status: 200, unverified: 'Rendered price has no value evidence' }])).ok, false)
})

test('English build omits alias redirects while retaining blocking runtime canonical resolution', async () => {
  const english = load('pages/en/[[...path]].tsx', {
    '@/components/EnglishRouteAdapter': { default: () => null },
    '@/public-data/i18n/en/records.json': { records: [{ canonicalPath: '/spot/old-1' }, { canonicalPath: '/guide/current' }] },
    '@/lib/server/english-page-data': { compactEnglishPageData: (value: any) => value, englishPageData: async (parts: string[]) => parts[1] === 'old-1' ? { redirect: '/en/spot/new-1' } : { data: { title: 'current' } } },
  })
  const paths = await english.getStaticPaths()
  assert.equal(paths.fallback, 'blocking')
  assert.ok(!paths.paths.includes('/en/spot/old-1')); assert.ok(paths.paths.includes('/en/guide/current'))
  const runtime = await english.getStaticProps({ params: { path: ['spot', 'old-1'] }, revalidateReason: 'stale' })
  assert.equal(runtime.redirect.destination, '/en/spot/new-1'); assert.equal(runtime.redirect.permanent, true)
})

test('adminFetch waits for an independent read-back and returns partial failure without replaying a mutation', async () => {
  let fail = true
  const calls: string[] = []
  const api = load('lib/admin-fetch.ts', { '@/lib/supabase': { supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'fixture' } } }) } } } }, {
    fetch: async (url: string) => {
      calls.push(url)
      if (url.endsWith('/publication-verify')) return Response.json({ ok: !fail }, { status: fail ? 503 : 200 })
      return Response.json({ data: { id: 1 }, publication: { state: 'verification-required', checks: [], retry: { url: '/api/admin/publication-retry' } } }, { headers: { 'X-JNQ-Publication-Verification': 'required' } })
    },
  })
  const first = await api.adminFetch('/api/admin/guides', { method: 'POST' })
  assert.equal(first.status, 503); assert.equal((await first.json()).publication.state, 'partial')
  assert.deepEqual(calls, ['/api/admin/guides', '/api/admin/publication-verify'])
  fail = false; calls.length = 0
  assert.equal((await (await api.adminFetch('/api/admin/publication-retry', { method: 'POST' })).json()).publication.state, 'verified')
  assert.deepEqual(calls, ['/api/admin/publication-retry', '/api/admin/publication-verify'])
})

test('Pages revalidation uses actual Next 14 onlyGenerated semantics, deduplicates batches and reports partial failures', async () => {
  const calls: string[] = []; let fail = false
  const handler = load('pages/api/admin/publication-revalidate.ts', {
    '@/lib/server/admin-auth': { requireAdminRequest: async () => ({ ok: true }) }, '@/lib/publication-plan': { validPublicationPath },
  }).default
  const res: any = { code: 200, setHeader() {}, status(code: number) { this.code = code; return this }, json(body: any) { return body },
    revalidate: async (path: string, opts: any) => { assert.equal(opts.unstable_onlyGenerated, true); calls.push(path); if (fail) throw Error('failure') } }
  const req = { method: 'POST', headers: {}, body: { paths: ['/en/guide/a', '/en/guide/a', '/en/notes/b'] } }
  assert.equal((await handler(req, res)).ok, true); assert.deepEqual(calls, ['/en/guide/a', '/en/notes/b'])
  fail = true; assert.equal((await handler(req, res)).partial, true); assert.equal(res.code, 503)
  assert.match(readFileSync('node_modules/next/dist/server/api-utils/node/api-resolver.js', 'utf8'), /res.status === 404 && opts.unstable_onlyGenerated/)
})
