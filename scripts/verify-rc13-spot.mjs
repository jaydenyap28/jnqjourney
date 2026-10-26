// Targeted loopback-only checks. Fixture writes are local; provider mutations stay denied.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
const base = 'http://127.0.0.1:3214'
const dir = 'artifacts/rc1.3-finalization'
const fixture = `${dir}/browser-fixture.json`
const original = await readFile(fixture, 'utf8')
const state = JSON.parse(original), checks = [], responses = []
async function get(route) {
  const r = await fetch(base + route, { redirect: 'manual', signal: AbortSignal.timeout(45000) })
  const body = await r.text(), visible = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  responses.push({ route, status: r.status, location: r.headers.get('location'), robots: r.headers.get('x-robots-tag'), retryAfter: r.headers.get('retry-after'),
    canonical: [...body.matchAll(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/g)].map(m => m[1]), bytes: Buffer.byteLength(body),
    h1Count: [...visible.matchAll(/<h1\b/g)].length, ...(body.length < 200 ? { body } : {}) })
  return { status: r.status, body, visible, headers: r.headers }
}
async function check(name, run) {
  if (process.argv[2] === 'alias-only' && !name.startsWith('old Spot aliases')) return
  try { await run(); checks.push({ name, passed: true }) } catch (error) { checks.push({ name, passed: false, error: error.message }) }
}
async function persistFixture() { await writeFile(fixture, JSON.stringify(state)) }
try {
  await check('exact previously failing Spot path renders one H1 and canonical through real Middleware', async () => {
    const api = await get('/api/spot-routing/black-bean-coffee-297'); assert.equal(api.status, 200); assert.equal(JSON.parse(api.body).visible, true)
    const r = await get('/spot/black-bean-coffee-297'); assert.equal(r.status, 200)
    assert.equal([...r.visible.matchAll(/<h1\b/g)].length, 1)
    assert.ok(r.body.includes('https://www.jnqjourney.com/spot/black-bean-coffee-297'))
  })
  await check('old Spot aliases resolve to the canonical saved identity', async () => {
    const r = await get('/spot/old-local-name-297')
    assert.ok([301, 302, 307, 308].includes(r.status)); assert.ok(r.headers.get('location').endsWith('/spot/black-bean-coffee-297'))
  })
  await check('all four supplied inactive statuses are excluded by actual public readers', async () => {
    for (const id of [31, 676, 754, 762]) {
      const r = await get(`/spot/local-closed-${id}`); assert.equal(r.status, 404, `closed ID ${id}`)
      assert.match(r.headers.get('x-robots-tag'), /noindex/)
    }
  })
  await check('authoritative hidden state denies a previously warmed public Spot', async () => {
    state.spots[0].publication_status = 'hidden'; await persistFixture()
    assert.equal((await get('/spot/black-bean-coffee-297')).status, 404)
    state.spots[0].publication_status = 'published'; await persistFixture()
    assert.equal((await get('/spot/black-bean-coffee-297')).status, 200)
  })
  await check('provider outage remains 503/noindex/Retry-After and recovers without weakening the gate', async () => {
    state.failRouting = true; await persistFixture()
    const api = await get('/api/spot-routing/black-bean-coffee-297'); assert.equal(api.status, 503)
    const r = await get('/spot/black-bean-coffee-297'); assert.equal(r.status, 503)
    assert.match(r.headers.get('x-robots-tag'), /noindex/); assert.equal(r.headers.get('retry-after'), '30')
    state.failRouting = false; await persistFixture()
    assert.equal((await get('/spot/black-bean-coffee-297')).status, 200)
  })
  await check('package visibility is handled by the actual API, without the former local shortcut', async () => {
    assert.equal((await get('/api/package-visibility/hainan-test')).status, 204)
    assert.equal((await get('/api/package-visibility/local-missing-package')).status, 404)
  })
  await check('all fixture provider requests were GET only', async () => {
    const rows = (await readFile(`${fixture}.requests.jsonl`, 'utf8')).trim().split('\n').filter(Boolean).map(s => JSON.parse(s))
    assert.ok(rows.length > 0); assert.ok(rows.every(row => row.method === 'GET'))
  })
} finally {
  await writeFile(fixture, original)
  await writeFile(`${dir}/${process.argv[2] === 'alias-only' ? 'spot-http-alias-final' : 'spot-http'}.json`, JSON.stringify({ scope: 'Local Next development server, actual middleware and readers, synthetic Supabase responses. Not a live database/browser acceptance.', checks, responses }, null, 2))
}
console.log(JSON.stringify({ passed: checks.filter(c => c.passed).length, total: checks.length, failures: checks.filter(c => !c.passed) }, null, 2))
if (checks.some(c => !c.passed)) process.exitCode = 1
