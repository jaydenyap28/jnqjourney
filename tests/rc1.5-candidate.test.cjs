const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function load(file, mocks, globals = {}) {
  const context = { exports: {}, process: { env: {} }, console, Response, Request, ...globals,
    require: id => id in mocks ? mocks[id] : require(id) }
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText, context)
  return context.exports
}
function affiliate(storage, fetcher) {
  const jsx = (type, props) => ({ type, props })
  const component = load('components/AffiliateCard.tsx', {
    react: { ...require('react'), useState: v => [v, () => {}], useEffect: () => {}, useCallback: fn => fn, useMemo: fn => fn() },
    'react/jsx-runtime': { jsx, jsxs: jsx }, '@/components/PublicLocale': { PublicCopy: 'copy' },
    '@/components/ui/badge': { Badge: 'badge' }, '@/components/ui/button': { Button: 'button' },
    '@/components/ui/card': new Proxy({}, { get: (_, key) => String(key) }),
    '@/lib/analytics': { trackEvent: () => {}, getDeviceType: () => 'mobile' },
  }, { window: { location: { pathname: '/spot/test-1' }, localStorage: storage },
    document: { title: 'Fixture', referrer: '' }, navigator: { userAgent: 'Fixture' }, fetch: fetcher }).default
  function nodes(tree) {
    if (!tree || typeof tree !== 'object') return []
    if (Array.isArray(tree)) return tree.flatMap(nodes)
    return [tree, ...nodes(tree.props?.children)]
  }
  return nodes(component({ initialLinks: [{ id: 12, provider: 'trip', link_type: 'ticket', url: 'https://example.test/product' }], locationId: 1 })).find(n => n.type === 'a')
}
test('native affiliate click initiates one keepalive POST before returning, without awaiting delivery', () => {
  const sent = []
  const link = affiliate({ getItem: () => 'fixture-session' }, (url, options) => { sent.push({ url, options }); return new Promise(() => {}) })
  assert.equal(link.props.onClick(), undefined)
  assert.equal(link.props.href, 'https://example.test/product')
  assert.equal(sent.length, 1)
  assert.equal(sent[0].url, '/api/affiliate-click')
  assert.equal(sent[0].options.method, 'POST')
  assert.equal(sent[0].options.keepalive, true)
  assert.equal(JSON.parse(sent[0].options.body).affiliateLinkId, 12)
})
test('restricted browser storage does not discard an otherwise deliverable affiliate click', () => {
  for (const mode of ['read', 'write']) {
    const sent = []
    const storage = { getItem: () => { if (mode === 'read') throw Error('SecurityError'); return null }, setItem: () => { throw Error('QuotaExceededError') } }
    const link = affiliate(storage, (url, options) => { sent.push(options); return Promise.resolve({ ok: true }) })
    assert.equal(link.props.onClick(), undefined)
    assert.equal(sent.length, 1)
    assert.equal(JSON.parse(sent[0].body).sessionId, '')
  }
})
test('rejected delivery is consumed without retry or blocking the native link', async () => {
  let requests = 0
  const link = affiliate({ getItem: () => 'fixture-session' }, () => { requests++; return Promise.reject(Error('offline')) })
  assert.equal(link.props.onClick(), undefined)
  await new Promise(setImmediate)
  assert.equal(requests, 1)
})
test('the actual affiliate handler exits in Preview before creating any database client', async () => {
  const preview = load('lib/preview-safety.ts', {}, { process: { env: { VERCEL_ENV: 'preview' } } })
  const route = load('app/api/affiliate-click/route.ts', {
    'next/server': { NextResponse: { json: Response.json } },
    '@supabase/supabase-js': { createClient: () => assert.fail('Preview must not create a database writer') },
    '@/lib/preview-safety': preview,
  })
  const result = await route.POST(new Request('http://fixture.test/api/affiliate-click', { method: 'POST', body: '{}' }))
  assert.equal(result.status, 200)
  assert.equal((await result.json()).reason, 'preview-read-only')
})
