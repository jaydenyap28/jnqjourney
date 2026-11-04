const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { createClient } = require('@supabase/supabase-js')
const { loader } = require('./helpers/spot-travel-loader.cjs')

function fixture(transport, env = {}, upstreamSignal) {
  const requests = []
  let clients = 0, writes = 0
  const fetcher = async (input, init) => {
    requests.push({ url: String(input), ...init })
    return transport(input, init)
  }
  const load = loader({
    'node:fs': { promises: {
      readFile: async () => '{"7":"local-fallback"}', mkdir: async () => {},
      writeFile: async () => { writes++ },
    } },
    '@supabase/supabase-js': { createClient(url, key, options) {
      clients++
      const clientFetch = options.global?.fetch ?? fetcher
      return createClient(url, key, { ...options, global: { fetch: (input, init) =>
        clientFetch(input, upstreamSignal ? { ...init, signal: upstreamSignal } : init) } })
    } },
  }, { fetch: fetcher, process: { cwd: process.cwd, env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://synthetic.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-test-only-key', ...env,
  } } })
  return { store: load('lib/server/location-slugs-store.ts'), requests,
    get clients() { return clients }, get writes() { return writes } }
}

const missing = () => new Response('{"message":"not found","statusCode":"404"}', { status: 404 })

test('locked Storage SDK normalizes the public map and keeps the legacy 404 fallback', async () => {
  const f = fixture(input => String(input).endsWith('.webp') ? missing() : new Response('{"9":"Custom Name"}'))
  assert.deepEqual(await f.store.readPublicLocationSlugMap(), { 9: 'custom-name' })
  assert.equal(f.requests.length, 2)
  assert.ok(f.requests.every(request => request.signal instanceof AbortSignal))
  assert.ok(f.requests.every(request => request.headers.get('apikey') === 'synthetic-test-only-key'))
  assert.equal(f.writes, 0)
})

test('strict failures are not cached as success or silently replaced with local data', async t => {
  for (const [name, response, message] of [
    ['503', () => new Response('{"message":"unavailable"}', { status: 503 }), /unavailable/],
    ['empty', () => new Response(''), /empty/],
    ['malformed', () => new Response('{'), /JSON/],
    ['array', () => new Response('[]'), /Invalid/],
  ]) await t.test(name, async () => {
    const f = fixture(response)
    await assert.rejects(f.store.readPublicLocationSlugMap(), message)
    assert.equal(f.requests.length, 1)
    assert.equal(f.writes, 0)
  })
})

test('only missing strict data and non-strict failures retain their original local fallback', async () => {
  const missingFixture = fixture(missing)
  assert.deepEqual(await missingFixture.store.readPublicLocationSlugMap(), { 7: 'local-fallback' })
  assert.equal(missingFixture.requests.length, 2)
  const tolerant = fixture(() => new Response('{"message":"unavailable"}', { status: 503 }))
  assert.deepEqual(await tolerant.store.readLocationSlugMap(true), { 7: 'local-fallback' })
  assert.equal(tolerant.requests.length, 2)
  assert.ok(tolerant.requests.every(request => request.cache === 'no-store' && !request.signal))
})

test('strict transport preserves an existing cancellation signal', async () => {
  const controller = new AbortController()
  controller.abort(new Error('caller cancelled'))
  const f = fixture((_input, init) => {
    assert.equal(init.signal.aborted, true)
    init.signal.throwIfAborted()
  }, {}, controller.signal)
  await assert.rejects(f.store.readPublicLocationSlugMap(), /unavailable/)
  assert.equal(f.requests.length, 1)
})

test('the four-second deadline really disconnects stalled HTTP requests and body reads', { timeout: 14000 }, async t => {
  for (const bodyStarted of [false, true]) await t.test(bodyStarted ? 'stalled body' : 'stalled headers', async () => {
    let disconnected
    const closed = new Promise(resolve => { disconnected = resolve })
    const server = http.createServer((_req, res) => {
      res.on('close', disconnected)
      if (bodyStarted) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('{') }
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const f = fixture(fetch, { NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${server.address().port}` })
      const started = Date.now()
      await assert.rejects(f.store.readPublicLocationSlugMap())
      assert.ok(Date.now() - started >= 3900)
      assert.ok(Date.now() - started < 6500)
      await closed
      assert.equal(f.requests.length, 1)
      assert.equal(f.requests[0].signal.aborted, true)
      assert.equal(f.writes, 0)
    } finally {
      server.closeAllConnections()
      await new Promise(resolve => server.close(resolve))
    }
  })
})
