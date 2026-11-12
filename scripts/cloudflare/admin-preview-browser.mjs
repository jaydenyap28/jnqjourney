import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { isolatedKeys } from './isolated-supabase.mjs'
import { ADMIN_ORIGIN, FUNCTION, MEDIA_PREFIX, PRIVATE_BUCKET, PROJECT_REF, SUPABASE_ORIGIN } from '../../cloudflare/admin-preview/scope.mjs'

const local = process.argv.includes('--local-files')
const args = process.argv.slice(2).filter(arg => arg !== '--local-files')
const checkpoint = args[1]?.match(/^--resume=(browser-([a-z0-9]+)(?:-resumed-\d+)?\.json)$/)
assert.deepEqual(args, checkpoint ? [PROJECT_REF, '--resume=' + checkpoint[1]] : [PROJECT_REF])
const root = 'artifacts/cloudflare-admin-isolated/'
const { chromium } = await import('../../artifacts/cloudflare-upload-fix/browser-tools/node_modules/playwright-core/index.mjs')
const owner = JSON.parse(await readFile('cloudflare/spot-loop/.dev.vars.spot-loop-session'))
const deployment = JSON.parse(await readFile(root + (local ? 'pages-submitted.json' : 'pages-deployment.json')))
assert.equal(owner.projectRef, PROJECT_REF)
assert.equal(new URL(deployment.url).origin, ADMIN_ORIGIN)
assert.ok(!deployment.production && deployment.functions === 0)
const keys = await isolatedKeys()
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const service = createClient(SUPABASE_ORIGIN, keys.service, options)
const auth = createClient(SUPABASE_ORIGIN, keys.anon, options)
const sign = await auth.auth.signInWithPassword({ email: owner.email, password: owner.password })
assert.ok(!sign.error && sign.data.user.id === owner.userId)
const token = sign.data.session.access_token
const base = SUPABASE_ORIGIN + '/functions/v1/' + FUNCTION
const marker = checkpoint?.[2] ?? Date.now().toString(36)
const report = { deploymentId: deployment.deploymentId, project: PROJECT_REF, frontend: local ? 'local-export' : 'pages-preview', checks: {}, passed: false }
const record = (label, value) => { report.checks[label] = value }
const call = async (route, access = token, method = 'GET', body) => {
  const response = await fetch(base + route, {
    method, headers: { Origin: ADMIN_ORIGIN, ...(access ? { Authorization: 'Bearer ' + access } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(20000),
  })
  return { status: response.status, body: await response.json() }
}
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const out = local ? path.resolve(JSON.parse(await readFile(root + 'package.json')).out) : null
async function openContext(settings) {
  const context = await browser.newContext({ ...settings, serviceWorkers: 'block' })
  if (out) {
    // Diagnose the exact frontend package while its Preview certificate is
    // pending. Auth, API calls and object bytes still use the real cloud.
    await context.route(ADMIN_ORIGIN + '/**', async request => {
      const url = new URL(request.request().url())
      const candidate = path.resolve(out, '.' + decodeURIComponent(url.pathname))
      if (!candidate.startsWith(out + path.sep) && candidate !== out) return request.abort()
      for (const file of [candidate, candidate + '.html', path.join(candidate, 'index.html')]) {
        const exists = await stat(file).then(info => info.isFile(), () => false)
        if (exists) return request.fulfill({ path: file })
      }
      return request.fulfill({ status: 404, body: 'Not found' })
    })
  }
  return context
}
let ordinaryId
let step = 'starting'
const earlier = checkpoint ? JSON.parse(await readFile(root + checkpoint[1])) : null
try {
  const context = await openContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const navigate = async path => {
    const result = await page.goto(ADMIN_ORIGIN + path, { waitUntil: 'domcontentloaded', timeout: 30000 })
    assert.equal(result.status(), 200)
  }
  async function login(target, credentials) {
    await target.locator('#email').fill(credentials.email)
    await target.locator('#password').fill(credentials.password)
    await target.getByRole('button', { name: '登录', exact: true }).click()
  }
  async function action(path, method, click) {
    const pending = page.waitForResponse(response =>
      response.url().startsWith(base + path) && response.request().method() === method, { timeout: 25000 })
    await click()
    const response = await pending
    const body = await response.json()
    assert.ok(response.ok(), `${method} ${path}: ${response.status()} ${body?.error?.message || body?.error || ''}`)
    return body
  }
  step = 'browser login'
  await navigate('/admin/login')
  await login(page, owner)
  await page.getByRole('link', { name: '录入新景点' }).waitFor()
  record('browserAdminLogin', true)
  assert.equal((await call('/admin/locations', '')).status, 401)
  assert.equal((await call('/admin/locations', 'invalid.jwt.token')).status, 401)
  record('anonymousAndInvalidJwtDenied', true)

  const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#077d62' } }).png().toBuffer()
  let spot
  let imageName
  if (earlier) {
    assert.equal(earlier.deploymentId, deployment.deploymentId)
    assert.ok(earlier.checks.spot?.readBack && earlier.checks.privateR2UploadAndBrowserDecode)
    spot = (await call('/admin/locations')).body.data.find(row => row.name === 'Updated Spot ' + marker)
    assert.ok(spot?.image_url?.startsWith(MEDIA_PREFIX) && spot.publication_status === 'draft')
    imageName = spot.image_url.split('#')[0].slice(MEDIA_PREFIX.length)
    record('spot', earlier.checks.spot)
    record('privateR2UploadAndBrowserDecode', true)
    report.resumedFrom = checkpoint[1]
  } else {
    step = 'Spot add and private R2 upload'
    await navigate('/admin/add')
    await page.locator('#name').fill('Isolated Spot ' + marker)
    await page.locator('#name_cn').fill('隔离景点测试')
    await page.locator('#custom_slug').fill('isolated-spot-' + marker)
    await page.locator('#latitude').fill('1.432')
    await page.locator('#longitude').fill('103.654')
    const upload = await action('/upload/r2', 'POST', () => page.locator('input[type=file]').first().setInputFiles({
      name: 'synthetic.png', mimeType: 'image/png', buffer: png,
    }))
    const image = upload.items[0].url
    assert.ok(image.startsWith(MEDIA_PREFIX))
    await page.locator('img[src^="blob:"]').first().waitFor()
    assert.ok(await page.locator('img[src^="blob:"]').first().evaluate(async img => { await img.decode(); return img.naturalWidth > 0 }))
    imageName = image.slice(MEDIA_PREFIX.length)
    const privateImage = await fetch(base + '/admin/media?name=' + imageName, { redirect: 'error' })
    assert.equal(privateImage.status, 401)
    record('privateR2UploadAndBrowserDecode', true)
    spot = (await action('/admin/locations', 'POST', () => page.locator('button[type=submit]').click())).data
    await page.getByText('草稿已保存到隔离后台。', { exact: true }).waitFor()
    const initial = await call('/admin/locations?id=' + spot.id)
    assert.equal(initial.body.data.image_url.split('#')[0], image)
    assert.equal(initial.body.data.publication_status, 'draft')
    assert.equal((await call('/admin/location-slugs?id=' + spot.id)).body.slug, 'isolated-spot-' + marker)
    step = 'Spot edit, read-back and conflict'
    await navigate('/admin/edit?id=' + spot.id)
    await page.locator('#name').fill('Updated Spot ' + marker)
    await action('/admin/locations', 'PATCH', () => page.locator('button[type=submit]').click())
    await page.getByText('已保存到隔离后台。', { exact: true }).waitFor()
    const updated = await call('/admin/locations?id=' + spot.id)
    assert.equal(updated.body.data.name, 'Updated Spot ' + marker)
    const staleSpot = await call('/admin/locations', token, 'PATCH', { id: spot.id, expectedUpdatedAt: spot.updated_at, data: { name: 'must not persist' } })
    assert.equal(staleSpot.status, 409)
    assert.equal((await call('/admin/locations?id=' + spot.id)).body.data.name, updated.body.data.name)
    record('spot', { created: true, updated: true, readBack: true, stale: 409, draft: true, slug: true })
  }
  step = 'Spot English draft'
  if (!earlier?.checks.spotEnglishDraft) {
    await navigate('/admin/edit?id=' + spot.id)
    await page.getByRole('tab', { name: 'English' }).click()
    await page.locator('#en-description').fill('Isolated English description')
    const english = await action('/admin/spot-localization/' + spot.id, 'PUT',
      () => page.getByRole('button', { name: '保存英文草稿' }).click())
    assert.equal(english.record.fields.description.text, 'Isolated English description')
  }
  assert.equal((await call('/admin/spot-localization/' + spot.id)).body.record.fields.description.text, 'Isolated English description')
  record('spotEnglishDraft', true)
  const malformed = new FormData()
  malformed.set('file', new Blob(['not an image'], { type: 'image/png' }), 'invalid.png')
  const deniedFile = await fetch(base + '/upload/r2', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, Origin: ADMIN_ORIGIN },
    body: malformed, redirect: 'error', signal: AbortSignal.timeout(20000),
  })
  assert.equal(deniedFile.status, 415)
  await deniedFile.body?.cancel()
  record('falseImageSignatureRejected', 415)

  step = 'Note browser draft and preview'
  const noteTitle = 'Isolated Note ' + marker
  if (earlier?.checks.noteAutosave) {
    const note = (await call('/admin/notes')).body.notes.find(row => row.slug === 'isolated-note-' + marker)
    assert.equal(note.title, noteTitle)
    assert.equal(note.published, false)
    assert.match(note.content, /自动保存已读回/)
    record('note', earlier.checks.note)
  } else {
    await navigate('/admin/notes')
    await page.getByRole('button', { name: 'New', exact: true }).click()
    await action('/upload/r2', 'POST', () => page.locator('input[type=file]').first().setInputFiles({
      name: 'synthetic.png', mimeType: 'image/png', buffer: png,
    }))
    await page.getByPlaceholder('Cameron Highlands travel guide').fill(noteTitle)
    await page.getByPlaceholder('cameron-highlands-trip').fill('isolated-note-' + marker)
    const markdown = '## 隔离长文预览\n\n第一段测试内容。\n\n> 第二段引用。'
    await page.locator('textarea[placeholder^="在此输入您的旅行故事"]').fill(markdown)
    const note = (await action('/admin/notes', 'POST', () => page.getByRole('button', { name: 'Save Draft' }).click())).note
    assert.equal(note.title, noteTitle)
    assert.equal(note.published, false)
    assert.ok(note.coverImage.startsWith(MEDIA_PREFIX))
    assert.ok(note.blocks.some(block => block.type === 'heading') && note.blocks.some(block => block.type === 'quote'))
    await page.getByRole('button', { name: /实境预览/ }).first().click()
    await page.getByRole('heading', { name: '隔离长文预览' }).first().waitFor()
    const staleNote = await call('/admin/notes', token, 'POST', { ...note, previousSlug: note.slug, expectedUpdatedAt: '2000-01-01T00:00:00.000Z', title: 'must not persist' })
    assert.equal(staleNote.status, 409)
    assert.equal((await call('/admin/notes')).body.notes.find(row => row.slug === note.slug).title, noteTitle)
    record('note', { savedDraft: true, markdownBlocks: true, cover: true, preview: true, readBack: true, stale: 409 })
    await navigate('/admin/notes')
    await page.getByRole('button').filter({ hasText: noteTitle }).first().click()
    const autosaved = (await action('/admin/notes', 'POST', () =>
      page.locator('textarea[placeholder^="在此输入您的旅行故事"]').fill(markdown + '\n\n自动保存已读回。'))).note
    assert.match(autosaved.content, /自动保存已读回/)
  }
  record('noteAutosave', true)

  step = 'Guide browser save and validation'
  await navigate('/admin/guides')
  await page.getByRole('button', { name: 'New guide', exact: true }).click()
  const guideTitle = 'Isolated Guide ' + marker
  await action('/upload/r2', 'POST', () => page.locator('input[type=file]').first().setInputFiles({
    name: 'synthetic.png', mimeType: 'image/png', buffer: png,
  }))
  const titleFields = page.locator('label').filter({ hasText: /^Title$/ }).locator('..').locator('input')
  const titleInput = titleFields.first()
  await titleInput.fill(guideTitle)
  await page.getByRole('button', { name: 'Add day', exact: true }).click()
  await titleFields.last().fill('Isolated day plan')
  const expandDay = page.getByRole('button', { name: '展开景点选择', exact: true }).last()
  if (await expandDay.isVisible()) await expandDay.click()
  await page.getByRole('button', { name: new RegExp('Updated Spot ' + marker) }).first().click()
  await page.getByRole('button', { name: 'Add item', exact: true }).click()
  await page.locator('select').filter({ has: page.locator('option[value="Food & Dining"]') }).first().selectOption('Food & Dining')
  await page.getByPlaceholder('1200 / 350 / TBC').first().fill('100')
  await page.getByPlaceholder('RM 4.3k').fill('RM 100')
  const guide = (await action('/admin/guides', 'POST', () => page.getByRole('button', { name: 'Save guide' }).first().click())).guide
  assert.equal(guide.title, guideTitle)
  assert.ok(guide.coverImage.startsWith(MEDIA_PREFIX))
  assert.ok(guide.budgetItems.some(item => item.label === 'Food & Dining' && item.amount === '100'))
  assert.equal(guide.days.find(day => day.title === 'Isolated day plan').attractions[0].spotId, spot.id)
  await page.getByText(/Saved successfully at/).waitFor()
  await titleInput.fill('Updated Guide ' + marker)
  const guideUpdated = (await action('/admin/guides', 'POST', () => page.getByRole('button', { name: 'Save guide' }).first().click())).guide
  assert.equal(guideUpdated.title, 'Updated Guide ' + marker)
  const staleGuide = await call('/admin/guides', token, 'POST', { ...guide, previousSlug: guide.slug, expectedUpdatedAt: guide.updatedAt })
  assert.equal(staleGuide.status, 409)
  const invalidGuide = await call('/admin/guides', token, 'POST', { ...guideUpdated, previousSlug: guideUpdated.slug, expectedUpdatedAt: guideUpdated.updatedAt,
    budget: 'RM 100', budgetItems: [{ label: 'Meals', category: 'food', amount: 'RM 200' }] })
  assert.equal(invalidGuide.status, 400)
  const storedGuide = (await call('/admin/guides')).body.guides.find(row => row.slug === guideUpdated.slug)
  assert.equal(storedGuide.updatedAt, guideUpdated.updatedAt)
  assert.equal(storedGuide.title, guideUpdated.title)
  record('guide', { created: true, updated: true, readBack: true, cover: true, dayAndSpotBinding: true, budgetSaved: true, stale: 409, budgetValidation: 400 })

  step = 'ordinary account and private storage'
  const regular = { email: `jnq-admin-deny-${marker}@example.invalid`, password: randomBytes(24).toString('base64url') }
  const created = await service.auth.admin.createUser({ ...regular, email_confirm: true, user_metadata: { role: 'admin' } })
  assert.ok(!created.error && created.data.user)
  ordinaryId = created.data.user.id
  const mobile = await openContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const mobilePage = await mobile.newPage()
  await mobilePage.goto(ADMIN_ORIGIN + '/admin/login')
  await login(mobilePage, regular)
  await mobilePage.getByRole('alert').getByText(/没有后台权限/).waitFor()
  const ordinary = createClient(SUPABASE_ORIGIN, keys.anon, options)
  const signed = await ordinary.auth.signInWithPassword(regular)
  assert.ok(signed.data.session)
  const ordinaryToken = signed.data.session.access_token
  for (const [route, sample] of [['/admin/locations', { data: { name: 'denied' } }], ['/admin/notes', { slug: 'denied' }], ['/admin/guides', { slug: 'denied' }]]) {
    assert.equal((await call(route, ordinaryToken, 'POST', sample)).status, 403)
  }
  const anon = createClient(SUPABASE_ORIGIN, keys.anon, options)
  for (const client of [anon, ordinary]) {
    const rows = await client.from('locations').select('id,description').eq('id', spot.id)
    assert.ok(rows.error || rows.data.length === 0)
    for (const name of ['notes', 'guides']) assert.ok((await client.storage.from(PRIVATE_BUCKET).download(`_system/${name}-latest.webp`)).error)
  }
  assert.equal((await call('/admin/media?name=' + imageName, ordinaryToken)).status, 403)
  record('ordinaryAccountDeniedWithAdminUserMetadata', true)
  record('privatePointersAndDirectLocationReadsDenied', true)
  await mobile.close()
  const reentry = await openContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const phone = await reentry.newPage()
  await phone.goto(ADMIN_ORIGIN + '/admin/login')
  await login(phone, owner)
  await phone.getByRole('link', { name: '长文笔记' }).click()
  await phone.getByRole('button').filter({ hasText: noteTitle }).first().click()
  assert.match(await phone.locator('textarea[placeholder^="在此输入您的旅行故事"]').inputValue(), /自动保存已读回/)
  const publication = await call('/publication')
  assert.equal(publication.status, 200)
  assert.ok(['draft', 'waiting', 'queued', 'building', 'verifying', 'published', 'failed'].includes(publication.body.state))
  record('publication', publication.body.state)
  await phone.getByRole('button', { name: 'Sign out' }).click()
  await phone.waitForURL(url => url.pathname === '/admin/login')
  await phone.locator('#email').waitFor()
  await phone.goto(ADMIN_ORIGIN + '/admin/notes')
  await phone.waitForURL(url => url.pathname === '/admin/login')
  record('mobileAdminLoginNoteRecoveryAndLogout', true)
  assert.equal((await call('/session')).status, 401)
  record('revokedAuthSessionDenied', 401)
  await reentry.close()
  await context.close()
  report.passed = true
} catch (error) {
  report.failure = { step, message: String(error.message).slice(0, 500) }
  process.exitCode = 1
} finally {
  if (ordinaryId) record('temporaryOrdinaryAccountRemoved', !(await service.auth.admin.deleteUser(ordinaryId)).error)
  await browser.close()
  await writeFile(root + 'browser-' + marker + (earlier ? '-resumed-' + Date.now() : '') + '.json', JSON.stringify(report, null, 2))
}
console.log(JSON.stringify(report))
