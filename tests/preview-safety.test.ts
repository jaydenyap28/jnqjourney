import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
const require = createRequire(import.meta.url)
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { NextRequest } = require('next/server')

function fixture(env: Record<string, string>, mocks: Record<string, any> = {}, globals: Record<string, any> = {}) {
  const cache = new Map<string, any>()
  const unexpected = () => { throw Error('Unexpected dependency call before safety guard') }
  const unknown = new Proxy(unexpected, { get: () => unexpected })
  const load = (file: string): any => {
    if (cache.has(file)) return cache.get(file)
    const mod: any = {}
    cache.set(file, mod)
    const context = { exports: mod, process: { env }, console, URL, URLSearchParams, Request, Response, Headers, Buffer, AbortSignal, setTimeout, clearTimeout, ...globals,
      require: (id: string) => {
        if (id in mocks) return mocks[id]
        if (['@/lib/preview-safety', '@/lib/internal-http', '@/lib/server/admin-auth'].includes(id)) return load(`${id.slice(2)}.ts`)
        if (id === '@/lib/server/package-visibility') return load('lib/server/package-visibility.ts')
        if (id === './supabase-read-key') return load('lib/server/supabase-read-key.ts')
        if (id === '@/lib/site-fonts') return { siteFontClassName: 'fixture-fonts' }
        if (id === 'next/server' || id === 'react' || id === 'react/jsx-runtime') return require(id)
        return unknown
      } }
    vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText, context, { filename: file })
    return mod
  }
  return load
}
const production = { VERCEL_ENV: 'production', ADMIN_EMAILS: ' Admin@Example.test ', NEXT_PUBLIC_SUPABASE_URL: 'https://auth.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture' }
const preview = { ...production, VERCEL_ENV: 'preview', VERCEL_URL: 'rc11-fixture.vercel.app' }
const request = (path = '/api/admin/locations') => new Request(`https://rc11-fixture.vercel.app${path}`, { method: 'POST', headers: { authorization: 'Bearer fixture' }, body: '{}' })

test('ADMIN_EMAILS absent or empty fails closed before SDK or Auth requests', async () => {
  for (const ADMIN_EMAILS of ['', ' , , ']) {
    const load = fixture({ ...production, ADMIN_EMAILS })
    const result = await load('lib/server/admin-auth.ts').requireAdminRequest(request())
    assert.equal(result.ok, false); assert.equal(result.response.status, 503)
    assert.equal(result.response.headers.get('cache-control'), 'private, no-store')
  }
})

test('Production admin success, rejected email, empty email and invalid token keep real auth checks', async () => {
  for (const [email, error, expected] of [['admin@example.test', null, 200], ['other@example.test', null, 403], ['', null, 403], ['admin@example.test', 'invalid', 401]]) {
    let calls = 0
    const load = fixture(production, { '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => { calls++; return { data: { user: { email } }, error } } } }) } })
    const result = await load('lib/server/admin-auth.ts').requireAdminRequest(request())
    assert.equal(result.ok ? 200 : result.response.status, expected); assert.equal(calls, 1)
  }
})

function files(dir: string): string[] { return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]) }
test('every App admin handler and upload rejects Preview before SDK, files, publication or invalidation', async () => {
  const load = fixture(preview, { '@/lib/server/storage-admin': { getStorageBucketName: () => 'fixture-bucket' } })
  const routes = [...files('app/api/admin'), 'app/api/upload/r2/route.ts'].filter(file => file.endsWith('/route.ts'))
  let exercised = 0
  for (const file of routes) {
    const handler = load(file)
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      if (typeof handler[method] !== 'function') continue
      const response = await handler[method](request(), { params: { id: '1', slug: 'fixture' } })
      assert.equal(response.status, 503, `${file} ${method}`)
      assert.equal((await response.json()).code, 'PREVIEW_READ_ONLY', `${file} ${method}`)
      exercised++
    }
  }
  assert.ok(exercised >= 35)
})

test('every Pages admin API rejects Preview before database, AI or ISR work', async () => {
  const load = fixture(preview)
  for (const file of files('pages/api/admin').filter(file => file.endsWith('.ts'))) {
    let status = 200, payload: any
    const res: any = { setHeader() {}, status(code: number) { status = code; return res }, json(value: any) { payload = value; return res }, end() { return res } }
    await load(file).default({ method: 'POST', headers: { authorization: 'Bearer fixture' }, query: { id: '1' }, body: {} }, res)
    assert.equal(status, 503, file); assert.equal(payload.code, 'PREVIEW_READ_ONLY', file)
  }
})

test('Preview Page View and Affiliate explicitly skip even with inherited production credentials', async () => {
  const load = fixture({ ...preview, SUPABASE_SERVICE_ROLE_KEY: 'inherited-fixture' })
  for (const file of ['app/api/page-view/route.ts', 'app/api/affiliate-click/route.ts']) {
    const response = await load(file).POST(request())
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.deepEqual(await response.json(), { ok: true, skipped: true, reason: 'preview-read-only' })
  }
})

