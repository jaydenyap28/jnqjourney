import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ROOT } from './snapshot-renderer.mjs'
import { dataPath, releaseSession } from './snapshot-release.mjs'
import { openSnapshotTail } from './snapshot-native-tail.mjs'
import { EN, ORIGIN, SPOT_ID, SLUG, STATIC_EXCLUDES, ZH } from '../../cloudflare/spot-loop/snapshot-gateway.mjs'

const navigation = process.argv.includes('--navigation')
const resumeNavigation = process.argv.includes('--resume-navigation')
const recoverNavigation = process.argv.includes('--recover-navigation')
const continueGates = process.argv.includes('--continue-navigation-gates')
assert.ok((!resumeNavigation && !recoverNavigation && !continueGates) || navigation)
assert.ok([resumeNavigation, recoverNavigation, continueGates].filter(Boolean).length <= 1)
if (navigation) assert.equal(process.env.JNQ_SNAPSHOT_RUN, 'navigation-20261110')
const report = { startedAt: new Date().toISOString(), verdict: 'SNAPSHOT_HOSTING_POC_BLOCKED', dynamic: [], static: [], browser: [], blockedPrefetch: [], prefetchWarnings: [], externalBlocked: 0, cap: navigation ? 36 : 30, formalMigration: 'HOLD' }
const resume = process.argv.includes('--resume-readback')
const recover = process.argv.includes('--recover-tail')
assert.ok(!(resume && recover))
let recoveryFile
if (continueGates) recoveryFile = 'acceptance-navigation-drained.json'
else if (recoverNavigation) recoveryFile = 'acceptance-navigation-resumed.json'
else if (recover) recoveryFile = 'acceptance-resumed.json'
const recovery = recoveryFile ? JSON.parse(await readFile(path.join(ROOT, recoveryFile), 'utf8')) : null
if (recovery && !recoverNavigation && !continueGates) {
  assert.ok(recovery.failure?.reason === 'NATIVE_TAIL_MISSING' && recovery.fixtureRestoredHidden && recovery.dynamic.length === 1)
  const [original] = recovery.dynamic
  assert.ok(original.id === '1794299298797-0' && original.status === 200 && original.cpuMs === 'UNKNOWN')
  report.originalRequest = original
}
if (recoverNavigation) {
  assert.ok(recovery.failure?.reason === 'NATIVE_TAIL_MISSING' && recovery.fixtureRestoredHidden && recovery.tailDeleted && recovery.dynamic.length === 1)
  assert.ok(recovery.dynamic[0].status === 200 && recovery.dynamic[0].cpuMs === 'UNKNOWN' && !recovery.dynamic[0].bodyDrainedBeforeTail)
  report.priorRoundRequests = recovery.dynamic
}
if (continueGates) {
  assert.ok(recovery.failure?.reason.startsWith('route.fetch: Request context disposed.') && recovery.fixtureRestoredHidden && recovery.tailDeleted)
  assert.ok(recovery.dynamic.length === 10 && recovery.browser.length === 4 && recovery.browserErrors.length === 0)
  assert.equal(recovery.documentBefore.documentId, recovery.documentAfter.documentId)
  assert.equal(recovery.documentBefore.timeOrigin, recovery.documentAfter.timeOrigin)
  const events = JSON.parse(await readFile(path.join(ROOT, 'runtime-events-navigation-drained.json'), 'utf8'))
  assert.ok(events.events.length === 9 && events.events.every(e => e.cpuTime <= 10) && events.ignoredEvents === 2)
  report.priorRoundRequests = [...recovery.priorRoundRequests, ...recovery.dynamic.map(r => ({ ...r, cpuMs: r.cpuMs ?? 'UNKNOWN', status: r.status ?? 'UNKNOWN' })),
    { id: null, via: 'browser-followed-redirect', method: 'GET', path: EN, query: '', status: 200, cpuMs: 'UNKNOWN', reason: 'PLAYWRIGHT_REDIRECT_NOT_INTERCEPTED' }]
  assert.equal(report.priorRoundRequests.length, 12)
  report.browserCheckpoint = { source: 'acceptance-navigation-drained.json', passedSteps: recovery.browser, documentBefore: recovery.documentBefore, documentAfter: recovery.documentAfter,
    staticDispatched: recovery.static.length, staticObserved200: recovery.static.filter(r => r.status === 200).length, unobservedImageRequest: recovery.dynamic.at(-1).id }
}
const prior = navigation ? JSON.parse(await readFile('artifacts/cloudflare-snapshot-poc/acceptance-resumed.json', 'utf8')) : resume ? JSON.parse(await readFile(path.join(ROOT, 'acceptance.json'), 'utf8')) : null
if (prior && !navigation) {
  assert.ok(prior.failure?.reason === 'PRIVATE_SNAPSHOT_READBACK_FAILED' && !prior.deployment && prior.dynamic.length === 0 && prior.fixtureRestoredHidden)
  report.priorFailure = prior.failure
}
if (navigation) {
  const local = JSON.parse(await readFile(path.join(ROOT, 'local-navigation.json'), 'utf8'))
  assert.ok(local.pass && local.attempts[1].sameDocument, 'LOCAL_NAVIGATION_NOT_PROVEN')
  const history = JSON.parse(await readFile('artifacts/cloudflare-snapshot-poc/acceptance-tail-recovery.json', 'utf8'))
  assert.equal(history.dynamic.length + 1, 16)
  report.history = { requests: 16, unknown: ['1794299298797-0', '1794300089955-14'] }
  if (resumeNavigation) {
    const interrupted = JSON.parse(await readFile(path.join(ROOT, 'acceptance-navigation.json'), 'utf8'))
    const cleanup = JSON.parse(await readFile(path.join(ROOT, 'interrupted-cleanup.json'), 'utf8'))
    assert.ok(interrupted.failure?.reason === 'EXECUTION_INTERRUPTED' && interrupted.fixtureRestoredHidden && !interrupted.deployment && interrupted.dynamic.length === 0)
    assert.ok(cleanup.restoredHidden && cleanup.noNewDeployment)
    report.interruptedAttempt = { requests: 0, noDeployment: true, fixtureRestoredHidden: true }
  }
}
let journalName = 'acceptance.json'
if (navigation) {
  journalName = 'acceptance-navigation.json'
  if (continueGates) journalName = 'acceptance-navigation-gates.json'
  else if (recoverNavigation) journalName = 'acceptance-navigation-drained.json'
  else if (resumeNavigation) journalName = 'acceptance-navigation-resumed.json'
} else if (recover) journalName = 'acceptance-tail-recovery.json'
else if (resume) journalName = 'acceptance-resumed.json'
const journal = path.join(ROOT, journalName)
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
  assert.ok(report.dynamic.length + Number(recover) + (report.priorRoundRequests?.length || 0) < report.cap, 'DYNAMIC_REQUEST_BUDGET_REACHED')
  const record = { id: `${Date.now()}-${report.dynamic.length}`, via, phase, path: url.pathname, query: url.search, method }
  const event = tail.track(record.id)
  report.dynamic.push(record)
  await persist()
  try {
    let response = await send(record.id)
    record.status = typeof response.status === 'function' ? response.status() : response.status
    await persist()
    // A fetch resolves at headers. Drain the bounded snapshot stream before
    // waiting for the platform's request-completion event.
    if (typeof response.status === 'function') await response.body()
    else {
      const bytes = await response.arrayBuffer()
      assert.ok(bytes.byteLength <= 2 * 1024 * 1024, 'PROBE_RESPONSE_TOO_LARGE')
      response = new Response(bytes, { status: response.status, statusText: response.statusText, headers: response.headers })
    }
    record.bodyDrainedBeforeTail = true
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
  report.browserNetwork = []
  context.on('request', req => {
    const url = new URL(req.url())
    if (url.origin === ORIGIN) report.browserNetwork.push({ path: url.pathname, query: url.search, type: req.resourceType(), redirected: Boolean(req.redirectedFrom()) })
  })
  if (navigation) await context.addInitScript(() => { window.__JNQ_DOCUMENT_ID = crypto.randomUUID() })
  const page = await context.newPage()
  page.on('pageerror', error => pageErrors.push(String(error.message).slice(0, 220)))
  page.on('console', entry => {
    if (entry.type() !== 'error') return
    const text = entry.text()
    if (text.startsWith('Failed to fetch RSC payload for ') && report.blockedPrefetch.some(row => text.startsWith('Failed to fetch RSC payload for ' + ORIGIN + row.path + '. '))) report.prefetchWarnings.push(text.split('\n')[0])
    else if (/hydrat|Minified React error|ChunkLoadError|RSC payload/i.test(text)) pageErrors.push(text.slice(0,220))
  })
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
        if (navigation && response.status() !== 200) stop = Error('STATIC_RESOURCE_FAILED')
        await route.fulfill({ response })
      } catch {
        if (navigation) stop = Error('STATIC_RESOURCE_REQUEST_FAILED')
        await route.abort().catch(() => {})
      }
      return
    }
    if (navigation && route.request().headers()['next-router-prefetch'] === '1' && !['/', ZH, EN].includes(url.pathname)) {
      report.blockedPrefetch.push({ path: url.pathname, query: url.search, reason: 'OUTSIDE_ISOLATED_FIXTURE_SCOPE', sentToCloudflare: false })
      return route.abort()
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
        record.resourceType = route.request().resourceType()
        record.rsc = route.request().headers().rsc === '1'
        record.prefetch = route.request().headers()['next-router-prefetch'] === '1'
        if (navigation && response.status() === 200) {
          const bytes = await response.body()
          record.bytes = bytes.length
          record.sha256 = hash(bytes)
          const name = record.path === '/' ? (record.rsc ? 'home-rsc' : 'home-html') : record.path === ZH ? (record.rsc ? 'zh-rsc' : 'zh-html') : record.path === EN ? 'en-html' : null
          assert.equal(record.sha256, name ? manifest.objects[name].sha256 : report.media.sha256, 'BROWSER_SNAPSHOT_BYTES_CHANGED')
          if (name) assert.equal(record.revision, manifest.revision, 'BROWSER_REVISION_CHANGED')
          assert.match(response.headers()['cache-control'], /no-store/)
          if (record.rsc) assert.equal(record.representation, 'text/x-component', 'NEXT_14_RSC_MIME_MISMATCH')
        }
        await route.fulfill({ response })
      } catch (error) { stop = error; await route.abort().catch(() => {}) }
    })
    await chain
  })
  try {
    const home = await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 35000 })
    assert.equal(home.status(), 200)
    assert.equal(home.headers()['x-jnq-snapshot-revision'], manifest.revision)
    if (navigation) await page.waitForFunction(() => window.__JNQ_SNAPSHOT_HYDRATED?.pathname === '/' && window.__JNQ_SNAPSHOT_HYDRATED?.routerReady)
    await page.getByRole('heading', { name: /快照驗收甲|快照验收甲|Consumer Fixture/ }).first().waitFor({ timeout: 10000 })
    await page.screenshot({ path: path.join(ROOT, 'home-desktop.png') })
    report.browser.push({ phase: 'home', status: 200, fixtureVisible: true })
    const link = page.locator(`a[href="${ZH}"]`).first()
    const homeDocument = await page.evaluate(() => performance.timeOrigin)
    if (navigation) report.documentBefore = await page.evaluate(() => ({ documentId: window.__JNQ_DOCUMENT_ID, timeOrigin: performance.timeOrigin, hydrated: window.__JNQ_SNAPSHOT_HYDRATED }))
    await link.click({ timeout: 10000 })
    await page.waitForURL(ORIGIN + ZH, { timeout: 15000 })
    await page.getByRole('heading', { name: /快照驗收甲|快照验收甲|Consumer Fixture/ }).first().waitFor({ timeout: 10000 })
    if (navigation) {
      await page.waitForFunction(pathname => window.__JNQ_SNAPSHOT_HYDRATED?.pathname === pathname, ZH)
      report.documentAfter = await page.evaluate(() => ({ documentId: window.__JNQ_DOCUMENT_ID, timeOrigin: performance.timeOrigin, hydrated: window.__JNQ_SNAPSHOT_HYDRATED }))
      assert.equal(report.documentAfter.documentId, report.documentBefore.documentId, 'DOCUMENT_ID_CHANGED')
      assert.deepEqual(pageErrors, [], 'REACT_HYDRATION_OR_RUNTIME_ERROR')
    }
    assert.equal(await page.evaluate(() => performance.timeOrigin), homeDocument, 'APP_ROUTER_NAVIGATION_RELOADED_DOCUMENT')
    assert.ok(report.dynamic.some(record => record.path === ZH && record.representation?.startsWith('text/x-component') && record.status === 200), 'APP_ROUTER_NAVIGATION_DID_NOT_LOAD_RSC')
    report.browser.push({ phase: 'internal navigation', status: 200, rscObserved: true })
    await page.setViewportSize({ width: 390, height: 844 })
    // Exercise redirects separately with manual-follow probes. Playwright's
    // route callback covers only the first request of a redirect chain.
    const en = await page.goto(navigation ? ORIGIN + EN : `${ORIGIN}/en/spot/spot-${SPOT_ID}`, { waitUntil: 'domcontentloaded', timeout: 35000 })
    assert.equal(en.status(), 200)
    assert.equal(new URL(page.url()).pathname, EN)
    if (navigation) await page.waitForFunction(() => Boolean(window.__JNQ_SNAPSHOT_PAGES_HYDRATED))
    await page.getByRole('heading', { name: /Consumer Fixture/ }).first().waitFor({ timeout: 10000 })
    await page.screenshot({ path: path.join(ROOT, 'english-mobile.png') })
    report.browser.push({ phase: 'English alias and mobile', status: 200 })
    const refresh = await page.reload({ waitUntil: 'domcontentloaded', timeout: 35000 })
    assert.equal(refresh.status(), 200)
    await page.getByRole('heading', { name: /Consumer Fixture/ }).first().waitFor({ timeout: 10000 })
    if (navigation) await page.waitForFunction(() => Boolean(window.__JNQ_SNAPSHOT_PAGES_HYDRATED))
    else await sleep(800)
    if (navigation) await page.waitForFunction(() => Array.from(document.images).filter(image => image.src.includes('/media/candidate/92061/')).every(image => image.complete && image.naturalWidth > 0))
    await chain
    if (stop) throw stop
    assert.deepEqual(pageErrors, [], 'REACT_HYDRATION_OR_RUNTIME_ERROR')
    report.browser.push({ phase: 'refresh and hydration', status: 200, pageErrors: 0 })
  } finally {
    report.browserErrors = pageErrors
    await chain
    await context.close()
    if (stop) throw stop
  }
}

