import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import { resolvePublicSpotSources } from '../lib/public-spot.ts'
import { planPublication } from '../lib/publication-plan.ts'

const require = createRequire(import.meta.url)
function load(file: string, mocks: Record<string, any>, globals: Record<string, any> = {}) {
  const context = { exports: {} as any, process, console, URL, Buffer, Request, Response, AbortSignal, setTimeout, clearTimeout,
    ...globals, require: (id: string) => {
      if (id in mocks) return mocks[id]
      if (id === '@/lib/internal-http') return require('../lib/internal-http.ts')
      if (id === '@/lib/preview-safety') return require('../lib/preview-safety.ts')
      if (id === '@/lib/server/publish-location-batch') return load('lib/server/publish-location-batch.ts',mocks)
      if (id === '@/lib/server/publication') return require('./helpers/publication-mock.cjs').publicationMock()
      if (id === 'server-only') return {}
      if (id.startsWith('@/')) throw new Error(`Missing offline mock ${id}`)
      return require(id)
    } }
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText, context, { filename: file })
  return context.exports
}

test('public snapshot remains under the unchanged 500000-byte budget with every lightweight field', () => {
  const raw = readFileSync('public-data/locations.json')
  assert.ok(raw.length < 500000)
  const data = JSON.parse(raw.toString())
  assert.equal(data.locations.length, 547)
  assert.equal(new Set(data.locations.map((l: any) => l.id)).size, 547)
  assert.equal(data.source.generatedAt, '2026-08-09T12:25:35.284Z')
  for (const location of data.locations) assert.deepEqual(Object.keys(location).sort(), ['id','slug','name','region','category','latitude','longitude','thumbnail','shortSummary','visitDate'].sort())
})

test('cold and warm Middleware requests never cache visibility, call a second API, or fail open', async () => {
  const { NextRequest } = require('next/server')
  for (const locale of ['', '/en']) {
    for (const scenario of ['published','hidden','redirect','missing','unavailable','network','malformed','external-redirect','fallback','partial-en']) {
      let requests = 0
      const factory = () => load('middleware.ts', {}, { fetch: async (url: URL, init: any) => {
        requests++
        assert.equal(init.cache, 'no-store')
        assert.ok(init.signal)
        assert.equal(url.pathname, '/api/spot-routing/old-1')
        assert.equal(url.searchParams.get('locale'), locale ? 'en' : null)
        if (scenario === 'network') throw new Error('cold connection failed')
        const status = scenario === 'missing' ? 404 : scenario === 'unavailable' ? 503 : 200
        const payload = scenario === 'redirect' ? { destination:'/notes/canonical', status:301 }
          : scenario === 'external-redirect' ? { destination:'https://other.test', status:301 }
          : scenario === 'malformed' ? {} : { visible: scenario !== 'hidden' }
        return Response.json(payload, { status, headers: { 'X-JNQ-Data-Source': scenario === 'fallback' ? 'static-fallback' : 'cdn-cache',
          'X-JNQ-SEO-Indexable': ['published'].includes(scenario) ? 'true' : 'false' } })
      } }).middleware
      // Fresh module and subsequent call cover cold start and warm execution.
      const handler = factory()
      for (let call = 0; call < 2; call++) {
        const response = await handler(new NextRequest(`http://localhost${locale}/spot/old-1`))
        const expected = ['published','fallback','partial-en'].includes(scenario) ? 200
          : scenario === 'redirect' ? 301 : ['hidden','missing'].includes(scenario) ? 404 : 503
        assert.equal(response.status, expected, `${locale} ${scenario}`)
        assert.equal(response.headers.get('X-JNQ-SEO-Indexable'), scenario === 'published' ? 'true' : 'false')
        if (scenario !== 'published') assert.match(response.headers.get('X-Robots-Tag') || '', /noindex/)
        if (expected !== 200) assert.match(response.headers.get('Cache-Control') || '', /no-store/)
        if (expected === 503) assert.equal(response.headers.get('Retry-After'), '30')
      }
      assert.equal(requests, 2)
    }
  }
})