test('Production Page View and Affiliate still execute existing statistics writes', async () => {
  for (const file of ['app/api/page-view/route.ts', 'app/api/affiliate-click/route.ts']) {
    const writes: string[] = []
    const client = { from: (table: string) => ({
      insert: async () => { writes.push(`insert:${table}`); return { error: null } },
      select: () => ({ eq: () => ({ single: async () => ({ data: { id: 1, clicks: 2, is_active: true }, error: null }) }) }),
      update: () => ({ eq: async () => { writes.push(`update:${table}`); return { error: null } } }),
    }) }
    const load = fixture({ ...production, SUPABASE_SERVICE_ROLE_KEY: 'fixture' }, { '@supabase/supabase-js': { createClient: () => client } })
    const response = await load(file).POST(new Request('https://app.invalid', { method: 'POST', body: JSON.stringify({ path: '/', contentType: 'home', affiliateLinkId: 1 }) }))
    assert.equal(response.status, 200); assert.equal((await response.json()).skipped, undefined)
    assert.deepEqual(writes, file.includes('page-view') ? ['insert:page_views'] : ['insert:affiliate_clicks', 'update:affiliate_links'])
  }
})

test('server App layout omits GA and all tracker components only in Preview', () => {
  const marker = () => React.createElement('i', { 'data-fixture-tracker': 'yes' })
  for (const VERCEL_ENV of ['preview', 'production']) {
    const load = fixture({ VERCEL_ENV, NEXT_PUBLIC_GA_MEASUREMENT_ID: 'G-FIXTURE' }, {
      'next/font/google': Object.fromEntries(['Cormorant_Garamond', 'Noto_Sans_SC', 'Noto_Serif_SC', 'Poppins'].map(key => [key, () => ({ variable: 'font' })])),
      '@vercel/analytics/react': { Analytics: marker }, '@vercel/speed-insights/next': { SpeedInsights: marker },
      '@/components/GoogleAnalytics': marker, '@/components/PageViewTracker': marker,
      '@/components/SiteStructuredData': () => null, '@/components/PublicLanguageControl': () => null,
      '@/lib/site': { getSiteUrl: () => new URL('https://app.invalid') },
      '@/lib/seo': { buildMetaDescription: (s: string) => s, buildOpenGraphData: () => ({}), buildTwitterCardData: () => ({}) },
    })
    const html = renderToStaticMarkup(load('app/layout.tsx').default({ children: 'fixture' }))
    assert.equal((html.match(/data-fixture-tracker/g) || []).length, VERCEL_ENV === 'preview' ? 0 : 4)
  }
})

test('server admin layout never mounts Supabase login or auth shell in Preview', () => {
  for (const VERCEL_ENV of ['preview', 'production']) {
    const load = fixture({ VERCEL_ENV }, { '@/components/AdminAuthShell': ({ children }: any) => React.createElement('section', { 'data-auth-shell': 'yes' }, children) })
    const html = renderToStaticMarkup(load('app/admin/layout.tsx').default({ children: React.createElement('form', { 'data-login': 'yes' }) }))
    assert.equal(html.includes('data-auth-shell'), VERCEL_ENV === 'production')
    assert.equal(html.includes('data-login'), VERCEL_ENV === 'production')
  }
})

test('English Pages shell and GA event helper stay disabled through Preview hydration', () => {
  const marker = () => React.createElement('i', { 'data-fixture-tracker': 'yes' })
  for (const flag of ['1', '0']) {
    let events = 0
    const env: Record<string, string> = { VERCEL_ENV: flag === '1' ? 'preview' : 'production', JNQ_PREVIEW_READ_ONLY: flag }
    const load = fixture(env, {
      'next/font/google': Object.fromEntries(['Cormorant_Garamond', 'Noto_Sans_SC', 'Noto_Serif_SC', 'Poppins'].map(key => [key, () => ({ variable: 'font' })])),
      '@vercel/analytics/react': { Analytics: marker }, '@vercel/speed-insights/next': { SpeedInsights: marker },
    }, { window: { gtag: () => events++ } })
    const html = renderToStaticMarkup(load('pages/_app.tsx').default({ Component: () => 'fixture', pageProps: {} }))
    assert.equal((html.match(/data-fixture-tracker/g) || []).length, flag === '1' ? 0 : 2)
    load('lib/analytics.ts').trackEvent('affiliate_click')
    assert.equal(events, flag === '1' ? 0 : 1)
  }
})

