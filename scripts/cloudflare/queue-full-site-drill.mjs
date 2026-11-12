import assert from 'node:assert/strict'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { ADMIN_ORIGIN, FIRST_SPOT_ID, FUNCTION, LAST_SPOT_ID, PROJECT_REF, SUPABASE_ORIGIN } from '../../cloudflare/admin-preview/scope.mjs'

const [phase, ref] = process.argv.slice(2)
assert.ok(['--add', '--withdraw', '--status', '--retry'].includes(phase) && ref === PROJECT_REF)
const folder = 'artifacts/cloudflare-admin-isolated/publisher/'
const settings = JSON.parse(await readFile(folder + 'settings.json'))
assert.ok(settings.fullSiteDrill && settings.projectRef === PROJECT_REF)
const plan = folder + 'full-site-drill.json'
const credentials = JSON.parse(await readFile('cloudflare/spot-loop/.dev.vars.spot-loop-session'))
const config = JSON.parse(await readFile('artifacts/cloudflare-admin-isolated/anon-build.json'))
assert.equal(credentials.projectRef, PROJECT_REF)
assert.equal(config.origin, SUPABASE_ORIGIN)
const auth = createClient(SUPABASE_ORIGIN, config.key, { auth: { persistSession: false, autoRefreshToken: false } })
const login = await auth.auth.signInWithPassword({ email: credentials.email, password: credentials.password })
assert.ok(!login.error && login.data.user?.id === credentials.userId, 'ISOLATED_LOGIN_FAILED')

async function api(route, method = 'GET', body, expected = 200) {
  const form = body instanceof FormData
  const response = await fetch(SUPABASE_ORIGIN + '/functions/v1/' + FUNCTION + route, {
    method, headers: { Authorization: 'Bearer ' + login.data.session.access_token, Origin: ADMIN_ORIGIN,
      ...(body !== undefined && !form ? { 'Content-Type': 'application/json' } : {}) },
    body: body === undefined || form ? body : JSON.stringify(body),
    redirect: 'error', signal: AbortSignal.timeout(25000),
  })
  if (![].concat(expected).includes(response.status)) throw Error(method + ' ' + route + ' HTTP ' + response.status)
  return response.json()
}

async function approve(state) {
  const { items } = await api('/publication/catalog')
  const keys = [state.note, state.guide, ...(state.withdrawn ? [] : [String(state.spotId)])]
  const selection = items.filter(item => keys.includes(item.key))
  assert.ok(selection.length === keys.length && selection.every(item => item.eligible))
  const result = await api('/publication', 'POST', { selection: selection.map(({ kind, key, version }) => ({ kind, key, version })) }, [200, 201, 202])
  assert.match(result.id || '', /^[a-f0-9]{64}$/)
  state.jobId = result.id
  await writeFile(plan + '.next', JSON.stringify(state), { flag: 'wx' })
  await rename(plan + '.next', plan)
  return state
}

try {
  const before = await api('/publication')
  if (phase === '--status') {
    const state = JSON.parse(await readFile(plan))
    assert.equal(before.job?.id, state.jobId)
    console.log(JSON.stringify({ progress: before.job, live: before.live, jobId: state.jobId }))
  } else if (phase === '--retry') {
    const state = JSON.parse(await readFile(plan))
    assert.ok(before.job?.id === state.jobId && before.job.state === 'failed' && before.job.retryable === true)
    console.log(JSON.stringify(await api('/publication/retry', 'POST', { id: state.jobId }, 202)))
  } else if (phase === '--add') {
    assert.ok(!before.job || ['published', 'failed'].includes(before.job.state), 'EXISTING_JOB_IS_RUNNING')
    const key = Date.now().toString(36)
    const marker = 'JNQ-QUEUE-' + key.toUpperCase()
    const png = await sharp({ create: { width: 71, height: 49, channels: 3, background: '#be5035' } }).png().toBuffer()
    const upload = new FormData()
    upload.set('file', new Blob([png], { type: 'image/png' }), 'full-queue-drill.png')
    const image = (await api('/upload/r2', 'POST', upload)).items[0].url
    assert.match(image, /^\/admin-draft-media\/[a-f0-9]{64}\.png$/)
    const spot = { name: '发布演练 ' + marker, name_cn: '发布演练 ' + marker, category: 'attraction',
      latitude: 1.43, longitude: 103.65, description: '隔离发布验证 ' + marker,
      status: 'active', publication_status: 'draft', image_url: image, images: [image] }
    const created = (await api('/admin/locations', 'POST', { data: spot }, 201)).data
    assert.ok(created.id >= FIRST_SPOT_ID && created.id <= LAST_SPOT_ID)
    const { note } = await api('/admin/notes', 'POST', { slug: 'full-queue-note-' + key, title: '隔离 Note ' + marker,
      blocks: [{ id: 'drill', type: 'paragraph', content: '隔离草稿' }], published: false })
    const { guide } = await api('/admin/guides', 'POST', { slug: 'full-queue-guide-' + key, title: '隔离 Guide ' + marker })
    await api('/admin/notes', 'POST', { ...note, previousSlug: note.slug, expectedUpdatedAt: note.updatedAt, published: true,
      blocks: [{ id: 'drill', type: 'paragraph', content: marker + ' · Note' }] })
    await api('/admin/guides', 'POST', { ...guide, previousSlug: guide.slug, expectedUpdatedAt: guide.updatedAt, summary: marker + ' · Guide' })
    await api('/admin/locations', 'PATCH', { id: created.id, expectedUpdatedAt: created.updated_at,
      data: { publication_status: 'published' } })
    const unchanged = await api('/publication')
    assert.equal(unchanged.job?.id, before.job?.id)
    assert.equal(unchanged.live?.id, before.live?.id)
    console.log(JSON.stringify(await approve({ marker, spotId: created.id, note: note.slug, guide: guide.slug, image: image.split('/').at(-1), withdrawn: false })))
  } else {
    const state = JSON.parse(await readFile(plan))
    assert.ok(!state.withdrawn && before.live?.id === state.jobId && before.job?.state === 'published')
    const { data } = await api('/admin/locations?id=' + state.spotId)
    const hidden = (await api('/admin/locations', 'PATCH', { id: state.spotId, expectedUpdatedAt: data.updated_at,
      data: { publication_status: 'hidden' } })).data
    const { resumeRun, ...approved } = state
    console.log(JSON.stringify(await approve({ ...approved, firstJobId: state.jobId, withdrawn: true, withdrawalVersion: hidden.updated_at })))
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await auth.auth.signOut()
}
