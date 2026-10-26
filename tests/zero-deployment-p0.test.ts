import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import { jiangnanGuideDraft } from '../lib/guide-drafts.ts'
import { resolveEntityDisplayName } from '../lib/entity-display-name.ts'
import { guideAttractionDisplayName } from '../lib/guide-attraction-display.ts'
import { planPublication, validPublicationPath } from '../lib/publication-plan.ts'
import { mutationOutcome } from '../lib/mutation-outcome.ts'

const require = createRequire(import.meta.url)
function load(file: string, mocks: Record<string, any>, globals: Record<string, any> = {}) {
  mocks = { '@/lib/publication-plan': {planPublication,validPublicationPath}, '@/lib/mutation-outcome': {mutationOutcome}, ...mocks }
  const context = { exports: {} as any, process, console, URL, Buffer, Request, Response, AbortSignal, setTimeout, clearTimeout,
    ...globals, require: (id: string) => id in mocks ? mocks[id] : id === '@/lib/server/publication' ? require('./helpers/publication-mock.cjs').publicationMock() : id.startsWith('@/') ? (() => { throw new Error(`Missing mock ${id}`) })() : require(id) }
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, context, { filename: file })
  return context.exports
}

test('one location batch publishes details before one collection/index and invalidates only after success', async () => {
  const events: string[] = [], writes: any[] = []
  let fail = false, reads = 0, maps = 0
  const loaded = load('lib/server/publish-location-batch.ts', {
    'next/cache': { revalidateTag: (s: string) => events.push(`tag:${s}`), revalidatePath: (s: string) => events.push(`path:${s}`) },
    '@/lib/server/public-content-store': {readPublicGuides:async()=>[],readPublicNotes:async()=>[]},
    '@/lib/server/public-data-resolver': { resolvePublicData: async () => ({ locations: [], regions: [] }), resolvePublicSnapshotBundleUncached: async () => { reads++; return {
      data: { locations: [{ id: 1, name: 'One', slug: 'one-1' }, { id: 3, name: 'Three', slug: 'three-3' }] },
      spots: [{ id: 1, name: 'One' }, { id: 3, name: 'Three' }],
    } } },
    '@/lib/server/location-slugs-store': { readLocationSlugMap: async () => { maps++; return { '1': 'custom' } },
      buildCanonicalLocationPath: async (_name: string, id: number, map: Record<string, string>) => `/spot/${map[id] || 'three'}-${id}` },
    '@/lib/server/r2': Object.fromEntries(['uploadPublicSpotSnapshot', 'uploadPublicDataSnapshot', 'uploadPublicSpotIndex'].map(name => [name,
      async (...args: any[]) => { events.push(`write:${name}`); if (fail) throw new Error('publication failed'); writes.push({ name, value: JSON.parse(args.at(-1).toString()) }) }])),
  })
  await loaded.publishLocationBatch([1, 2, 1]) // 2 was hidden/deleted; never delete its old object
  assert.equal(reads, 1); assert.equal(maps, 1)
  assert.deepEqual(writes.map(w => w.name), ['uploadPublicSpotSnapshot', 'uploadPublicDataSnapshot', 'uploadPublicSpotIndex'])
  assert.equal(writes[0].value.spot.slug, 'custom-1')
  assert.deepEqual(writes[2].value.slugs, ['custom-1', 'three-3'])
  assert.ok(events.indexOf('tag:public-data') > events.indexOf('write:uploadPublicSpotIndex'))
  assert.ok(events.includes('tag:public-spot:spot-2'))
  fail = true; events.length = 0
  await assert.rejects(loaded.publishLocationBatch([1, 2]), /Snapshot publication failed/)
  assert.ok(!events.some(e => e.startsWith('tag:') || e.startsWith('path:')))
})

test('batch publication validates authorization and IDs before touching any publisher', async () => {
  let allowed = false, calls = 0, fail = false
  const route = load('app/api/admin/public-data/spots/batch/route.ts', {
    '@/lib/server/admin-auth': { requireAdminRequest: async () => allowed ? { ok: true } : { ok: false, response: Response.json({}, { status: 401 }) } },
    '@/lib/server/publish-location-batch': { publishLocationBatch: async () => { calls++; if (fail) throw new Error('fail'); return {} } },
  })
  const request = (ids: unknown) => new Request('http://local', { method: 'POST', body: JSON.stringify({ ids }) })
  assert.equal((await route.POST(request([1]))).status, 401); assert.equal(calls, 0)
  allowed = true
  for (const ids of [[], [-1], [1.2], ['1'], null]) assert.equal((await route.POST(request(ids))).status, 400)
  assert.equal(calls, 0)
  fail = true
  const response = await route.POST(request([1]))
  assert.equal(response.status, 503); assert.match((await response.json()).error, /already be saved/)
})