test('internal auth forwarding selects only protection credentials on exact deployment origin', () => {
  const headers = fixture(preview)('lib/internal-http.ts').internalPreviewHeaders(new Request('https://rc11-fixture.vercel.app/spot/one-1', { headers: {
    cookie: 'app-session=private; _vercel_jwt=fixture-jwt; __vercel_protection_bypass=fixture-cookie; ga=ignored',
    authorization: 'Bearer app-token', 'x-vercel-protection-bypass': 'fixture-header', 'x-vercel-set-bypass-cookie': 'true',
  } }), new URL('https://rc11-fixture.vercel.app/api/spot-routing/one-1'))
  assert.equal(headers.get('cookie'), '_vercel_jwt=fixture-jwt; __vercel_protection_bypass=fixture-cookie')
  assert.equal(headers.get('x-vercel-protection-bypass'), 'fixture-header')
  assert.equal(headers.get('authorization'), null); assert.equal(headers.get('x-vercel-set-bypass-cookie'), null)
  assert.equal([...headers].length, 2)
  const withoutCredentials = fixture({ ...preview, VERCEL_AUTOMATION_BYPASS_SECRET: 'must-not-be-used' })('lib/internal-http.ts').internalPreviewHeaders(request(), new URL(request().url))
  assert.equal([...withoutCredentials].length, 0)
})

test('production, third-party, branch alias, spoofed Host and credential URLs cannot receive Preview auth', () => {
  const forward = fixture(preview)('lib/internal-http.ts').internalPreviewHeaders
  for (const target of ['https://www.jnqjourney.com/api/x', 'https://other.invalid/api/x', 'https://branch.vercel.app/api/x', 'http://rc11-fixture.vercel.app/api/x', 'https://user@rc11-fixture.vercel.app/api/x']) {
    assert.throws(() => forward(request(), new URL(target)), /Untrusted/)
  }
  assert.throws(() => forward(new Request('https://other.invalid', { headers: { host: preview.VERCEL_URL, 'x-forwarded-host': preview.VERCEL_URL } }), new URL(`https://${preview.VERCEL_URL}/api/x`)), /Untrusted/)
  assert.throws(() => fixture({ ...preview, VERCEL_URL: '' })('lib/internal-http.ts').internalPreviewHeaders(request(), new URL(request().url)), /Unverified/)
  assert.equal([...fixture(production)('lib/internal-http.ts').internalPreviewHeaders(request(), new URL('https://app.invalid'))].length, 0)
})

test('protected Spot Middleware forwards auth once, rejects redirects and forged origins without following them', async () => {
  let calls = 0, redirect = false
  const load = fixture(preview, {}, { console: { error() {} }, fetch: async (url: URL, init: RequestInit) => {
    calls++
    if (url.pathname === '/rest/v1/travel_packages') {
      assert.equal(url.origin, preview.NEXT_PUBLIC_SUPABASE_URL)
      assert.equal(init.redirect, 'error')
      assert.equal(init.cache, 'no-store')
      const headers = new Headers(init.headers)
      assert.equal(headers.get('apikey'), preview.NEXT_PUBLIC_SUPABASE_ANON_KEY)
      assert.equal(headers.has('cookie'), false)
      return Response.json([{ id: 1 }])
    }
    assert.equal(init.redirect, 'manual'); assert.equal(new Headers(init.headers).get('cookie'), '_vercel_jwt=fixture')
    return redirect ? new Response(null, { status: 302, headers: { location: 'https://www.jnqjourney.com' } }) : Response.json({ visible: true })
  } })
  const handler = load('middleware.ts').middleware
  const req = new NextRequest('https://rc11-fixture.vercel.app/spot/one-1', { headers: { cookie: '_vercel_jwt=fixture' } })
  assert.equal((await handler(req)).status, 200); assert.equal(calls, 1)
  redirect = true
  assert.equal((await handler(req)).status, 503); assert.equal(calls, 2)
  assert.equal((await handler(new NextRequest('https://www.jnqjourney.com/spot/one-1'))).status, 503); assert.equal(calls, 2)
  assert.equal((await handler(new NextRequest('https://rc11-fixture.vercel.app/packages/fixture', { headers: { cookie: '_vercel_jwt=fixture' } }))).status, 200); assert.equal(calls, 3)
  assert.equal((await handler(new NextRequest('https://www.jnqjourney.com/packages/fixture'))).status, 503); assert.equal(calls, 3)
})

test('publication HTML read-back refuses cross-origin redirects before forwarding a second request', async () => {
  let calls = 0
  const load = fixture(preview, {
    '@/lib/publication-plan': { validPublicationPath: () => true }, '@/lib/site': { getSiteUrl: () => new URL('https://www.jnqjourney.com') },
  }, { fetch: async (_url: string, init: RequestInit) => { calls++; assert.equal(init.redirect, 'manual'); return new Response(null, { status: 307, headers: { location: 'https://www.jnqjourney.com/guide/g' } }) } })
  await assert.rejects(() => load('lib/server/publication.ts').verifyPublication(request(), [{ path: '/guide/g', status: 200 }]), /Invalid public redirect/)
  assert.equal(calls, 1)
})
