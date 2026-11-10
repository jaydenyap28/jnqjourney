import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ROOT } from './snapshot-renderer.mjs'
import { dataPath, releaseSession } from './snapshot-release.mjs'
import { openSnapshotTail } from './snapshot-native-tail.mjs'
import { EN, ORIGIN, SPOT_ID, SLUG, STATIC_EXCLUDES, ZH } from '../../cloudflare/spot-loop/snapshot-gateway.mjs'

const report = { startedAt: new Date().toISOString(), verdict: 'SNAPSHOT_HOSTING_POC_BLOCKED', dynamic: [], static: [], browser: [], externalBlocked: 0, cap: 30, formalMigration: 'HOLD' }
const resume = process.argv.includes('--resume-readback')
const recover = process.argv.includes('--recover-tail')
assert.ok(!(resume && recover))
const recovery = recover ? JSON.parse(await readFile(path.join(ROOT, 'acceptance-resumed.json'), 'utf8')) : null
if (recovery) {
  assert.ok(recovery.failure?.reason === 'NATIVE_TAIL_MISSING' && recovery.fixtureRestoredHidden && recovery.dynamic.length === 1)
  const [original] = recovery.dynamic
  assert.ok(original.id === '1794299298797-0' && original.status === 200 && original.cpuMs === 'UNKNOWN')
  report.originalRequest = original
}
const prior = resume ? JSON.parse(await readFile(path.join(ROOT, 'acceptance.json'), 'utf8')) : null
if (prior) {
  assert.ok(prior.failure?.reason === 'PRIVATE_SNAPSHOT_READBACK_FAILED' && !prior.deployment && prior.dynamic.length === 0 && prior.fixtureRestoredHidden)
  report.priorFailure = prior.failure
}
const journal = path.join(ROOT, recover ? 'acceptance-tail-recovery.json' : resume ? 'acceptance-resumed.json' : 'acceptance.json')
await writeFile(journal, JSON.stringify(report), { flag: 'wx' })
const persist = () => writeFile(journal, JSON.stringify(report, null, 2) + '\n')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
let session, tail, browser, stop, deployment
let phase = 'boundary'

async function observe(record, status, event) {
  record.status = status
  record.cpuMs = event?.cpuTime ?? 'UNKNOWN'
  record.outcome = event?.outcome ?? 'UNKNOWN'
  await persist()
  assert.ok(event && Number.isFinite(event.cpuTime), 'NATIVE_TAIL_MISSING')
  assert.ok(event.cpuTime <= 10, 'NATIVE_CPU_OVER_10_MS')
  assert.ok(!event.truncated, 'NATIVE_TAIL_TRUNCATED')
  const redacted = record.path.replace(/^(\/media\/candidate\/92061\/)[a-f0-9-]+(\.png)$/,'$1REDACTED$2')
  assert.ok(event.outcome === 'ok' && event.status === status && event.method === record.method && [record.path, redacted].includes(event.path), 'NATIVE_TAIL_CORRELATION_FAILED')
}

async function dispatch(via, url, method, send) {
  if (stop) throw stop
  assert.ok(report.dynamic.length + Number(recover) < report.cap, 'DYNAMIC_REQUEST_BUDGET_REACHED')
  const record = { id: `${Date.now()}-${report.dynamic.length}`, via, phase, path: url.pathname, query: url.search, method }
  const event = tail.track(record.id)
  report.dynamic.push(record)
  await persist()
  try {
    const response = await send(record.id)
    record.status = typeof response.status === 'function' ? response.status() : response.status
    await persist()
    await observe(record, record.status, await event.result())
    return response
  } catch (error) { stop = error; throw error }
  finally { event.cancel() }
}

async function check(route, expected, options = {}) {
  const url = new URL(route, ORIGIN)
  const response = await dispatch('probe', url, 'GET', id => fetch(url, {
    headers: { 'X-JnQ-Acceptance': id, ...options }, redirect: 'manual', signal: AbortSignal.timeout(20000),
  }))
  const bytes = Buffer.from(await response.arrayBuffer())
  assert.equal(response.status, expected, `HTTP_${route}_EXPECTED_${expected}`)
  assert.equal(response.headers.get('X-JnQ-Snapshot-Gate'), '1', 'DYNAMIC_GATE_BYPASS')
  assert.match(response.headers.get('cache-control') || '', /no-store/)
  const record = report.dynamic.at(-1)
  record.bytes = bytes.length
  if (expected === 200) record.sha256 = hash(bytes)
  else assert.ok(!bytes.toString('utf8').includes('Consumer Fixture 92061'), 'HIDDEN_CONTENT_LEAK')
  await persist()
  return { response, bytes }
}