test('real live-routing SDK transport is no-store on every read and every cold instance', async () => {
  const { createClient } = require('@supabase/supabase-js')
  const { resolveSpotRouting } = await import('../lib/spot-redirect.ts')
  let visibility = 'published', calls = 0
  const handler = () => load('lib/server/spot-routing.ts', {
    '@/lib/spot-redirect': { resolveSpotRouting },
    '@supabase/supabase-js': { createClient },
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://routing.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture' } },
    fetch: async (_input: any, init: any) => {
      calls++
      assert.equal(init.cache, 'no-store')
      return Response.json({ id:1, publication_status:visibility, redirect_url:null })
    } }).readSpotRouting
  const read = handler()
  assert.equal((await read(1)).visible, true)
  visibility = 'hidden'
  assert.equal((await read(1)).visible, false)
  assert.equal((await handler()(1)).visible, false)
  assert.equal(calls, 3)
})

test('routing API preserves live deny decisions and gives explicit English/fallback SEO eligibility', async () => {
  let routing: any = { visible: true }, source = 'cdn-cache', translation = 'complete', detailReads = 0
  const loaded = load('app/api/spot-routing/[slug]/route.ts', {
    '@/lib/location-routing': { extractLocationIdFromSlug: () => 1 },
    '@/lib/server/spot-routing': { readSpotRouting: async () => routing },
    '@/lib/server/public-spot-resolver': { getPublicSpotBySlug: async () => { detailReads++; return { spot: { id:1, name:'Name' }, source } } },
    '@/lib/server/location-slugs-store': { buildCanonicalLocationPath: async () => '/spot/old-1' },
    '@/lib/server/localization-snapshot': { readLocalizationSnapshot: async () => ({ records:[] }) },
    '@/lib/localization': { localizationRecord: () => null, applyLocalization: () => ({ status: translation }) },
  })
  const get = (locale = '') => loaded.GET(new Request(`http://localhost/api/spot-routing/old-1${locale}`), { params: { slug:'old-1' } })
  assert.equal((await get()).headers.get('X-JNQ-SEO-Indexable'), 'true')
  assert.equal((await get('?locale=en')).headers.get('X-JNQ-SEO-Indexable'), 'true')
  translation = 'partial'
  assert.equal((await get('?locale=en')).headers.get('X-JNQ-SEO-Indexable'), 'false')
  source = 'static-fallback'
  assert.equal((await get()).headers.get('X-JNQ-SEO-Indexable'), 'false')
  routing = { visible:false }
  const denied = await get()
  assert.equal((await denied.json()).visible, false)
  assert.equal(detailReads, 4)
  routing = { destination:'/notes/new', status:302 }
  assert.equal((await (await get()).json()).status, 302)
  assert.equal(detailReads, 4)
})

test('authoritative hidden/deleted Spot cannot resurrect from bundled fallback; network failures still can', async () => {
  let fallbackReads = 0
  const spot: any = { id:1, slug:'spot-1' }
  const sources = {
    cdn: async () => ({ status:'not-found' as const }),
    supabase: async () => ({ status:'not-found' as const, authoritative:true }),
    fallback: async () => { fallbackReads++; return { status:'found' as const, spot } },
  }
  assert.equal((await resolvePublicSpotSources(sources)).status, 'not-found')
  assert.equal(fallbackReads, 0)
  const recovered = await resolvePublicSpotSources({ ...sources, supabase: async () => ({ status:'failure' as const, error:new Error('timeout') }) })
  assert.equal(recovered.status === 'found' && recovered.source, 'static-fallback')
})

