const test = require('node:test')
const assert = require('node:assert/strict')
const { NextRequest } = require('next/server')
const { loader } = require('./helpers/spot-travel-loader.cjs')

function fixture(environment, reply = Response.json({ visible: true })) {
  const calls = []
  const middleware = loader({ '@/lib/server/package-visibility': { packageVisibility: async () => 404 } }, {
    process: { env: { VERCEL_ENV: environment } },
    fetch: async (url, init) => { calls.push({ url, init }); return reply },
  })('middleware.ts').middleware
  const request = new NextRequest('https://preview.vercel.app/en/spot/the-bund-449?_vercel_share=test-share', { headers: {
    cookie: 'sb-auth-token=private; __vercel_protection_bypass=test-access; unrelated=private; __vercel_sso_cookie=test-sso',
    'x-vercel-protection-bypass': 'test-proof', 'x-vercel-trusted-oidc-idp-token': 'test-oidc',
  } })
  return { calls, request, middleware }
}

test('protected Preview forwards only Vercel proof to the same-origin live API', async () => {
  const f = fixture('preview'), result = await f.middleware(f.request)
  assert.equal(result.status, 200)
  const { url, init } = f.calls[0]
  assert.equal(url.origin, f.request.nextUrl.origin)
  assert.equal(url.pathname, '/api/spot-routing/the-bund-449')
  assert.equal(url.searchParams.get('locale'), 'en')
  assert.equal(url.searchParams.get('_vercel_share'), 'test-share')
  assert.equal(init.headers.get('cookie'), '__vercel_protection_bypass=test-access; __vercel_sso_cookie=test-sso')
  assert.equal(init.headers.get('x-vercel-protection-bypass'), 'test-proof')
  assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'manual')
})

test('Production does not forward Preview credentials or change its routing URL', async () => {
  const f = fixture('production'); await f.middleware(f.request)
  assert.equal([...f.calls[0].init.headers].length, 0)
  assert.equal(f.calls[0].url.searchParams.has('_vercel_share'), false)
})

test('Preview access proof cannot bypass hidden or unavailable publication state', async () => {
  for (const status of [404, 503]) {
    const f = fixture('preview', new Response('', { status })), result = await f.middleware(f.request)
    assert.equal(result.status, status)
    assert.match(result.headers.get('cache-control'), /no-store/)
    assert.match(result.headers.get('x-robots-tag'), /noindex/)
  }
})
