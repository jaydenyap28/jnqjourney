import assert from 'node:assert/strict'
import { mkdtemp, rmdir, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createFormalAdminRead, FORMAL_PROJECT } from '../cloudflare/admin-preview/formal-admin-read.mjs'
import { formalReadTransport } from '../scripts/cloudflare/formal-read-source.mjs'
import { rewriteApprovedAdditionValues } from '../scripts/cloudflare/full-release-media.mjs'
import { renderedStaticMedia } from '../scripts/cloudflare/recovery-media-staging.mjs'
import { applyApprovedChanges, requireWithdrawalApproval } from '../scripts/cloudflare/full-release-rehearsal.mjs'
import { eligibleRecoverySpot, fingerprint, projectRecoveryDocuments, recoveryContentRevision } from '../scripts/cloudflare/recovery-sources.mjs'

const origin = 'https://formal-admin.example'
const editor = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
const publisher = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'
const ordinary = 'cccccccc-cccc-4ccc-cccc-cccccccccccc'
const roleKey = (ref, role) => 'header.' + Buffer.from(JSON.stringify({ ref, role })).toString('base64url') + '.signature'
const request = (route, id, method = 'GET', from = origin) => new Request(origin + route, {
  method, headers: { Origin: from, ...(id ? { Authorization: 'Bearer ' + id } : {}) },
})

test('production editor and publication capabilities use only verified user identity', async () => {
  const calls = []
  const handler = createFormalAdminRead({ projectRef: FORMAL_PROJECT, origin, editors: [editor], publishers: [publisher],
    getIdentity: async token => [editor, publisher, ordinary].includes(token) ? token : null,
    load: async (route, query) => { calls.push([route, query]); return { data: [] } },
  })
  assert.equal((await handler(request('/admin/locations', null))).status, 401)
  assert.equal((await handler(request('/admin/locations', ordinary))).status, 403)
  assert.equal((await handler(request('/admin/locations', editor, 'GET', 'https://other.example'))).status, 403)
  assert.equal((await handler(request('/admin/locations', 'forged'))).status, 401)
  assert.equal((await handler(request('/admin/locations', publisher, 'PATCH'))).status, 405)
  assert.equal((await handler(request('/publication', publisher, 'POST'))).status, 405)
  assert.deepEqual(calls, [])
  assert.deepEqual(await (await handler(request('/session', editor))).json(), { authorized: true, canEdit: true, canPublish: false, writesEnabled: false })
  assert.deepEqual(await (await handler(request('/session', publisher))).json(), { authorized: true, canEdit: false, canPublish: true, writesEnabled: false })
  const result = await handler(request('/admin/locations?id=582', editor))
  assert.equal(result.status, 200)
  assert.match(result.headers.get('cache-control'), /no-store/)
  assert.deepEqual(calls, [['/admin/locations', { id: 582, slug: null }]])
})

