const test = require('node:test')
const assert = require('node:assert/strict')
const { loader } = require('./helpers/spot-travel-loader.cjs')

function browser({ host = 'www.jnqjourney.com', blockedStorage = false, agent = 'Mozilla/5.0 Chrome/130.0 Mobile Safari/537.36' } = {}) {
  const saved = new Map(), calls = [], events = []
  const location = { hostname: host, origin: `https://${host}`, pathname: '/en/spot/the-bund-449', search: '?utm_source=google&utm_medium=organic' }
  const window = { location, localStorage: {
    getItem: k => { if (blockedStorage) throw Error('denied'); return saved.get(k) || null },
    setItem: (k, v) => { if (blockedStorage) throw Error('denied'); saved.set(k, v) },
  }, matchMedia: () => ({ matches: true }), gtag: (...args) => events.push(args) }
  const load = loader({}, { window, document: { referrer: 'https://www.google.com/' }, navigator: { userAgent: agent },
    fetch: async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response('{}') } })
  return { load, calls, saved, events, location }
}

test('English landing + navigation retain visitor/visit/source and count real returns', () => {
  const b = browser(), { recordPageView } = b.load('lib/page-view.ts')
  recordPageView('/en/spot/the-bund-449?utm_source=google&utm_medium=organic')
  recordPageView('/en/spot/the-bund-449?utm_source=google&utm_medium=organic') // strict-effect duplicate
  b.location.search = ''
  recordPageView('/en/guide/jiangnan')
  recordPageView('/en/spot/the-bund-449') // real return within same minute
  assert.equal(b.calls.length, 3)
  const first = b.calls[0].body, next = b.calls[1].body
  assert.equal(first.contentType, 'spot'); assert.equal(first.contentSlug, 'the-bund-449')
  assert.ok(first.visitorId && first.visitId); assert.equal(next.visitorId, first.visitorId); assert.equal(next.visitId, first.visitId)
  assert.equal(next.trafficSource, 'google'); assert.equal(next.deviceType, 'mobile')
  assert.match(next.referrer, /\/en\/spot\/the-bund-449/)
})

test('blocked storage still tracks and reuses in-memory identity', () => {
  const b = browser({ blockedStorage: true }), { recordPageView } = b.load('lib/page-view.ts')
  recordPageView('/en'); recordPageView('/en/guide/route')
  assert.equal(b.calls.length, 2)
  assert.equal(b.calls[0].body.visitorId, b.calls[1].body.visitorId)
  assert.equal(b.calls[0].body.visitId, b.calls[1].body.visitId)
})

test('production-only and explicit bot/path exclusions do not misclassify Cubot phones', () => {
  for (const options of [{ host: 'preview.vercel.app' }, { agent: 'Googlebot/2.1' }, { agent: 'HeadlessChrome/130.0' }]) {
    const b = browser(options); b.load('lib/page-view.ts').recordPageView('/en'); assert.equal(b.calls.length, 0)
  }
  const b = browser({ agent: 'Mozilla/5.0 (Linux; Android 14; CUBOT KINGKONG)' }), { recordPageView } = b.load('lib/page-view.ts')
  for (const path of ['/admin', '/api/a', '/en/admin/a', '/preview/a', '/en/spot/x?preview=1']) recordPageView(path)
  assert.equal(b.calls.length, 0)
  recordPageView('/en/spot/x'); assert.equal(b.calls.length, 1)
})

test('Spot click uses existing conversion events plus first-party delivery', () => {
  const b = browser(), { trackSpotNavigation } = b.load('lib/analytics.ts')
  trackSpotNavigation(449, 'guide', 'jiangnan', 'spot_reading_cue')
  trackSpotNavigation(461, 'package', 'hainan', 'spot_related_package')
  assert.deepEqual(b.events.map(e => e[1]), ['related_guide_click', 'package_cta_click'])
  assert.deepEqual(b.calls.map(c => c.body.eventName), ['related_guide_click', 'package_cta_click'])
})