test('list/bulk edits stop on publication/English failure and never replay the database mutation', async () => {
  let failure = '', calls: string[] = []
  const helper = load('lib/admin-locations.ts', { '@/lib/admin-fetch': { adminFetch: async (url: string) => {
    calls.push(url)
    return Response.json(url === '/api/admin/locations' ? { data: null, error: failure === 'publication' ? { message: 'saved, public publication failed' } : null } : { ok: true }, { status: (failure === 'publication' && url === '/api/admin/locations') || url.includes(failure || 'never-match') ? 503 : 200 })
  } } }).mutateAdminLocations
  for (const failed of ['publication', '']) {
    failure = failed; calls = []
    const response = await helper('PATCH', { ids: [1, 2], data: { visit_date: null } })
    assert.equal(calls.filter(p => p === '/api/admin/locations').length, 1)
    assert.equal(!!response.error, !!failed)
    if (failed === 'publication') assert.equal(calls.length, 1)
    if (!failed) assert.equal(calls.length, 1) // deduplicated English plan lives on server
  }
  calls = []; await helper('PATCH', { id: 1, returning: true, data: { name: 'One' } })
  assert.equal(calls.length, 1) // Form owns the subsequent custom-slug publication chain.
})

test('widgets replace the process Map with one invalidatable shared cache; failed saves never invalidate', async () => {
  let fail = false
  const events: string[] = []
  const route = load('app/api/admin/klook-widgets/route.ts', {
    '@/lib/server/publication': require('./helpers/publication-mock.cjs').publicationMock(events),
    '@/lib/server/admin-auth': { requireAdminRequest: async () => ({ ok: true }) },
    '@/lib/server/klook-widgets-store': {
      normalizeKlookWidgetPayload: (v: any) => v,
      readKlookWidgets: async (fresh: boolean) => { assert.equal(fresh, true); return [{ id: 'a', noteSlugs: ['old'] }] },
      saveKlookWidgets: async (v: any) => { events.push('save'); if (fail) throw new Error('Storage failed'); return v },
    },
    'next/cache': { revalidateTag: (s: string) => events.push(`tag:${s}`), revalidatePath: (s: string, type: string) => { assert.equal(type, 'page'); events.push(`path:${s}`) } },
  })
  const request = () => new Request('http://local', { method: 'POST', body: JSON.stringify({ id: 'a', title: 'Widget', htmlCode: '<div/>', noteSlugs: ['new'] }) })
  assert.equal((await route.POST(request())).status, 200)
  assert.ok(events.indexOf('publication:widget') > events.indexOf('save'))
  events.length = 0; fail = true
  assert.equal((await route.POST(request())).status, 500); assert.deepEqual(events, ['save'])
  const source = readFileSync('lib/server/klook-widgets-store.ts', 'utf8')
  assert.doesNotMatch(source, /cachedWidgets|lastFetchTime/)
  assert.match(source, /tags: \['klook-widgets'\]/)
})

