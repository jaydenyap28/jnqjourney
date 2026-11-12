import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { FORMAL_PROJECT, FORMAL_ADMIN_API } from '../../cloudflare/admin-preview/formal-admin-read.mjs'
import { SPOT_FIELDS } from '../../cloudflare/spot-loop/spot-contract.mjs'

assert.deepEqual(process.argv.slice(2), ['--await-login', FORMAL_PROJECT])
const workspace = path.resolve(process.env.JNQ_RECOVERY_WORKSPACE || '.')
assert.ok(process.env.JNQ_RECOVERY_WORKSPACE)
const root = path.join(workspace, 'production-publisher')
const json = file => readFile(file, 'utf8').then(JSON.parse)
const deployment = await json(path.join(root, 'read-only-pages-deployment.json'))
const roles = await json(path.join(root, 'verified-operator-allowlists.json'))
assert.equal(deployment.formalDataReadOnly, true)
const origin = new URL(deployment.url).origin
assert.equal(origin, 'https://read-only.jnqjourney-admin-formal.pages.dev')
const api = `https://${FORMAL_PROJECT}.supabase.co/functions/v1/${FORMAL_ADMIN_API}`
const publicKey = await json('artifacts/cloudflare-static-recovery/.public-read-key.json')
assert.equal(publicKey.projectRef, FORMAL_PROJECT)
const { chromium } = await import('../../artifacts/cloudflare-upload-fix/browser-tools/node_modules/playwright-core/index.mjs')
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: false })
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } })
const page = await context.newPage()
let savedToken = ''
let identityReady
const verifiedSession = new Promise(resolve => { identityReady = resolve })
let phase = 'waiting-for-user-login'
const result = { projectRef: FORMAL_PROJECT, adminUrl: deployment.url, deploymentId: deployment.deploymentId,
  writesEnabled: false, publishEnabled: false, anonymous: [], writes: [], reads: {}, ui: {},
  ordinaryFormalAccount: 'NOT_TESTED_NO_SEPARATE_APPROVED_ACCOUNT' }
const digest = data => createHash('sha256').update(JSON.stringify(data)).digest('hex')