try {
  session = await releaseSession(report, prior, recovery)
  await persist()
  let first, media
  if (recovery) {
    phase = 'verify prior Preview and private objects'
    deployment = await session.verifyRecovery()
    first = recovery.releases[0]
  } else {
    phase = 'render-and-deploy'
    media = await session.prepare()
    await session.patch({ status: 'active', publication_status: 'published', name_cn: '快照验收甲', description: 'Synthetic snapshot revision A.', visit_date: '2026-11-08', image_url: media, images: [media] })
    await persist()
    first = await session.capture(navigation ? 'revision-a-navigation' : resume ? 'revision-a-resumed' : 'revision-a')
    await persist()
    deployment = await session.deploy()
  }
  report.deployment = deployment
  await persist()
  phase = 'native Tail handshake'
  tail = await openSnapshotTail(deployment, path.join(ROOT, continueGates ? 'runtime-events-navigation-gates.json' : recoverNavigation ? 'runtime-events-navigation-drained.json' : recover ? 'runtime-events-recovery.json' : 'runtime-events-native.json'))
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
  if (!continueGates) await chrome(first)
  phase = 'representation checks'
  if (navigation) {
    for (const [name, route, options] of [
      continueGates ? ['zh-html', ZH, {}] : ['home-rsc', '/?_rsc=probe', { RSC: '1' }],
      ['en-json', dataPath, {}],
      ['locations-json', '/api/locations', {}],
      ['spot-json', `/api/spots/${SLUG}`, {}],
    ]) {
      const checked = await check(route, 200, options)
      assert.equal(hash(checked.bytes), first.objects[name].sha256)
      assert.equal(checked.response.headers.get('x-jnq-snapshot-revision'), first.revision)
    }
  } else {
    assert.equal(hash((await check(dataPath, 200)).bytes), first.objects['en-json'].sha256)
    assert.equal(hash((await check(media, 200)).bytes), report.media.sha256)
  }
  assert.equal((await check(`/spot/spot-${SPOT_ID}`, 301)).response.headers.get('location'), ZH)
  if (continueGates) assert.equal((await check(`/en/spot/spot-${SPOT_ID}`, 301)).response.headers.get('location'), EN)
  if (!navigation) await check(`/api/spots/${SLUG}`, 200)
  await check(`/spot/unknown-${SPOT_ID}`, 404)
  await check(ZH + '.html', 404)
  if (!navigation) await check(ZH + '.rsc', 404)
  if (!continueGates) await check('/_next/data/old-build' + EN + '.json', 404)
  await check(ZH + '?select=review_jayden', 404)
  await check(ZH, 503, { 'X-JnQ-Snapshot-Fault': '1' })

  phase = 'hidden'
  await session.patch({ publication_status: 'hidden' })
  await check('/', 503)
  await check(ZH, 404)
  await check(ZH + '?_rsc=hidden', 404, { RSC: '1' })
  await check(dataPath, 404)
  await check(media, 404)
  if (navigation) {
    await check(EN, 404)
    await check('/api/locations', 503)
    await check(`/api/spots/${SLUG}`, 404)
    await check(`/spot/spot-${SPOT_ID}`, 404)
  }

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
  if (navigation && !continueGates) await check(media, 404)
  await session.patch({ status: 'active' })
  await session.revoke(media)
  await check(media, 404)
  if (!continueGates) await check(ZH, 404)
  if (continueGates) {
    report.remainingGateChecksPassed = true
    report.failure = { phase: 'round observation completeness', reason: 'CURRENT_ROUND_BROWSER_REQUESTS_HAVE_UNKNOWN_CPU' }
  } else report.verdict = 'SNAPSHOT_HOSTING_POC_PASS'
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
    browserDynamic: report.dynamic.filter(row => row.via === 'browser').length, browserStatic: report.static.length,
    priorRound: report.priorRoundRequests?.length || 0, roundTotal: report.dynamic.length + (report.priorRoundRequests?.length || 0) }
  await persist()
  console.log(JSON.stringify({ verdict: report.verdict, phase, failure: report.failure, deployment, requests: report.dynamic.length, static: report.static.length, fixtureRestoredHidden: report.fixtureRestoredHidden }))
}
