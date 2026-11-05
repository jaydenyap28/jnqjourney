const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const { createClient } = require('@supabase/supabase-js')
const { NextRequest } = require('next/server')
const { loader } = require('./helpers/spot-travel-loader.cjs')

const [ID, TARGET] = JSON.parse(fs.readFileSync('data/spot-routing-snapshot.json', 'utf8')).publishedSpotIds.filter(id => id !== 450)
const SELECT = 'id,status,publication_status,redirect_url,redirect_type'
const row = (id = ID, patch = {}) => ({ id, status: 'active', publication_status: 'published', redirect_url: null, redirect_type: null, ...patch })

function fixture({ transport, environment = {} } = {}) {
  const records = new Map([[ID, row()], [TARGET, row(TARGET)]])
  const calls = []
  let payloadReads = 0, clients = 0, cachedBodiesServed = 0
  const globals = {
    process: { cwd: process.cwd, env: { NEXT_PUBLIC_SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-test-only', ...environment } },
    fetch: async (input, init) => {
      const url = new URL(input)
      const id = Number(url.searchParams.get('id').replace('eq.', ''))
      calls.push({ id, select: url.searchParams.get('select'), cache: init.cache, signal: init.signal })
      assert.equal(url.pathname, '/rest/v1/locations')
      assert.equal(url.searchParams.get('select'), SELECT)
      assert.equal(init.cache, 'no-store')
      assert.equal(init.redirect, 'error')
      return transport ? transport(input, init) : Response.json(records.has(id) ? [records.get(id)] : [])
    },
  }
  const mocks = {
    '@supabase/supabase-js': { createClient: (...args) => { clients++; return createClient(...args) } },
    '@/lib/server/public-spot-resolver': {
      getPublicSpotBySlug: async () => { payloadReads++; return { spot: { id: ID, name: 'Cached gallery', images: ['old-cache'] }, source: 'cdn-cache', quality: { indexable: true, score: 10 } } },
      PublicSpotUnavailableError: class extends Error {},
    },
    '@/lib/server/location-slugs-store': { buildPublicCanonicalLocationPath: async () => `/spot/current-${ID}` },
    '@/lib/server/localization-snapshot': { readLocalizationSnapshot: async () => ({ schemaVersion: 1, records: [] }) },
    '@/lib/server/package-visibility': { packageVisibility: () => assert.fail('Spot must not invoke package guard') },
  }
  const load = loader(mocks, globals)
  const routing = load('app/api/spot-routing/[slug]/route.ts')
  const detail = load('app/api/spots/[slug]/route.ts')
  const middleware = loader(mocks, { ...globals, fetch: async input => {
    const url = new URL(input)
    assert.ok(url.pathname.startsWith('/api/spot-routing/'))
    return routing.GET(new Request(url), { params: { slug: url.pathname.split('/').at(-1) } })
  } })('middleware.ts')
  return {
    records, calls, routing, detail, middleware, load,
    get payloadReads() { return payloadReads }, get clients() { return clients }, get cachedBodiesServed() { return cachedBodiesServed },
    async page(prefix = '/spot', slug = `current-${ID}`, headers = {}) {
      const response = await middleware.middleware(new NextRequest(`https://jnq.test${prefix}/${slug}`, { headers }))
      if (response.headers.get('x-middleware-next') === '1') cachedBodiesServed++
      return response
    },
    api() { return detail.GET(new Request(`https://jnq.test/api/spots/current-${ID}`), { params: { slug: `current-${ID}` } }) },
  }
}

function blocked(response, status) {
  assert.equal(response.status, status)
  assert.match(response.headers.get('cache-control'), /no-store/)
  assert.match(response.headers.get('x-robots-tag'), /noindex/)
}

test('published pages use one small live query and cached payload; explicit legacy null remains supported', async () => {
  const f = fixture()
  assert.equal((await f.page()).status, 200)
  assert.equal(f.calls.length, 1)
  assert.equal(f.payloadReads, 1)
  f.records.set(ID, row(ID, { publication_status: null }))
  assert.equal((await f.page()).status, 200)
  assert.equal(f.calls.length, 2, 'visibility must be queried again, never memoized')
  assert.equal(f.middleware.config.matcher.includes('/spot/:path*'), true)
  assert.equal(f.middleware.config.matcher.includes('/en/spot/:path*'), true)
})

test('disconnection, timeout, HTTP errors, old schema and malformed rows fail closed before cached data', async t => {
  const cases = [
    ['network', () => { throw new TypeError('disconnected') }],
    ['timeout', () => { throw new DOMException('timed out', 'TimeoutError') }],
    ['500', () => Response.json({ message: 'upstream failure' }, { status: 500 })],
    ['permission', () => Response.json({ message: 'permission denied', code: '42501' }, { status: 403 })],
    ['missing schema column', () => Response.json({ message: 'column absent', code: '42703' }, { status: 400 })],
    ['schema cache error', () => Response.json({ message: 'column absent', code: 'PGRST204' }, { status: 400 })],
    ['duplicate rows', () => Response.json([row(), row()])],
    ['invalid JSON shape', () => Response.json('unexpected')],
    ['wrong id', () => Response.json([row(TARGET)])],
    ['unknown publication', () => Response.json([row(ID, { publication_status: 'unknown' })])],
    ['blank status', () => Response.json([row(ID, { status: '   ' })])],
    ['invalid redirect type', () => Response.json([row(ID, { redirect_type: 307 })])],
    ...['id', 'status', 'publication_status', 'redirect_url', 'redirect_type'].map(key => [`missing ${key}`, () => { const value = row(); delete value[key]; return Response.json([value]) }]),
  ]
  for (const [name, transport] of cases) await t.test(name, async () => {
    const f = fixture({ transport })
    blocked(await f.page(), 503)
    blocked(await f.api(), 503)
    assert.equal(f.calls.length, 2, 'no id/status schema retry or snapshot recovery')
    assert.equal(f.payloadReads, 0)
    assert.equal(f.cachedBodiesServed, 0)
  })
})

test('old snapshot published status cannot override live hidden, draft, inactive or deleted state', async t => {
  for (const [name, value] of [
    ['hidden', row(ID, { publication_status: 'hidden' })], ['draft', row(ID, { publication_status: 'draft' })],
    ['inactive', row(ID, { status: 'inactive' })], ['deleted', null],
    ['inactive blank redirect', row(ID, { status: 'inactive', redirect_url: '   ' })],
  ]) await t.test(name, async () => {
    const f = fixture()
    if (value) f.records.set(ID, value); else f.records.delete(ID)
    blocked(await f.page('/spot', `old-alias-${ID}`), 404)
    blocked(await f.page('/en/spot', `current-${ID}`, { rsc: '1', 'next-router-prefetch': '1' }), 404)
    blocked(await f.api(), 404)
    assert.equal(f.payloadReads, 0); assert.equal(f.cachedBodiesServed, 0)
  })
})

test('current redirects and chains preserve 301/302 and re-read changed targets', async () => {
  const f = fixture()
  f.records.set(ID, row(ID, { publication_status: 'hidden', redirect_url: '/notes/old-target', redirect_type: 301 }))
  let response = await f.page()
  blocked(response, 301); assert.equal(new URL(response.headers.get('location')).pathname, '/notes/old-target')
  f.records.set(ID, row(ID, { redirect_url: `/spot/next-${TARGET}`, redirect_type: 302 }))
  f.records.set(TARGET, row(TARGET, { redirect_url: '/notes/latest-target', redirect_type: 301 }))
  response = await f.page()
  blocked(response, 302); assert.equal(new URL(response.headers.get('location')).pathname, '/notes/latest-target')
  assert.deepEqual(f.calls.map(call => call.id), [ID, ID, TARGET])
  assert.equal(f.calls[1].signal, f.calls[2].signal, 'the full chain shares one cancellation deadline')
  assert.equal(f.payloadReads, 0)
})

test('hidden/deleted targets, loops, unsafe redirects and withdrawn targets cannot be followed', async t => {
  for (const state of ['hidden', 'deleted', 'loop', 'unsafe', 'withdrawn']) await t.test(state, async () => {
    const f = fixture()
    f.records.set(ID, row(ID, { redirect_url: state === 'unsafe' ? 'https://external.invalid/' : `/spot/target-${state === 'withdrawn' ? 450 : TARGET}` }))
    if (state === 'hidden') f.records.set(TARGET, row(TARGET, { publication_status: 'hidden' }))
    if (state === 'deleted') f.records.delete(TARGET)
    if (state === 'loop') f.records.set(TARGET, row(TARGET, { redirect_url: `/spot/source-${ID}` }))
    blocked(await f.page(), ['loop', 'unsafe'].includes(state) ? 503 : 404)
    assert.equal(f.payloadReads, 0)
    assert.ok(!f.calls.some(call => call.id === 450))
  })
})

test('direct detail API cannot be served from a shared HTTP cache or skip the live gate', async () => {
  const f = fixture()
  const response = await f.api()
  assert.equal(response.status, 200)
  assert.match(response.headers.get('cache-control'), /no-store/)
  assert.equal(f.detail.dynamic, 'force-dynamic'); assert.equal(f.detail.revalidate, 0)
  f.records.set(ID, row(ID, { publication_status: 'hidden' }))
  blocked(await f.api(), 404)
  assert.equal(f.payloadReads, 1)
  assert.equal(f.calls.length, 2)
})

test('ID 450 never reaches the SDK or a cached body, even when credentials are missing', async () => {
  const f = fixture({ environment: { NEXT_PUBLIC_SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' } })
  blocked(await f.page('/spot', 'withdrawn-450'), 404)
  blocked(await f.page('/en/spot', 'alias-450'), 404)
  blocked(await f.detail.GET(new Request('https://jnq.test/api/spots/withdrawn-450'), { params: { slug: 'withdrawn-450' } }), 404)
  assert.equal(f.clients, 0); assert.equal(f.payloadReads, 0)
  blocked(await f.page(), 503)
})

test('real SDK transport really cancels a stalled publication query at 2.5 seconds', { timeout: 7000 }, async () => {
  let disconnected
  const closed = new Promise(resolve => { disconnected = resolve })
  const server = http.createServer((_req, res) => { res.on('close', disconnected); res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('[') })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const f = fixture({ environment: { NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${server.address().port}` }, transport: fetch })
    const start = Date.now()
    blocked(await f.page(), 503)
    assert.ok(Date.now() - start >= 2400 && Date.now() - start < 5500)
    await closed
    assert.equal(f.calls[0].signal.aborted, true)
    assert.equal(f.payloadReads, 0)
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
})