test('page-view API uses request UA, rejects Preview/hidden routes and preserves valid fields without live writes', async () => {
  const inserted = []
  const load = loader({ '@supabase/supabase-js': { createClient: () => ({ from: table => ({ insert: async row => { inserted.push({ table, row }); return {} } }) }) } },
    { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://test.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture', VERCEL_ENV: 'production' } } })
  const { POST } = load('app/api/page-view/route.ts')
  const payload = { path: '/en/spot/the-bund-449', contentType: 'spot', contentSlug: 'the-bund-449', visitorId: 'visitor', visitId: 'visit', deviceType: 'mobile', trafficSource: 'google' }
  const request = (host, data, agent = 'Mozilla/5.0 CUBOT KINGKONG') => new Request(`https://${host}/api/page-view`, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': agent, 'x-forwarded-host': 'www.jnqjourney.com' }, body: JSON.stringify(data) })
  assert.equal((await (await POST(request('preview.vercel.app', payload))).json()).skipped, 'non-production')
  assert.equal((await (await POST(request('www.jnqjourney.com', { ...payload, path: '/en/admin' }))).json()).skipped, 'excluded-path')
  assert.equal((await (await POST(request('www.jnqjourney.com', payload, 'Googlebot/2.1'))).json()).skipped, 'bot')
  assert.equal((await POST(request('www.jnqjourney.com', payload))).status, 200)
  assert.equal(inserted.length, 1); assert.equal(inserted[0].row.visitor_id, 'visitor'); assert.equal(inserted[0].row.visit_id, 'visit')
  assert.equal(inserted[0].row.traffic_source, 'google')
})

// Execute the actual adapters with deterministic React lifecycle hooks. No GA
// network or database is used; delayed script readiness is part of the test.
function hooks() {
  const values = [], dependencies = [], cleanup = [], pending = []
  let cursor = 0
  return {
    react: {
      useState(initial) { const i = cursor++; if (!(i in values)) values[i] = initial; return [values[i], value => { values[i] = value }] },
      useRef(initial) { const i = cursor++; return values[i] ||= { current: initial } },
      useEffect(fn, deps) { const i = cursor++; if (!dependencies[i] || deps.some((dep, j) => dep !== dependencies[i][j])) { dependencies[i] = deps; pending.push(() => { cleanup[i]?.(); cleanup[i] = fn() }) } },
    },
    render(component, props) { cursor = 0; const result = component(props); pending.splice(0).forEach(fn => fn()); return result },
    unmount() { cleanup.forEach(fn => fn?.()) },
  }
}
test('GA waits for script readiness and emits one manual page_view per navigation', () => {
  const h = hooks(), calls = [], window = { location: { origin: 'https://www.jnqjourney.com' }, gtag: (...args) => calls.push(args) }
  const load = loader({ react: h.react, 'next/script': 'script', '@/lib/analytics': { isAnalyticsAllowed: path => !path.includes('/admin') } }, { window, document: { title: 'The Bund' } })
  const Component = load('components/AnalyticsScripts.tsx').default
  const props = { measurementId: 'G-CP6YQH8L2L', pagePath: '/en/spot/the-bund-449' }
  h.render(Component, props)
  const tree = h.render(Component, props)
  assert.equal(calls.length, 0)
  const inline = tree.props.children.find(child => child.props.id === 'google-analytics')
  new Function('window', inline.props.children)(window)
  assert.equal(calls.find(c => c[0] === 'config')[2].send_page_view, false)
  inline.props.onReady(); h.render(Component, props); h.render(Component, props)
  h.render(Component, { ...props, pagePath: '/en/guide/route' })
  h.render(Component, props)
  assert.deepEqual(calls.filter(c => c[1] === 'page_view').map(c => c[2].page_path), [props.pagePath, '/en/guide/route', props.pagePath])
  h.render(Component, { ...props, pagePath: '/en/admin' })
  assert.equal(window['ga-disable-G-CP6YQH8L2L'], true)
  h.render(Component, props); h.render(Component, props)
  assert.equal(window['ga-disable-G-CP6YQH8L2L'], false)
  assert.equal(calls.filter(c => c[1] === 'page_view').length, 4)
})
test('Pages Router waits for readiness, subscribes to completed routes and removes listeners', () => {
  const h = hooks(), listeners = new Map(), recorded = []
  const router = { isReady: false, asPath: '/en/spot/the-bund-449', events: { on: (name, fn) => listeners.set(name, fn), off: name => listeners.delete(name) } }
  const load = loader({ react: h.react, 'next/router': { useRouter: () => router }, './AnalyticsScripts': () => null, '@/lib/page-view': { recordPageView: path => recorded.push(path) } })
  const Component = load('components/PagesAnalytics.tsx').default
  h.render(Component, {}); assert.equal(recorded.length, 0)
  router.isReady = true; h.render(Component, {})
  assert.deepEqual(recorded, ['/en/spot/the-bund-449'])
  assert.equal(listeners.has('routeChangeStart'), false)
  listeners.get('routeChangeComplete')('/en/guide/route#day-2')
  assert.equal(recorded[1], '/en/guide/route')
  h.unmount(); assert.equal(listeners.size, 0)
})