test('Note save, rename, hide, republish and delete invalidate collection, canonical, aliases and Sitemap after persistence', async () => {
  let notes: any[] = [{ slug:'old', aliases:['older'], title:'Note', published:true }]
  const events: string[] = []
  const route = load('app/api/admin/notes/route.ts', {
    '@/lib/server/admin-auth': { requireAdminRequest: async () => ({ ok:true }) },
    '@/lib/public-data': { PRIVATE_NO_STORE:'private, no-store' },
    '@/lib/server/notes-store': {
      normalizeNotePayload: (x: any) => x,
      mutateAuthoritativeNotes: async (mutate: any) => { const next = mutate(notes); notes=next; events.push('persisted'); return next },
    },
    '@/lib/note-sync': { NoteConflictError: Error, mergeNoteSave: (_notes: any, value: any) => [value] },
    'next/cache': { revalidateTag: (tag: string) => events.push(`tag:${tag}`), revalidatePath: (path: string) => events.push(`path:${path}`) },
  })
  for (const published of [true,false,true]) {
    events.length=0
    const response = await route.POST(new Request('http://localhost', { method:'POST', body:JSON.stringify({ slug:'new', previousSlug:'old', aliases:['old','older'], title:'Note', published, updatedAt:'fixture' }) }))
    assert.equal(response.status, 200)
    assert.equal(events[0], 'persisted')
    for (const event of ['tag:notes','tag:note:new','tag:note:old','tag:note:older','path:/notes/new','path:/notes/old','path:/notes/older','path:/sitemap.xml']) assert.ok(events.includes(event), event)
  }
  events.length=0
  const deleted = await route.DELETE(new Request('http://localhost?slug=new&expectedUpdatedAt=fixture'))
  assert.equal(deleted.status, 200)
  assert.equal(notes.length, 0)
  assert.ok(events.includes('path:/notes/older'))
  assert.ok(events.includes('path:/sitemap.xml'))
})

test('Spot snapshot refresh invalidates hidden and published readers only after all snapshot writes succeed', async () => {
  let published = true, fail = false
  const events: string[] = []
  const route = load('app/api/admin/public-data/spots/[id]/route.ts', {
    '@/lib/public-data': { PRIVATE_NO_STORE:'private, no-store' },
    '@/lib/server/admin-auth': { requireAdminRequest: async () => ({ ok:true }) },
    '@/lib/publication-plan': {planPublication},
    '@/lib/server/public-content-store': {readPublicGuides:async()=>[],readPublicNotes:async()=>[]},
    '@/lib/server/location-slugs-store': {readLocationSlugMap:async()=>({}),buildCanonicalLocationPath:async()=>'/spot/canonical-1'},
    '@/lib/server/public-data-resolver': { resolvePublicData: async () => ({ locations: published ? [] : [{id:1,slug:'canonical-1'}],regions:[] }), resolvePublicSnapshotBundleUncached: async () => ({ data:{ locations:published ? [{ id:1,slug:'canonical-1' }] : [] }, spots:published ? [{id:1,slug:'canonical-1'}] : [] }) },
    '@/lib/server/public-spot-resolver': { readAuthoritativePublicSpotById: async () => published ? { id:1,slug:'canonical-1' } : null },
    '@/lib/server/r2': Object.fromEntries(['uploadPublicDataSnapshot','uploadPublicSpotIndex','uploadPublicSpotSnapshot'].map(name => [name, async () => { if (fail) throw new Error('Publication failed'); events.push('write'); return 'fixture' }])),
    'next/cache': { revalidateTag: (tag: string) => events.push(`tag:${tag}`), revalidatePath: (path: string) => events.push(`path:${path}`) },
  })
  for (const visible of [true,false,true]) {
    published=visible; events.length=0
    const response = await route.POST(new Request('http://localhost', { method:'POST' }), { params:{ id:'1' } })
    assert.equal(response.status, 200)
    assert.ok(events.indexOf('tag:public-spots') > events.lastIndexOf('write'))
    for (const event of ['tag:public-data','tag:public-locations','tag:public-spot:spot-1','path:/api/locations','path:/sitemap.xml']) assert.ok(events.includes(event), event)
  }
  fail=true; events.length=0
  assert.equal((await route.POST(new Request('http://localhost', { method:'POST' }), { params:{ id:'1' } })).status, 503)
  assert.ok(!events.some(x => x.startsWith('tag:') || x.startsWith('path:')))
})