test('English on-demand regeneration reads every snapshot fresh and refuses removed Notes', async () => {
  const calls: Array<{ key: string; fresh: boolean }> = []
  let notes: any[] = [{ slug: 'a', published: true }]
  const loaded = load('lib/server/english-page-data.ts', {
    '@/lib/publication-version': { publicationVersion: () => 'fixture-version' },
    '@/lib/server/guides-store': { normalizeGuidePayload: (v: any) => v },
    '@/lib/server/notes-store': { normalizeNotePayload: (v: any) => v },
    '@/lib/server/guide-price-highlights-store': { readApprovedGuidePriceHighlights: async () => [{ id: 'live-price' }] },
    '@/lib/content-relations': {}, '@/lib/server/travel-packages': { readPublishedPackagesUncached: async () => [] },
    '@/lib/guide-price-highlights': {}, '@/lib/guide-budget': {},
    '@/lib/localization': { localizationRecord: () => null, applyLocalization: (value: any) => ({ value, status: 'complete' }) },
    '@/lib/entity-display-name': {}, '@/lib/public-region-media': { resolvePublicRegionMedia: (v: any) => v },
    '@/lib/server/public-content-media': { resolveGuidePublicMedia: (v: any) => v }, '@/lib/homepage-localization': {},
    './localization-snapshot': {
      readLocalizationSnapshot: async (_locale: string, fresh: boolean) => { calls.push({ key: 'i18n', fresh }); return { records: [] } },
      readBundledJson: async () => ({}),
      readBilingualSnapshot: async (key: string, _fallback: any, _validate: any, fresh: boolean) => {
        calls.push({ key, fresh }); return { locations: [], regions: [], guides: [{ slug: 'g', days: [], budgetItems: [] }], notes, tripCosts: [{ slug: 'g', tripCost: {} }] }
      },
    },
  })
  const guide = await loaded.englishPageData(['guide', 'g'], true)
  assert.equal(guide.data.priceHighlights[0].id, 'live-price')
  assert.ok(calls.length >= 5); assert.ok(calls.every(c => c.fresh === true))
  assert.equal((await loaded.englishPageData(['notes', 'a'], true)).data.kind, 'fallback')
  notes = []
  assert.equal(await loaded.englishPageData(['notes', 'a'], true), null)
})

test('publication failure after an authoritative budget update is HTTP 503, not a successful save', async () => {
  const route = load('app/api/admin/guide-budget-snapshots/route.ts', {
    '@/lib/server/admin-auth': { requireAdminRequest: async () => ({ ok: true }) },
    '@/lib/server/guide-budget-store': { updateGuideBudgetSnapshot: async () => ({ guide_slug: 'g' }), guideBudgetRecordToDisplaySnapshot: () => ({}) },
    '@/lib/server/guides-store': {}, '@/lib/public-data': { PRIVATE_NO_STORE: 'private, no-store' },
    '@/lib/server/public-guide-trip-cost': { publishActualGuideTripCost: async () => { throw new Error('R2 failed') } },
    'next/cache': { revalidateTag: () => assert.fail('No invalidation after failed publication'), revalidatePath: () => assert.fail('No invalidation after failed publication') },
  })
  const response = await route.PATCH(new Request('http://local', { method: 'PATCH', body: JSON.stringify({ id: 's', action: 'publish' }) }))
  assert.equal(response.status, 503)
  const body = await response.json()
  assert.equal(body.publicSnapshotUpdated, false); assert.match(body.error, /Reload/)
})

test('Guide/Note metadata rejects missing content before resolving secondary data; Spot retains its loading component', async () => {
  const notFound = new Error('not found before streaming')
  for (const [kind, file] of [['guide', 'app/guide/[slug]/page.tsx'], ['note', 'app/notes/[slug]/page.tsx']]) {
    const names = [...readFileSync(file, 'utf8').matchAll(/from ['"](@\/[^'"]+)['"]/g)].map(m => m[1])
    const mocks = Object.fromEntries(names.map(name => [name, {}]))
    Object.assign(mocks, {
      'next/navigation': { notFound: () => { throw notFound } },
      '@/lib/server/public-content-store': { readPublicGuideBySlug: async () => null, readPublicNoteBySlug: async () => null },
      '@/lib/server/public-data-resolver': { resolvePublicData: () => assert.fail(`${kind}: secondary data must not be read`) },
    })
    const route = load(file, mocks)
    await assert.rejects(route.generateMetadata({ params: { slug: 'removed' } }), error => error === notFound)
  }
  assert.equal(existsSync('app/loading.tsx'), false)
  assert.match(readFileSync('app/spot/loading.tsx', 'utf8'), /aria-busy="true"/)
})

test('real EntityName rendering preserves the same curated alias as the image-alt helper', () => {
  const React = require('react'), { renderToStaticMarkup } = require('react-dom/server')
  let locale = 'zh'
  const EntityName = load('components/EntityName.tsx', {
    './PublicLocale': { usePublicLocale: () => locale }, '@/lib/entity-display-name': { resolveEntityDisplayName },
  }).default
  for (const language of ['zh', 'en']) {
    locale = language
    const entity = { name: 'Canonical English', name_cn: '规范中文', displayName: '  旅行别名  ' }
    const html = renderToStaticMarkup(React.createElement(EntityName, { entity }))
    assert.ok(html.includes(`<span class="block">${guideAttractionDisplayName(entity, entity)}</span>`))
    assert.ok(!html.includes('Canonical English'))
  }
})

