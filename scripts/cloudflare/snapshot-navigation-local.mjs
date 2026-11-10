// Local real-browser diagnosis only. No credentials or remote data access.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ROOT, SITE, LOCAL, runNext } from './snapshot-renderer.mjs'
import { ZH } from '../../cloudflare/spot-loop/snapshot-gateway.mjs'
import { syntheticPng } from './edge-bridge-media.mjs'

const { chromium } = await import('../../artifacts/cloudflare-upload-fix/browser-tools/node_modules/playwright-core/index.mjs')
const origin = 'http://127.0.0.1:4419'
const report = { kind: 'LOCAL_BROWSER_ONLY', attempts: [] }
const renderer = runNext(['start', '--hostname', '127.0.0.1', '--port', '4417'], ['ignore', 'ignore', 'pipe'])
renderer.stderr.on('data', data => { report.rendererDiagnostic = String(data).slice(0, 1600) })
let server, browser
try {
  await writeFile(path.join(SITE, 'snapshot-row.json'), await readFile('artifacts/cloudflare-snapshot-poc/renderer/snapshot-row.json'))
  let ready = false
  for (let i = 0; i < 60; i++) {
    assert.equal(renderer.exitCode, null, 'LOCAL_RENDERER_EXITED')
    try { await (await fetch(LOCAL + '/icon.png', { signal: AbortSignal.timeout(1000) })).body?.cancel(); ready = true; break } catch {}
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  assert.ok(ready, 'LOCAL_RENDERER_NOT_READY')
  const snapshots = new Map()
  for (const pathname of ['/', ZH]) for (const rsc of [false, true]) {
    const response = await fetch(LOCAL + pathname, { headers: rsc ? { RSC: '1' } : {} })
    assert.equal(response.status, 200)
    snapshots.set(pathname + ':' + rsc, { bytes: Buffer.from(await response.arrayBuffer()), type: response.headers.get('content-type') })
  }
  let incorrectMime = true
  server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, origin)
      if (url.pathname.startsWith('/media/candidate/92061/')) { res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(syntheticPng) }
      const value = snapshots.get(url.pathname + ':' + (req.headers.rsc === '1'))
      if (value) {
        res.writeHead(200, { 'Content-Type': req.headers.rsc === '1' ? 'text/x-component' + (incorrectMime ? '; charset=utf-8' : '') : value.type,
          'Cache-Control': 'no-store', Vary: 'RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Url' })
        return res.end(value.bytes)
      }
      if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/fonts/')) {
        const base = path.resolve(SITE, url.pathname.startsWith('/_next/') ? '.next/static' : 'public/fonts')
        const relative = url.pathname.replace(/^\/(?:_next\/static|fonts)\//, '')
        const file = path.resolve(base, decodeURIComponent(relative))
        assert.ok(file.startsWith(base + path.sep))
        const type = file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'font/woff2'
        res.writeHead(200, { 'Content-Type': type }); return res.end(await readFile(file))
      }
      res.writeHead(404); res.end('Not Found')
    } catch { res.writeHead(500); res.end('Local fixture unavailable') }
  })
  await new Promise(resolve => server.listen(4419, '127.0.0.1', resolve))
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
  for (const mode of ['previous-content-type', 'corrected-content-type']) {
    incorrectMime = mode === 'previous-content-type'
    const result = { mode, errors: [], network: [], blockedPrefetch: [], prefetchWarnings: [] }
    report.attempts.push(result)
    const context = await browser.newContext({ serviceWorkers: 'block' })
    await context.addInitScript(() => { window.__JNQ_DOCUMENT_ID = crypto.randomUUID() })
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin !== origin) return route.abort()
      if (route.request().headers()['next-router-prefetch'] === '1' && !['/', ZH].includes(url.pathname)) {
        result.blockedPrefetch.push(url.pathname); return route.abort()
      }
      return route.continue()
    })
    const page = await context.newPage()
    page.on('pageerror', e => result.errors.push(e.message))
    page.on('console', e => {
      if (e.type() !== 'error') return
      const text = e.text()
      if (text.startsWith('Failed to fetch RSC payload for ') && result.blockedPrefetch.some(p => text.startsWith('Failed to fetch RSC payload for ' + origin + p + '. '))) result.prefetchWarnings.push(text.split('\n')[0])
      else if (/hydrat|React error|ChunkLoadError|RSC payload/i.test(text)) result.errors.push(text)
    })
    page.on('request', req => { const url = new URL(req.url()); if (url.origin === origin && ['/', ZH].includes(url.pathname)) result.network.push({ path: url.pathname, query: url.search, type: req.resourceType(), rsc: req.headers().rsc || null }) })
    await page.goto(origin, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => window.__JNQ_SNAPSHOT_HYDRATED?.pathname === '/' && window.__JNQ_SNAPSHOT_HYDRATED?.routerReady)
    result.before = await page.evaluate(() => ({ documentId: window.__JNQ_DOCUMENT_ID, timeOrigin: performance.timeOrigin, hydrated: window.__JNQ_SNAPSHOT_HYDRATED }))
    await page.locator('a[href="' + ZH + '"]').first().click()
    await page.waitForURL(origin + ZH)
    await page.waitForFunction(pathname => window.__JNQ_SNAPSHOT_HYDRATED?.pathname === pathname, ZH)
    result.after = await page.evaluate(() => ({ documentId: window.__JNQ_DOCUMENT_ID, timeOrigin: performance.timeOrigin, hydrated: window.__JNQ_SNAPSHOT_HYDRATED }))
    result.sameDocument = result.before.documentId === result.after.documentId && result.before.timeOrigin === result.after.timeOrigin
    assert.equal(result.sameDocument, !incorrectMime, 'UNEXPECTED_NAVIGATION_RESULT')
    assert.deepEqual(result.errors, [], 'LOCAL_HYDRATION_ERROR')
    await context.close()
  }
  report.pass = true
} catch (error) { report.failure = error.message; process.exitCode = 1 }
finally {
  await browser?.close()
  await new Promise(resolve => server ? server.close(resolve) : resolve())
  renderer.kill()
  await writeFile(path.join(ROOT, 'local-navigation.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
}