test('Next 14.2 runtime-generated path timing is process-local, unlike build-listed paths', () => {
  const { SharedRevalidateTimings } = require('next/dist/server/lib/incremental-cache/shared-revalidate-timings')
  const manifest = { routes:{ '/guide/seeded':{ initialRevalidateSeconds:3600 } } }
  const timings = new SharedRevalidateTimings(manifest)
  timings.clear()
  timings.set('/guide/runtime', 3600)
  assert.equal(timings.get('/guide/runtime'), 3600)
  timings.clear() // a new next start has no process-local timings
  assert.equal(new SharedRevalidateTimings(manifest).get('/guide/runtime'), undefined)
  assert.equal(new SharedRevalidateTimings(manifest).get('/guide/seeded'), 3600)
})

test('Spot aliases share one Data Cache key and targeted refresh tag', async () => {
  const { cache } = require('react')
  const identities: any[] = []
  const loaded = load('lib/server/public-spot-resolver.ts', {
    'react': { cache: cache || ((fn: any) => fn) },
    '@supabase/supabase-js': {},
    '@/lib/spot-content': {},
    '@/lib/location-routing': { extractLocationIdFromSlug: (slug: string) => Number(slug.match(/-(\d+)$/)?.[1]) || null },
    '@/lib/server/location-slugs-store': {},
    '@/lib/public-spot': {},
    'next/cache': { unstable_cache: (_fn: any, key: string[], options: any) => () => { identities.push({key,options}); return null } },
  })
  for (const slug of ['spot-449','the-bund-449','random-prefix-449']) await loaded.getPublicSpotBySlug(slug)
  assert.equal(identities.length, 3)
  assert.equal(new Set(identities.map(i=>JSON.stringify(i))).size, 1)
  assert.ok(identities[0].options.tags.includes('public-spot:spot-449'))
  await loaded.getPublicSpotBySlug('missing-id')
  assert.equal(identities.length, 3)
})

test('manual Guide/Note refresh requires Admin auth and cannot persist data or accept arbitrary paths', async () => {
  for (const kind of ['guides','notes']) {
    let authorized=false
    const calls: string[]=[]
    const mocks: Record<string, any> = {
      '@/lib/server/admin-auth': { requireAdminRequest: async () => authorized ? {ok:true} : {ok:false,response:Response.json({error:'unauthorized'},{status:401})} },
      '@/lib/public-data': {PRIVATE_NO_STORE:'private, no-store'},
      'next/cache': {revalidateTag:(s: string)=>calls.push(`tag:${s}`),revalidatePath:(s: string)=>calls.push(`path:${s}`)},
      '@/lib/server/guides-store': {saveGuides:()=>assert.fail('Refresh must not save')},
      '@/lib/server/notes-store': {mutateAuthoritativeNotes:()=>assert.fail('Refresh must not save')},
      '@/lib/note-sync': {NoteConflictError:Error},
      '@/lib/guide-attractions': {}, '@/lib/guide-legacy-migration': {}, '@/lib/server/public-guide-trip-cost': {},
    }
    const handler=load(`app/api/admin/${kind}/route.ts`,mocks).POST
    const request=(slug: string)=>new Request('http://localhost',{method:'POST',body:JSON.stringify({action:'revalidate-public',slug})})
    assert.equal((await handler(request('target'))).status,401)
    assert.equal(calls.length,0)
    authorized=true
    assert.equal((await handler(request('../../admin'))).status,400)
    assert.equal(calls.length,0)
    assert.equal((await handler(request('target'))).status,200)
    assert.ok(calls.includes(`tag:${kind}`))
    assert.ok(calls.includes('path:/sitemap.xml'))
  }
})