test('confirmed zero-based segment indices exactly match dates without changing duration or itinerary data', () => {
  const start = Date.parse(`${jiangnanGuideDraft.tripStartDate}T00:00:00Z`)
  const day = (date: string | undefined) => (Date.parse(`${date}T00:00:00Z`) - start) / 86400000
  for (const segment of jiangnanGuideDraft.itinerarySegments || []) {
    assert.equal(segment.dayStart, day(segment.dateStart))
    assert.equal(segment.dayEnd, day(segment.dateEnd))
  }
  assert.equal(day(jiangnanGuideDraft.tripEndDate) + 1, 15)
  assert.equal(jiangnanGuideDraft.duration, '15天14夜')
})

test('affiliate errors never invalidate or claim success; successful edits expire Note HTML and the shared API data', async () => {
  let databaseError: any = null, invalidationFails = false
  const events: string[] = []
  const query: any = { eq: () => query, select: () => query, then: (resolve: any) => resolve({ data: databaseError ? null : [{id:1}], error: databaseError,status:databaseError?400:200 }) }
  const route = load('app/api/admin/affiliate-links/route.ts', {
    '@/lib/server/publication': { ...require('./helpers/publication-mock.cjs').publicationMock(), invalidatePublication: async () => {
      if (invalidationFails) throw new Error('cache failure')
      events.push('publication:affiliate')
      return {}
    } },
    '@/lib/server/admin-auth': { requireAdminRequest: async () => ({ ok: true }) },
    '@supabase/supabase-js': { createClient: () => ({ from: () => ({ update: () => { events.push('write'); return query } }) }) },
    'next/cache': { revalidateTag: (tag: string) => { if (invalidationFails) throw new Error('cache failure'); events.push(`tag:${tag}`) },
      revalidatePath: (path: string) => events.push(`path:${path}`) },
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture' } } })
  const request = () => new Request('http://local', { method: 'PATCH', body: JSON.stringify({ id: 1, data: { is_active: false } }) })
  databaseError = { message: 'rejected' }
  assert.equal((await route.PATCH(request())).status, 400); assert.deepEqual(events, ['write'])
  databaseError = null; events.length = 0
  assert.equal((await route.PATCH(request())).status, 200)
  assert.deepEqual(events, ['write', 'publication:affiliate'])
  invalidationFails = true
  const partial = await route.PATCH(request())
  assert.equal(partial.status, 503); assert.match((await partial.json()).error, /saved.*publication failed/)
})

test('price save expires its fetch tag before HTML; rejected writes never invalidate', async () => {
  let failed = false
  const events: string[] = []
  const route = load('app/api/admin/guide-price-highlights/route.ts', {
    '@/lib/server/admin-auth': { requireAdminRequest: async () => ({ ok: true }) },
    '@/lib/server/guides-store': { readGuideBySlug: async (slug: string) => ({ slug }) },
    '@/lib/server/guide-price-highlights-store': { replaceGuidePriceHighlights: async () => { events.push('write'); if (failed) throw new Error('Storage failed'); return [] } },
    'next/cache': { revalidateTag: (s: string) => events.push(`tag:${s}`), revalidatePath: (s: string) => events.push(`path:${s}`) },
  })
  const request = () => new Request('http://local', { method: 'PUT', body: JSON.stringify({ guideSlug: 'g', records: [] }) })
  assert.equal((await route.PUT(request())).status, 200)
  assert.deepEqual(events, ['write', 'tag:guide-price-highlights', 'path:/guide/g'])
  events.length = 0; failed = true
  assert.equal((await route.PUT(request())).status, 400); assert.deepEqual(events, ['write'])
})

test('Pages API can import the shared Spot reader when React.cache is unavailable', async () => {
  const reader = load('lib/server/public-spot-resolver.ts', {
    'server-only': {}, 'react': {}, 'next/cache': { unstable_cache: () => () => null },
    '@supabase/supabase-js': {}, '@/lib/spot-content': {}, '@/lib/location-routing': { extractLocationIdFromSlug: () => 1 },
    '@/lib/server/location-slugs-store': {}, '@/lib/public-spot': {},
  })
  assert.equal(await reader.getPublicSpotBySlug('spot-1'), null)
  assert.equal(typeof reader.readAuthoritativePublicSpotById, 'function')
})
