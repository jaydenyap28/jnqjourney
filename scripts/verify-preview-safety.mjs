import { spawn } from 'node:child_process'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'

if (!process.env.NODE_OPTIONS?.includes('offline-network-guard') || process.env.VERCEL_ENV !== 'preview') throw Error('Run offline validator with JNQ_OFFLINE_PREVIEW=1')
const out = process.env.JNQ_OFFLINE_OUTPUT
const fixture = path.resolve(out, 'preview-runtime-fixture.json')
await writeFile(fixture, JSON.stringify({ spots: [], prices: [], widgets: [], affiliates: [] }))
await writeFile(`${fixture}.requests.jsonl`, '')
const checks = [], responses = []
let server, base, log = ''
async function start(extra = {}) {
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '0'], {
    env: { ...process.env, JNQ_OFFLINE_RUNTIME_FIXTURE: fixture, SUPABASE_SERVICE_ROLE_KEY: 'inherited-fixture', ADMIN_EMAILS: 'offline-admin@example.test', ...extra }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Preview local start timeout')), 45000)
    let startup = ''
    const collect = bytes => {
      log += bytes; startup += bytes
      const match = startup.match(/http:\/\/127\.0\.0\.1:(\d+)/)
      if (match) base = `http://127.0.0.1:${match[1]}`
      if (startup.includes('Ready in')) { clearTimeout(timer); resolve() }
    }
    server.stdout.on('data', collect); server.stderr.on('data', collect)
    server.once('error', error => { clearTimeout(timer); reject(error) })
    server.once('exit', code => { clearTimeout(timer); reject(Error(`Preview server exited ${code}`)) })
  })
}
async function stop() { if (server && server.exitCode === null) await new Promise(resolve => { server.once('exit', resolve); server.kill() }) }
async function check(name, fn) { try { await fn(); checks.push({ name, passed: true }) } catch (error) { checks.push({ name, passed: false, error: error.message }); console.error(name, error.message) } }
async function send(url, method = 'GET', body = {}) {
  const r = await fetch(`${base}${url}`, { method, redirect: 'manual', headers: { authorization: 'Bearer fixture', 'Content-Type': 'application/json' }, ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) })
  const text = await r.text()
  responses.push({ url, method, status: r.status, cacheControl: r.headers.get('cache-control'), nextCache: r.headers.get('x-nextjs-cache'), robots: r.headers.get('x-robots-tag'), bytes: Buffer.byteLength(text) })
  return { r, text }
}
async function files(dir) { return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(e => e.isDirectory() ? files(`${dir}/${e.name}`) : [`${dir}/${e.name}`]))).flat() }
try {
  await start()
  for (const file of [...await files('app/api/admin'), 'app/api/upload/r2/route.ts'].filter(p => p.endsWith('/route.ts'))) {
    const methods = [...(await readFile(file, 'utf8')).matchAll(/export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\(/g)].map(m => m[1])
    const url = `/${file.replace(/^app\//, '').replace(/\/route.ts$/, '').replace(/\[id\]/g, '1').replace(/\[slug\]/g, 'fixture')}`
    for (const method of methods) await check(`${method} ${url} read-only`, async () => {
      const { r, text } = await send(url, method)
      assert.equal(r.status, 503); assert.equal(JSON.parse(text).code, 'PREVIEW_READ_ONLY'); assert.ok(r.headers.get('cache-control').includes('no-store'))
    })
  }
  for (const file of (await files('pages/api/admin')).filter(p => p.endsWith('.ts'))) {
    const url = `/${file.replace(/^pages\//, '').replace(/\.ts$/, '').replace(/\[id\]/g, '1')}`
    await check(`POST ${url} read-only`, async () => { const { r, text } = await send(url, 'POST'); assert.equal(r.status, 503); assert.equal(JSON.parse(text).code, 'PREVIEW_READ_ONLY') })
  }
  for (const url of ['/api/page-view', '/api/affiliate-click']) await check(`${url} skips inherited credentials`, async () => {
    const { r, text } = await send(url, 'POST', { path: '/', contentType: 'home', affiliateLinkId: 1 })
    assert.equal(r.status, 200); assert.equal(JSON.parse(text).skipped, true); assert.equal(r.headers.get('cache-control'), 'private, no-store')
  })
  await check('server admin layout disables login without contacting Auth', async () => {
    const { r, text } = await send('/admin/login')
    assert.equal(r.status, 200); assert.ok(text.includes('Preview is read-only.'))
    assert.ok(!/<form\b/i.test(text))
  })
  await check('all blocked and skipped requests performed zero provider calls', async () => assert.equal(await readFile(`${fixture}.requests.jsonl`, 'utf8'), ''))
  const guides = JSON.parse(await readFile('data/guides.json', 'utf8')), notes = JSON.parse(await readFile('data/notes.json', 'utf8'))
  for (const url of [`/guide/${guides[0].slug}`, `/notes/${notes.find(n => n.published).slug}`, '/en/guide', '/en/nonexistent-rc11']) await check(`${url} contains no analytics injection`, async () => {
    const { r, text } = await send(url)
    assert.equal(r.status, url.includes('nonexistent') ? 404 : 200)
    assert.ok(!/googletagmanager\.com|G-OFFLINE-RC11|vercel\/analytics|insights\/script\.js|speed-insights\/script\.js/.test(text))
  })
  await stop()
  await start({ VERCEL_ENV: 'production', ADMIN_EMAILS: '' })
  await check('Production missing ADMIN_EMAILS fails closed with no Auth request', async () => {
    const before = await readFile(`${fixture}.requests.jsonl`, 'utf8')
    const { r, text } = await send('/api/admin/locations', 'PATCH', { id: 1 })
    assert.equal(r.status, 503); assert.ok(JSON.parse(text).error.includes('白名单'))
    assert.equal(await readFile(`${fixture}.requests.jsonl`, 'utf8'), before)
  })
} finally {
  await stop()
  await writeFile(`${out}/preview-runtime-server.log`, log)
  await writeFile(`${out}/preview-runtime-summary.json`, JSON.stringify({ checks, responses, passed: checks.filter(c => c.passed).length, total: checks.length, scope: 'Local Next 14 production server, Preview build and synthetic/denied providers only. No real Vercel Authentication or cloud writes.' }, null, 2))
  console.log(JSON.stringify({ passed: checks.filter(c => c.passed).length, total: checks.length, failures: checks.filter(c => !c.passed) }, null, 2))
  if (checks.some(c => !c.passed)) process.exitCode = 1
}