test('formal source is authenticated, non-redirecting and rejects isolated or arbitrary resources', async () => {
  assert.throws(() => formalReadTransport({ key: roleKey('rnamstwwbzknwbjwdgrf', 'service_role'), token: 'example' }), /FORMAL_PROJECT/)
  assert.throws(() => formalReadTransport({ key: roleKey(FORMAL_PROJECT, 'anon'), token: 'example' }), /FORMAL_PROJECT/)
  const seen = []
  const source = formalReadTransport({ key: roleKey(FORMAL_PROJECT, 'service_role'), token: 'example',
    fetcher: async (url, options) => { seen.push({ url: String(url), ...options }); return new Response('[]') },
  })
  assert.throws(() => source.database('https://wrong.example/rest/v1/locations'), /READ_SCOPE/)
  assert.throws(() => source.database('/rest/v1/rpc/anything'), /READ_SCOPE/)
  assert.throws(() => source.storage('_system/notes/../guides-latest.webp'), /STORAGE_SCOPE/)
  assert.throws(() => source.feed('../private.json'), /R2_FEED_SCOPE/)
  assert.deepEqual(seen, [])
  await source.database('/rest/v1/locations?select=id')
  await source.storage('_system/notes-latest.webp')
  await source.feed('i18n/en/records.json')
  assert.ok(seen.every(call => call.method === 'GET' && call.redirect === 'error'))
  assert.match(seen[1].url, /\/object\/authenticated\//)
  assert.match(seen[2].url, /^https:\/\/api\.cloudflare\.com\//)
  assert.equal(seen[2].headers.apikey, undefined)
})

test('operator lookup requires an exact confirmed email or UUID in the formal Auth API', async () => {
  const confirmed = { id: editor, email: 'owner@example.test', role: 'authenticated', email_confirmed_at: '2026-01-01' }
  const similar = { ...confirmed, id: ordinary, email: 'other-owner@example.test' }
  const requests = []
  const source = formalReadTransport({ key: roleKey(FORMAL_PROJECT, 'service_role'), token: 'example',
    fetcher: async (url, options) => {
      requests.push({ url: String(url), method: options.method })
      return Response.json(String(url).endsWith('/' + editor) ? confirmed : { users: [similar, confirmed] })
    },
  })
  assert.equal(await source.confirmedOperator('OWNER@example.test'), editor)
  assert.equal(await source.confirmedOperator(editor), editor)
  await assert.rejects(source.confirmedOperator('missing@example.test'), /FORMAL_OPERATOR_NOT_ACTIVE/)
  assert.ok(requests.every(request => request.url.startsWith(`https://${FORMAL_PROJECT}.supabase.co/auth/v1/admin/users`) &&
    request.method === 'GET'))
})

test('withdrawal and edits change the content revision; capture time alone does not', () => {
  const visible = { id: 582, status: 'active', publication_status: null, name: 'Realistic fixture' }
  const withdrawn = { ...visible, status: 'temporarily_closed' }
  const hidden = { ...visible, publication_status: 'hidden' }
  assert.equal(eligibleRecoverySpot(visible), true)
  assert.equal(eligibleRecoverySpot(withdrawn), false)
  assert.equal(eligibleRecoverySpot(hidden), false)
  const note = { slug: 'ready', title: 'Note', published: true }
  const guide = { slug: 'ready', title: 'Guide' }
  const project = projectRecoveryDocuments([note, { ...note, published: false }], [guide, { ...guide, publication_status: 'draft' }])
  assert.deepEqual(project, { publishedNotes: [note], publicGuides: [guide] })
  const feeds = (capturedAt, locations) => ({ 'database.json': { capturedAt, locations }, 'notes.json': project })
  const expected = recoveryContentRevision(feeds('before', [visible]))
  assert.equal(recoveryContentRevision(feeds('after', [visible])), expected)
  assert.notEqual(recoveryContentRevision(feeds('after', [])), expected)
  assert.notEqual(recoveryContentRevision(feeds('after', [{ ...visible, name: 'Edited' }])), expected)
})

test('only reviewed content-addressed additions are rewritten, including image metadata keys', () => {
  const approved = 'a'.repeat(64) + '.png'
  const draft = 'b'.repeat(64) + '.png'
  const media = new Map([[approved, { path: '/media/static/' + approved }]])
  const old = '/admin-draft-media/' + approved
  const pending = '/admin-draft-media/' + draft
  assert.deepEqual(rewriteApprovedAdditionValues({ cover: old + '#focus=1,2', draft: pending, metadata: { [old]: 7 } }, media),
    { cover: '/media/static/' + approved + '#focus=1,2', draft: pending, metadata: { ['/media/static/' + approved]: 7 } })
})

test('media staging links only assets referenced by the rendered export', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jnq-rendered-media-'))
  const html = path.join(directory, 'index.html')
  const json = path.join(directory, 'home.json')
  const shared = 'a'.repeat(64) + '.png'
  const visible = 'b'.repeat(64) + '.webp'
  try {
    await writeFile(html, `<img src="/media/static/${shared}">`)
    await writeFile(json, JSON.stringify({ shared: '/media/static/' + shared, visible: '/media/static/' + visible }))
    assert.deepEqual([...await renderedStaticMedia(directory)].sort(), [shared, visible])
  } finally {
    await unlink(html)
    await unlink(json)
    await rmdir(directory)
  }
})

test('partial approvals apply to the full baseline and stale rows cannot be replaced', () => {
  const spot = { id: 1, description: 'old' }
  const baseline = { 'database.json': { locations: [spot, { id: 2 }] },
    'notes.json': { notes: [{ slug: 'one' }] }, 'guides.json': { guides: [{ slug: 'other' }] } }
  const change = { kind: 'spot', key: 1, expected: fingerprint(spot), value: { ...spot, description: 'approved' } }
  const result = applyApprovedChanges(baseline, [change])
  assert.deepEqual(result['database.json'].locations, [change.value, { id: 2 }])
  assert.deepEqual(result['notes.json'], baseline['notes.json'])
  assert.deepEqual(result['guides.json'], baseline['guides.json'])
  assert.throws(() => applyApprovedChanges(result, [change]), /APPROVED_RECORD_VERSION_CHANGED/)
  assert.throws(() => applyApprovedChanges(baseline, [{ ...change, value: { id: 3 } }]), /APPROVAL_CANNOT_CHANGE_IDENTITY/)
})

test('missing public identities require an approval for the exact deletion set', () => {
  const baseline = { 'database.json': { locations: [{ id: 1 }, { id: 2 }] },
    'notes.json': { notes: [{ slug: 'old' }] }, 'guides.json': { guides: [{ slug: 'same' }] } }
  const result = structuredClone(baseline)
  result['database.json'].locations.pop()
  result['notes.json'].notes.pop()
  const expected = { spot: [2], note: ['old'], guide: [] }
  assert.throws(() => requireWithdrawalApproval(baseline, result), /EXPLICIT_WITHDRAWAL_DIFF_APPROVAL_REQUIRED/)
  assert.throws(() => requireWithdrawalApproval(baseline, result, fingerprint({ ...expected, note: [] })), /EXPLICIT_WITHDRAWAL/)
  assert.deepEqual(requireWithdrawalApproval(baseline, result, fingerprint(expected)).removed, expected)
})
