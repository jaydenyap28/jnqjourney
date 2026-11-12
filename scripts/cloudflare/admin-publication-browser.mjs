import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { ADMIN_ORIGIN, FUNCTION, PROJECT_REF, SUPABASE_ORIGIN } from '../../cloudflare/admin-preview/scope.mjs'

const [mode, ref] = process.argv.slice(2)
assert.ok(['--queue', '--retry', '--verify', '--withdraw', '--invalidate-withdrawal', '--reapprove-withdrawal', '--verify-withdrawal'].includes(mode) && ref === PROJECT_REF)
const directory = 'artifacts/cloudflare-admin-isolated/'
const file = directory + 'publication-browser-state.json'
const state = mode === '--queue' ? { marker: Date.now().toString(36) } : JSON.parse(await readFile(file))
const credentials = JSON.parse(await readFile('cloudflare/spot-loop/.dev.vars.spot-loop-session'))
const config = JSON.parse(await readFile(directory + 'anon-build.json'))
assert.equal(credentials.projectRef, PROJECT_REF)
assert.equal(config.origin, SUPABASE_ORIGIN)
const auth = createClient(SUPABASE_ORIGIN, config.key, { auth: { persistSession: false, autoRefreshToken: false } })
const session = await auth.auth.signInWithPassword({ email: credentials.email, password: credentials.password })
assert.ok(!session.error && session.data.user?.id === credentials.userId)
const base = SUPABASE_ORIGIN + '/functions/v1/' + FUNCTION
async function api(route, body) {
  const response = await fetch(base + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: 'Bearer ' + session.data.session.access_token, Origin: ADMIN_ORIGIN,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(25000),
  })
  return { http: response.status, data: await response.json() }
}
const status = async () => {
  const result = await api('/publication')
  assert.equal(result.http, 200, result.data.error)
  return result.data
}
const { chromium } = await import('../../artifacts/cloudflare-upload-fix/browser-tools/node_modules/playwright-core/index.mjs')
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
let phase = 'login'
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  page.on('dialog', dialog => void dialog.accept())
  async function navigate(route) {
    const response = await page.goto(ADMIN_ORIGIN + route, { waitUntil: 'domcontentloaded', timeout: 30000 })
    assert.equal(response.status(), 200)
  }
  async function mutation(route, method, click) {
    const request = page.waitForResponse(response =>
      response.url() === base + route && response.request().method() === method, { timeout: 25000 })
    await click()
    const response = await request
    const data = await response.json()
    assert.ok(response.ok(), method + ' ' + route + ' ' + response.status() + ' ' + (data.error?.message || data.error || ''))
    return { data, http: response.status() }
  }
  const panel = page.locator('details').filter({ has: page.getByLabel('网站发布', { exact: true }) }).first()
  async function open() {
    await page.getByLabel('网站发布', { exact: true }).click()
    await panel.waitFor()
  }
  async function prepare() {
    await panel.getByRole('button', { name: '准备发布', exact: true }).click()
    await panel.getByRole('button', { name: '发布网站', exact: true }).waitFor()
  }
  const chosen = title => panel.getByRole('checkbox', { name: new RegExp(title) })
  async function submit() {
    return mutation('/publication', 'POST', () => panel.getByRole('button', { name: '发布网站', exact: true }).click())
  }
  await navigate('/admin/login')
  await page.locator('#email').fill(credentials.email)
  await page.locator('#password').fill(credentials.password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('link', { name: '录入新景点' }).waitFor()
  if (mode === '--queue') {
    phase = 'prepare isolated drafts'
    const before = await status()
    assert.equal(before.job, null, 'Existing publication queue requires a new test scope')
    assert.equal(before.live, null)
    state.spotTitle = 'Publication Spot ' + state.marker
    state.noteTitle = 'Publication Note ' + state.marker
    state.guideTitle = 'Publication Guide ' + state.marker
    await navigate('/admin/add')
    await page.locator('#name').fill(state.spotTitle)
    await page.locator('#latitude').fill('1.43')
    await page.locator('#longitude').fill('103.65')
    const png = await sharp({ create: { width: 37, height: 29, channels: 3, background: '#164898' } }).png().toBuffer()
    const upload = await mutation('/upload/r2', 'POST', () => page.locator('input[type=file]').first().setInputFiles({
      name: 'synthetic-publication.png', mimeType: 'image/png', buffer: png,
    }))
    state.image = upload.data.items[0].url.split('/').at(-1)
    await page.locator('img[src^="blob:"]').first().waitFor()
    const created = await mutation('/admin/locations', 'POST', () => page.locator('button[type=submit]').click())
    state.spotId = created.data.data.id
    await page.getByText('草稿已保存到隔离后台。', { exact: true }).waitFor()
    assert.equal((await status()).job, null)
    assert.equal((await status()).live, null)
    state.draftSaveDidNotQueue = true
    await writeFile(file, JSON.stringify(state, null, 2))

    phase = 'prepare Spot Note Guide revisions'
    await navigate('/admin/edit?id=' + state.spotId)
    await page.locator('summary').filter({ hasText: 'Redirect / Advanced' }).click()
    await page.getByLabel(/发布状态/).selectOption('published')
    await mutation('/admin/locations', 'PATCH', () => page.locator('button[type=submit]').click())
    await page.getByText('已保存到隔离后台。', { exact: true }).waitFor()
    await navigate('/admin/notes')
    await page.getByRole('button').filter({ hasText: /Isolated Note mwc8sp3w/ }).first().click()
    await page.getByPlaceholder('Cameron Highlands travel guide').fill(state.noteTitle)
    await page.locator('textarea[placeholder^="在此输入您的旅行故事"]').fill('## 隔离发布长文\n\n公开 Note 版本 ' + state.marker)
    await page.locator('#published').check()
    await mutation('/admin/notes', 'POST', () => page.getByRole('button', { name: 'Save Draft', exact: true }).click())
    await navigate('/admin/guides')
    await page.getByRole('button').filter({ hasText: /Updated Guide mwc8sp3w/ }).first().click()
    await page.locator('label').filter({ hasText: /^Title$/ }).locator('..').locator('input').first().fill(state.guideTitle)
    await mutation('/admin/guides', 'POST', () => page.getByRole('button', { name: 'Save guide', exact: true }).first().click())
    await page.getByText(/Saved successfully at/).waitFor()
    assert.equal((await status()).job, null)
    const { items } = (await api('/publication/catalog')).data
    const selected = items.filter(item => [state.spotTitle, state.noteTitle, state.guideTitle].includes(item.title))
    assert.equal(selected.length, 3)
    assert.ok(selected.every(item => item.eligible))
    const stale = await api('/publication', { selection: [{ ...selected[0], version: '2000-01-01T00:00:00.000Z' }] })
    assert.equal(stale.http, 409)
    assert.equal((await status()).job, null)
    state.staleVersion = stale.http
    await writeFile(file, JSON.stringify(state, null, 2))
    phase = 'browser enqueue and duplicate'
    await open()
    await prepare()
    for (const title of [state.spotTitle, state.noteTitle, state.guideTitle]) await chosen(title).check()
    const createdJob = await submit()
    assert.equal(createdJob.http, 202)
    state.jobId = createdJob.data.id
    const duplicate = await submit()
    assert.equal(duplicate.http, 200)
    assert.equal(duplicate.data.id, state.jobId)
    assert.equal(duplicate.data.duplicate, true)
    await panel.locator('[data-publication-state="waiting"]').waitFor()
    state.offlineWaiting = true
    state.duplicateCoalesced = true
  } else if (mode === '--retry') {
    phase = 'retry a confirmed pre-submission failure'
    const failed = await status()
    assert.equal(failed.job.id, state.jobId)
    assert.equal(failed.state, 'failed')
    assert.ok(['AUTHORITY_VERIFICATION_FAILED', 'WRANGLER_PATH_NOT_AVAILABLE'].includes(failed.job.reason))
    assert.equal(failed.live, null)
    await open()
    const retry = await mutation('/publication/retry', 'POST', () => panel.getByRole('button', { name: '重试发布', exact: true }).click())
    assert.equal(retry.http, 202)
    state.failure = failed.job.reason
    state.retryAccepted = true
  } else if (mode === '--withdraw') {
    phase = 'withdraw approved Spot and requeue'
    assert.equal((await status()).live.id, state.jobId)
    await navigate('/admin/edit?id=' + state.spotId)
    await page.locator('summary').filter({ hasText: 'Redirect / Advanced' }).click()
    await page.getByLabel(/发布状态/).selectOption('hidden')
    await mutation('/admin/locations', 'PATCH', () => page.locator('button[type=submit]').click())
    await page.getByText('已保存到隔离后台。', { exact: true }).waitFor()
    const current = await status()
    assert.equal(current.live.id, state.jobId)
    assert.equal(current.job.id, state.jobId)
    assert.equal((await api('/publication', { selection: current.job.approvals })).http, 409)
    await navigate('/admin')
    await open()
    await prepare()
    assert.ok(await chosen(state.spotTitle).isDisabled())
    for (const title of [state.noteTitle, state.guideTitle]) await chosen(title).check()
    const next = await submit()
    assert.equal(next.http, 202)
    assert.notEqual(next.data.id, state.jobId)
    state.withdrawalJobId = next.data.id
    state.withdrawnVersionRejected = 409
  } else if (mode === '--invalidate-withdrawal') {
    phase = 'edit selected Note while queued executor is stopped'
    const queued = await status()
    assert.equal(queued.job.id, state.withdrawalJobId)
    assert.ok(['waiting', 'queued'].includes(queued.state))
    await navigate('/admin/notes')
    await page.getByRole('button').filter({ hasText: /Isolated Note mwc8sp3w/ }).first().click()
    const editor = page.locator('textarea[placeholder^="在此输入您的旅行故事"]')
    const markdown = await editor.inputValue()
    assert.match(markdown, new RegExp(state.marker))
    await editor.fill(markdown + '\n\n隔离撤销复核版。')
    const saved = await mutation('/admin/notes', 'POST', () => page.getByRole('button', { name: 'Save Draft', exact: true }).click())
    assert.equal(saved.data.note.title, state.noteTitle)
    const stillQueued = await status()
    assert.equal(stillQueued.job.id, state.withdrawalJobId)
    assert.equal(stillQueued.live.id, state.jobId)
    state.invalidatedJobId = state.withdrawalJobId
  } else if (mode === '--reapprove-withdrawal') {
    phase = 'verify stale queued rejection and approve current versions'
    const failed = await status()
    assert.equal(failed.state, 'failed')
    assert.equal(failed.job.id, state.invalidatedJobId)
    assert.equal(failed.job.reason, 'APPROVED_VERSION_CHANGED')
    assert.equal(failed.job.retryable, false)
    assert.equal(failed.live.deploymentId, state.first.deploymentId)
    const prior = await fetch(failed.live.url + '/_publication.json', { redirect: 'error', signal: AbortSignal.timeout(15000) })
    assert.equal(prior.status, 200)
    assert.equal((await prior.json()).revision, state.jobId)
    state.staleQueuedJobPreservedPrevious = true
    await open()
    await prepare()
    assert.ok(await chosen(state.spotTitle).isDisabled())
    for (const title of [state.noteTitle, state.guideTitle]) await chosen(title).check()
    const next = await submit()
    assert.equal(next.http, 202)
    assert.notEqual(next.data.id, state.invalidatedJobId)
    state.withdrawalJobId = next.data.id
  } else {
    phase = 'real Pages receipt and admin link'
    const current = await status()
    const withdrawal = mode === '--verify-withdrawal'
    const id = withdrawal ? state.withdrawalJobId : state.jobId
    assert.equal(current.state, 'published', current.job?.reason)
    assert.equal(current.live.id, id)
    assert.equal(current.live.functions, 0)
    const receipt = await fetch(current.live.url + '/_publication.json', { redirect: 'error', signal: AbortSignal.timeout(15000) })
    assert.equal(receipt.status, 200)
    assert.match(receipt.headers.get('x-robots-tag') || '', /noindex/)
    const data = await receipt.json()
    assert.equal(data.revision, id)
    assert.equal(data.pages.length, withdrawal ? 2 : 3)
    await open()
    await panel.locator('[data-publication-state="published"]').waitFor()
    assert.match(await panel.innerText(), new RegExp(current.live.deploymentId))
    await panel.screenshot({ path: directory + (withdrawal ? 'withdrawal-receipt.png' : 'publication-receipt.png') })
    if (withdrawal) {
      assert.ok(current.live.evidence.removedPages.some(route => route.startsWith('/spot/')))
      assert.ok(current.live.evidence.removedMedia.includes('/media/static/' + state.image))
      assert.equal(current.live.downloaded, 0)
      state.withdrawal = current.live
    } else {
      assert.ok(data.media.some(row => row.url.endsWith(state.image)))
      const html = await page.goto(current.live.url + data.pages.find(route => route.startsWith('/spot/')), { waitUntil: 'domcontentloaded' })
      assert.equal(html.status(), 200)
      assert.equal(await page.locator('h1').innerText(), state.spotTitle)
      assert.ok(await page.locator('img').first().evaluate(async image => { await image.decode(); return image.naturalWidth > 0 }))
      state.first = current.live
      state.firstAttempt = current.job.attempt
    }
  }
  await writeFile(file, JSON.stringify(state, null, 2))
  console.log(JSON.stringify({ mode, passed: true, state }))
} catch (error) {
  console.log(JSON.stringify({ mode, phase, error: String(error.message).slice(0, 400) }))
  process.exitCode = 1
} finally {
  await browser.close()
}