function isStatic(url) {
  return STATIC_EXCLUDES.some(rule => rule.endsWith('/*') ? url.pathname.startsWith(rule.slice(0,-1)) : url.pathname === rule)
}

async function chrome(manifest) {
  const { chromium } = await import('../../artifacts/cloudflare-upload-fix/browser-tools/node_modules/playwright-core/index.mjs')
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
  report.chrome = browser.version()
  const pageErrors = []
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  page.on('pageerror', error => pageErrors.push(String(error.message).slice(0, 220)))
  page.on('console', entry => { if (entry.type() === 'error' && /hydrat|Minified React error|ChunkLoadError/i.test(entry.text())) pageErrors.push(entry.text().slice(0,220)) })
  let chain = Promise.resolve()
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin !== ORIGIN) { report.externalBlocked++; return route.abort() }
    if (isStatic(url)) {
      const record = { path: url.pathname, query: url.search, method: route.request().method(), via: 'browser' }
      report.static.push(record)
      try {
        const response = await route.fetch({ maxRedirects: 0, timeout: 20000 })
        record.status = response.status()
        record.functionHeader = response.headers()['x-jnq-snapshot-gate'] || null
        if (record.functionHeader) stop = Error('STATIC_REQUEST_ENTERED_FUNCTION')
        await route.fulfill({ response })
      } catch { await route.abort().catch(() => {}) }
      return
    }
    chain = chain.then(async () => {
      if (stop) return route.abort().catch(() => {})
      try {
        const response = await dispatch('browser', url, route.request().method(), id => route.fetch({
          headers: { ...route.request().headers(), 'X-JnQ-Acceptance': id }, maxRedirects: 0, timeout: 20000,
        }))
        assert.equal(response.headers()['x-jnq-snapshot-gate'], '1', 'BROWSER_GATE_BYPASS')
        const record = report.dynamic.at(-1)
        record.representation = response.headers()['content-type'] || null
        record.revision = response.headers()['x-jnq-snapshot-revision'] || null
        await route.fulfill({ response })
      } catch (error) { stop = error; await route.abort().catch(() => {}) }
    })
    await chain
  })
  try {
    const home = await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 35000 })
    assert.equal(home.status(), 200)
    assert.equal(home.headers()['x-jnq-snapshot-revision'], manifest.revision)
    await page.getByRole('heading', { name: /快照驗收甲|快照验收甲|Consumer Fixture/ }).first().waitFor({ timeout: 10000 })
    await page.screenshot({ path: path.join(ROOT, 'home-desktop.png') })
    report.browser.push({ phase: 'home', status: 200, fixtureVisible: true })
    const link = page.locator(`a[href="${ZH}"]`).first()
    const homeDocument = await page.evaluate(() => performance.timeOrigin)
    await link.click({ timeout: 10000 })
    await page.waitForURL(ORIGIN + ZH, { timeout: 15000 })
    await page.getByRole('heading', { name: /快照驗收甲|快照验收甲|Consumer Fixture/ }).first().waitFor({ timeout: 10000 })
    assert.equal(await page.evaluate(() => performance.timeOrigin), homeDocument, 'APP_ROUTER_NAVIGATION_RELOADED_DOCUMENT')
    assert.ok(report.dynamic.some(record => record.path === ZH && record.representation?.startsWith('text/x-component') && record.status === 200), 'APP_ROUTER_NAVIGATION_DID_NOT_LOAD_RSC')
    report.browser.push({ phase: 'internal navigation', status: 200, rscObserved: true })
    await page.setViewportSize({ width: 390, height: 844 })
    const en = await page.goto(`${ORIGIN}/en/spot/spot-${SPOT_ID}`, { waitUntil: 'domcontentloaded', timeout: 35000 })
    assert.equal(en.status(), 200)
    assert.equal(new URL(page.url()).pathname, EN)
    await page.getByRole('heading', { name: /Consumer Fixture/ }).first().waitFor({ timeout: 10000 })
    await page.screenshot({ path: path.join(ROOT, 'english-mobile.png') })
    report.browser.push({ phase: 'English alias and mobile', status: 200 })
    const refresh = await page.reload({ waitUntil: 'domcontentloaded', timeout: 35000 })
    assert.equal(refresh.status(), 200)
    await page.getByRole('heading', { name: /Consumer Fixture/ }).first().waitFor({ timeout: 10000 })
    await sleep(800)
    if (stop) throw stop
    assert.deepEqual(pageErrors, [], 'REACT_HYDRATION_OR_RUNTIME_ERROR')
    report.browser.push({ phase: 'refresh and hydration', status: 200, pageErrors: 0 })
  } finally {
    report.browserErrors = pageErrors
    await context.close()
    await chain
    if (stop) throw stop
  }
}