async function request(route, token = savedToken, method = 'GET', body) {
  const response = await fetch(api + route, {
    method, headers: { Origin: origin, apikey: publicKey.apiKey,
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(25000),
  })
  const data = await response.json()
  return { status: response.status, data, cache: response.headers.get('cache-control') }
}

page.on('response', async response => {
  if (response.url() !== api + '/session' || response.status() !== 200) return
  const authorization = await response.request().headerValue('authorization')
  if (authorization?.startsWith('Bearer ')) {
    savedToken = authorization.slice(7)
    identityReady()
  }
})

try {
  for (const token of ['', 'invalid-token']) {
    const response = await request('/admin/locations', token)
    assert.ok([401, 403].includes(response.status))
    assert.ok(!Array.isArray(response.data.data))
    result.anonymous.push({ kind: token ? 'invalid-token' : 'no-token', status: response.status })
  }
  await page.goto(deployment.url, { waitUntil: 'domcontentloaded', timeout: 45000 })
  console.log(JSON.stringify({ event: 'FORMAL_ADMIN_LOGIN_READY', url: deployment.url,
    instruction: 'Sign in in the opened browser. Do not send the password or token to chat.' }))
  await page.waitForURL(url => url.pathname === '/admin', { timeout: 20 * 60_000 })
  await page.getByRole('link', { name: '录入新景点' }).waitFor({ timeout: 45000 })
  await verifiedSession
  assert.ok(savedToken)
  const claims = JSON.parse(Buffer.from(savedToken.split('.')[1], 'base64url'))
  assert.ok(roles.editorAuthIds.includes(claims.sub) && roles.publisherAuthIds.includes(claims.sub))
  result.confirmedOperatorLoggedIn = true
  console.log(JSON.stringify({ event: 'FORMAL_ADMIN_LOGIN_CONFIRMED' }))

  phase = 'authorized-read'
  const session = await request('/session')
  assert.equal(session.status, 200)
  assert.equal(session.data.writesEnabled, false)
  const locations = await request('/admin/locations')
  assert.equal(locations.status, 200)
  assert.match(locations.cache || '', /no-store/)
  assert.ok(Array.isArray(locations.data.data) && locations.data.data.length)
  const chosen = locations.data.data.find(row => row.id === 636) || locations.data.data[0]
  const detail = await request('/admin/locations?id=' + chosen.id)
  assert.equal(detail.status, 200)
  assert.ok(SPOT_FIELDS.every(field => Object.hasOwn(detail.data.data, field)))
  const notes = await request('/admin/notes')
  const guides = await request('/admin/guides')
  assert.equal(notes.status, 200)
  assert.equal(guides.status, 200)
  assert.ok(notes.data.notes.length && guides.data.guides.length)
  result.reads = { spots: locations.data.data.length, spotFields: SPOT_FIELDS.length,
    notes: notes.data.notes.length, guides: guides.data.guides.length, privateNoStore: true }

  phase = 'read-only-ui'
  await page.goto(origin + '/admin/edit?id=' + chosen.id, { waitUntil: 'domcontentloaded' })
  await page.locator('#name').waitFor()
  assert.equal(await page.locator('#name').inputValue(), chosen.name)
  result.ui.spotDetail = true
  await page.goto(origin + '/admin/notes', { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('Cameron Highlands travel guide').waitFor()
  await page.waitForFunction(expected => document.querySelector('input[placeholder="Cameron Highlands travel guide"]')?.value === expected,
    notes.data.notes[0].title, { timeout: 20000 })
  result.ui.noteEditor = true
  await page.goto(origin + '/admin/guides', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button').filter({ hasText: guides.data.guides[0].title }).first().click()
  result.ui.guideEditor = true
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.getByRole('button', { name: 'Sign out', exact: true }).isVisible())
  result.ui.mobile = true

  phase = 'write-refusal'
  const mutations = [
    ['/admin/locations', 'POST'], ['/admin/locations', 'PATCH'], ['/admin/locations', 'DELETE'],
    ['/admin/notes', 'POST'], ['/admin/notes', 'DELETE'],
    ['/admin/guides', 'POST'], ['/admin/guides', 'DELETE'],
    ['/upload/r2', 'POST'], ['/publication', 'POST'], ['/publication/retry', 'POST'],
  ]
  for (const [route, method] of mutations) {
    const response = await request(route, savedToken, method, {})
    assert.equal(response.status, 405)
    assert.match(response.data.error || '', /只读/)
    result.writes.push({ route, method, status: response.status })
  }
  const afterDetail = await request('/admin/locations?id=' + chosen.id)
  const afterNotes = await request('/admin/notes')
  const afterGuides = await request('/admin/guides')
  assert.equal(digest(afterDetail.data), digest(detail.data))
  assert.equal(digest(afterNotes.data), digest(notes.data))
  assert.equal(digest(afterGuides.data), digest(guides.data))
  result.businessDataUnchanged = true

  phase = 'logout-and-replay'
  const previous = savedToken
  assert.ok(JSON.parse(Buffer.from(previous.split('.')[1], 'base64url')).exp * 1000 > Date.now() + 30000)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.waitForURL(url => url.pathname === '/admin/login', { timeout: 20000 })
  const replay = await request('/admin/locations', previous)
  assert.equal(replay.status, 401, 'OLD_SESSION_STILL_ACCEPTED')
  savedToken = ''
  result.logoutReplayStatus = replay.status
  result.oldTokenWasUnexpired = true
  result.success = true
} catch (error) {
  result.success = false
  result.failedPhase = phase
  result.failure = /^[A-Z_]+$/.test(error.message || '') ? error.message : 'FORMAL_BROWSER_CHECK_FAILED'
  process.exitCode = 1
} finally {
  savedToken = ''
  await writeFile(path.join(root, 'read-only-browser-verification.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
  await browser.close()
}
