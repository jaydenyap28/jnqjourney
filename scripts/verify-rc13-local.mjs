import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'

const base = 'http://127.0.0.1:3214'
const responses = [], checks = []
async function get(path) {
  const response = await fetch(base + path, { redirect: 'manual', signal: AbortSignal.timeout(45000) })
  const html = await response.text()
  const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  const row = { path, status: response.status, bytes: Buffer.byteLength(html),
    h1: [...visible.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => m[1].replace(/<[^>]+>/g, '')),
    canonical: [...html.matchAll(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/g)].map(m => m[1]),
    robots: response.headers.get('x-robots-tag'),
  }
  responses.push(row)
  return { ...row, html, visible }
}
async function check(name, action) {
  if (process.argv[2] === 'packages-only' && !/Batam|Tioman/.test(name)) return
  try { await action(); checks.push({ name, passed: true }) } catch (error) { checks.push({ name, passed: false, error: error.message }) }
}
await check('Hainan still renders two active options under one parent with price units and comparison anchor', async () => {
  const r = await get('/packages/hainan-test')
  assert.equal(r.status, 200); assert.equal(r.h1.length, 1)
  for (const text of ['4D3N 方案', '5D4N 方案', '每人', '每房', '最终报价以确认为准', 'href="#package-options"']) assert.ok(r.visible.includes(text), text)
  const texts = [...r.visible.matchAll(/href="(https:\/\/wa\.me\/[^\"]+)"/g)].map(m => new URL(m[1].replaceAll('&amp;', '&')).searchParams.get('text'))
  assert.ok(texts.some(t => t.includes('海南休闲之旅') && t.includes('4D3N 方案') && t.includes('RC12-OPTION-1')))
})
await check('Batam renders seven option inquiries and retains the daily itinerary', async () => {
  const r = await get('/packages/batam-test'); assert.equal(r.status, 200)
  for (let i = 1; i <= 7; i++) assert.ok(r.visible.includes(`询问本地验收方案 ${i}`))
  assert.ok(r.visible.includes('id="package-itinerary"'))
})
await check('Tioman renders three option choices using the existing detail implementation', async () => {
  const r = await get('/packages/tioman-3d2n'); assert.equal(r.status, 200)
  for (let i = 1; i <= 3; i++) assert.ok(r.visible.includes(`本地验收方案 ${i}`))
})
await check('package listing has one H1 and its canonical', async () => {
  const r = await get('/packages'); assert.equal(r.status, 200); assert.equal(r.h1.length, 1)
  assert.ok(r.canonical.some(url => url.endsWith('/packages')))
})
await check('Guide and Note retain individual canonical and one H1', async () => {
  for (const path of ['/guide/china-jiangnan-autumn-15d14n', '/notes/malaysia-turtle-night-terengganu']) {
    const r = await get(path); assert.equal(r.status, 200); assert.equal(r.h1.length, 1)
    assert.ok(r.canonical.some(url => url.endsWith(path)))
  }
})
await check('English Note fallback stays noindex and self canonical', async () => {
  const r = await get('/en/notes/malaysia-turtle-night-terengganu'); assert.equal(r.status, 200)
  assert.ok(r.visible.includes('noindex')); assert.ok(r.canonical.some(url => url.endsWith('/en/notes/malaysia-turtle-night-terengganu')))
})
await check('local service refuses mutations before reaching any real API handler', async () => {
  const r = await fetch(base + '/api/admin/locations', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  assert.equal(r.status, 503); assert.match((await r.json()).error, /read-only/)
})
await writeFile(`artifacts/rc1.3/${process.argv[2] === 'packages-only' ? 'http-package-recheck' : 'http'}.json`, JSON.stringify({ scope: 'Loopback development server and synthetic package data; no browser/cloud acceptance', checks, responses }, null, 2))
console.log(JSON.stringify({ passed: checks.filter(c => c.passed).length, total: checks.length, failures: checks.filter(c => !c.passed) }, null, 2))
if (checks.some(c => !c.passed)) process.exitCode = 1