try {
  session = await releaseSession(report, prior, recovery)
  let first, media
  if (recovery) {
    phase = 'verify prior Preview and private objects'
    deployment = await session.verifyRecovery()
    first = recovery.releases[0]
  } else {
    phase = 'render-and-deploy'
    media = await session.prepare()
    await session.patch({ status: 'active', publication_status: 'published', name_cn: '快照验收甲', description: 'Synthetic snapshot revision A.', visit_date: '2026-11-08', image_url: media, images: [media] })
    first = await session.capture(resume ? 'revision-a-resumed' : 'revision-a')
    deployment = await session.deploy()
  }
  report.deployment = deployment
  await persist()
  phase = 'native Tail handshake'
  tail = await openSnapshotTail(deployment, path.join(ROOT, recover ? 'runtime-events-recovery.json' : 'runtime-events-native.json'))
  report.tailOpenedAt = tail.openedAt
  phase = 'read-only native canary'
  const page = await check(recovery ? ZH : '/', recovery ? 404 : 200)
  if (!recovery) assert.equal(hash(page.bytes), first.objects['home-html'].sha256)
  report.canary = report.dynamic.at(-1).id
  if (recovery) {
    phase = 'replay isolated revision A'
    media = await session.prepare()
    await session.replayPublished()
  }
  phase = 'browser'
  await chrome(first)
  phase = 'representation checks'
  assert.equal(hash((await check(dataPath, 200)).bytes), first.objects['en-json'].sha256)
  assert.equal(hash((await check(media, 200)).bytes), report.media.sha256)
  assert.equal((await check(`/spot/spot-${SPOT_ID}`, 301)).response.headers.get('location'), ZH)
  await check(`/api/spots/${SLUG}`, 200)
  await check(`/spot/unknown-${SPOT_ID}`, 404)
  await check(ZH + '.html', 404)
  await check(ZH + '.rsc', 404)
  await check('/_next/data/old-build' + EN + '.json', 404)
  await check(ZH + '?select=review_jayden', 404)
  await check(ZH, 503, { 'X-JnQ-Snapshot-Fault': '1' })

  phase = 'hidden'
  await session.patch({ publication_status: 'hidden' })
  await check('/', 503)
  await check(ZH, 404)
  await check(ZH + '?_rsc=hidden', 404, { RSC: '1' })
  await check(dataPath, 404)
  await check(media, 404)

  phase = 'new revision'
  await session.patch({ publication_status: null, name_cn: '快照验收乙', description: 'Synthetic snapshot revision B.' })
  await check('/', 503)
  const second = await session.capture('revision-b')
  assert.notEqual(first.revision, second.revision)
  const updated = await check('/', 200)
  assert.equal(updated.response.headers.get('x-jnq-snapshot-revision'), second.revision)
  assert.equal(hash(updated.bytes), second.objects['home-html'].sha256)
  phase = 'closed and revoked'
  await session.patch({ status: 'temporarily_closed' })
  await check(ZH, 404)
  await session.patch({ status: 'active' })
  await session.revoke(media)
  await check(media, 404)
  await check(ZH, 404)
  report.verdict = 'SNAPSHOT_HOSTING_POC_PASS'
} catch (error) {
  const failure = stop || error
  report.failure = { phase, reason: String(failure.message || failure).slice(0, 300) }
  process.exitCode = 1
} finally {
  if (browser) await browser.close()
  if (tail) {
    try { await tail.close(); report.tailDeleted = true }
    catch { report.tailDeleted = false; report.verdict = 'SNAPSHOT_HOSTING_POC_BLOCKED'; process.exitCode = 1 }
  }
  if (session) {
    try { await session.cleanup() } catch { report.cleanup = 'FIXTURE_OR_BOUNDARY_NOT_CONFIRMED'; report.verdict = 'SNAPSHOT_HOSTING_POC_BLOCKED'; process.exitCode = 1 }
  }
  report.finishedAt = new Date().toISOString()
  report.requestCounts = { original: Number(recover), probes: report.dynamic.filter(row => row.via === 'probe').length,
    browserDynamic: report.dynamic.filter(row => row.via === 'browser').length, browserStatic: report.static.length }
  await persist()
  console.log(JSON.stringify({ verdict: report.verdict, phase, failure: report.failure, deployment, requests: report.dynamic.length, static: report.static.length, fixtureRestoredHidden: report.fixtureRestoredHidden }))
}
