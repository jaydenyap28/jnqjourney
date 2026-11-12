import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { fingerprint, recoveryContentRevision } from './recovery-sources.mjs'

export const rehearsalTarget = {
  spot: { id: 636, route: '/spot/turtle-alley-636' },
  note: { id: 'malaysia-turtle-night-terengganu', route: '/notes/malaysia-turtle-night-terengganu' },
  guide: { id: 'malaysia-langkawi-5d4n', route: '/guide/malaysia-langkawi-5d4n' },
}
const sha = value => createHash('sha256').update(value).digest('hex')
const json = file => readFile(file, 'utf8').then(JSON.parse)
const runId = /^[a-z0-9][a-z0-9-]{2,60}$/
const drillId = /^[a-z0-9][a-z0-9-]{2,24}$/
const select = {
  spot: feeds => feeds['database.json'].locations,
  note: feeds => feeds['notes.json'].notes,
  guide: feeds => feeds['guides.json'].guides,
}
const identity = (kind, row) => kind === 'spot' ? row.id : row.slug

export function publicIdentityDelta(before, after) {
  const added = {}, removed = {}
  for (const [kind, records] of Object.entries(select)) {
    const from = records(before).map(row => identity(kind, row))
    const to = records(after).map(row => identity(kind, row))
    const old = new Set(from), next = new Set(to)
    assert.equal(old.size, from.length, 'DUPLICATE_BASELINE_IDENTITY')
    assert.equal(next.size, to.length, 'DUPLICATE_RELEASE_IDENTITY')
    removed[kind] = from.filter(key => !next.has(key)).sort()
    added[kind] = to.filter(key => !old.has(key)).sort()
  }
  return { added, removed }
}

export function requireWithdrawalApproval(before, after, approvedRemovalDigest) {
  const delta = publicIdentityDelta(before, after)
  if (Object.values(delta.removed).some(list => list.length)) {
    assert.equal(approvedRemovalDigest, fingerprint(delta.removed), 'EXPLICIT_WITHDRAWAL_DIFF_APPROVAL_REQUIRED')
  }
  return delta
}

export function applyApprovedChanges(baseline, changes) {
  const result = structuredClone(baseline)
  const seen = new Set()
  for (const { kind, key, expected, value } of changes) {
    assert.ok(Object.hasOwn(select, kind))
    assert.ok(!seen.has(kind + ':' + key), 'DUPLICATE_APPROVED_CHANGE')
    seen.add(kind + ':' + key)
    const rows = select[kind](result)
    const index = rows.findIndex(row => identity(kind, row) === key)
    assert.ok(index >= 0 && fingerprint(rows[index]) === expected, 'APPROVED_RECORD_VERSION_CHANGED')
    assert.equal(identity(kind, value), key, 'APPROVAL_CANNOT_CHANGE_IDENTITY')
    rows[index] = structuredClone(value)
  }
  requireWithdrawalApproval(baseline, result)
  return result
}

function changedRecords(feeds, marker, asset) {
  return Object.entries(rehearsalTarget).map(([kind, { id }]) => {
    const original = select[kind](feeds).find(row => identity(kind, row) === id)
    assert.ok(original, 'REHEARSAL_TARGET_MISSING')
    const value = structuredClone(original)
    if (kind === 'spot') value.description = `${value.description}\n\n${marker} · Spot 展示文案验证。`
    if (kind === 'note') {
      assert.equal(value.published, true)
      const index = value.blocks.findIndex(item => item.type === 'paragraph' && item.content)
      assert.ok(index >= 0, 'REHEARSAL_NOTE_PARAGRAPH_MISSING')
      value.blocks[index].content += `\n\n${marker} · Note 段落验证。`
      value.blocks.splice(index + 1, 0, {
        id: 'full-release-rehearsal-image', type: 'image', imageUrl: '/admin-draft-media/' + asset,
        alt: '全站发布演练生成的测试图',
      })
    }
    if (kind === 'guide') {
      assert.ok(value.summary, 'REHEARSAL_GUIDE_SUMMARY_MISSING')
      value.summary += ` ${marker} · Guide 摘要验证。`
    }
    return { kind, key: id, expected: fingerprint(original), value }
  })
}

export async function loadReleaseSnapshot(directory) {
  const manifest = await json(path.join(directory, 'source-manifest.json'))
  const feeds = {}
  for (const [name, item] of Object.entries(manifest.files)) {
    assert.match(name, /^[a-z-]+\.json$/)
    const bytes = await readFile(path.join(directory, 'sources', name))
    assert.ok(bytes.length === item.bytes && sha(bytes) === item.sha256, 'CAPTURE_FILE_DIGEST_MISMATCH')
    feeds[name] = JSON.parse(bytes)
  }
  assert.equal(recoveryContentRevision(feeds), manifest.contentRevision, 'APPROVED_CONTENT_REVISION_MISMATCH')
  return { manifest, feeds }
}

async function baseline(workspace, name) {
  assert.match(name, runId)
  const directory = path.join(workspace, 'runs', name)
  const { manifest, feeds } = await loadReleaseSnapshot(directory)
  const receipt = await json(path.join(directory, 'deployment.json'))
  assert.equal(manifest.readMode, 'authenticated-server')
  assert.ok(receipt.success && receipt.environment === 'preview' && receipt.revision === manifest.contentRevision,
    'REHEARSAL_REQUIRES_VERIFIED_FORMAL_BASELINE')
  return { directory, manifest, feeds }
}

async function makeTestImage() {
  const width = 96, height = 64
  const pixels = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 3
    const dark = (Math.floor(x / 12) + Math.floor(y / 8)) % 2 === 0
    pixels.set(dark ? [15, 51, 70] : [246, 205, 110], offset)
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer()
}

export async function prepareRehearsal({ workspace, directory, baseRun, phase, id }) {
  assert.match(id, drillId)
  assert.ok(['changed', 'reverted'].includes(phase))
  assert.equal(path.basename(directory), `drill-${id}-${phase}`)
  const base = await baseline(workspace, baseRun)
  const marker = 'JNQ-REHEARSAL-' + id.toUpperCase()
  const bytes = await makeTestImage()
  const image = sha(bytes) + '.png'
  const rehearsed = applyApprovedChanges(base.feeds, changedRecords(base.feeds, marker, image))
  const rehearsal = { baseRun, id, phase, marker, image, baselineRevision: base.manifest.contentRevision }
  if (phase === 'reverted') {
    const previous = await json(path.join(workspace, 'runs', `drill-${id}-changed`, 'deployment.json'))
    assert.ok(previous.success && previous.environment === 'preview' &&
      previous.revision === recoveryContentRevision(rehearsed) && previous.branch === 'full-drill-' + id,
      'REVERT_REQUIRES_VERIFIED_CHANGED_PREVIEW')
  }
  const feeds = phase === 'changed' ? rehearsed : base.feeds
  const manifest = { ...base.manifest, readMode: 'isolated-rehearsal', rehearsal, productionWrites: 0,
    contentRevision: recoveryContentRevision(feeds), files: {} }
  await mkdir(directory, { recursive: true })
  assert.equal((await readdir(directory)).length, 0, 'REHEARSAL_DIRECTORY_ALREADY_USED')
  await mkdir(path.join(directory, 'sources'))
  for (const [name, payload] of Object.entries(feeds)) {
    const file = Buffer.from(JSON.stringify(payload))
    manifest.files[name] = { sha256: sha(file), bytes: file.length }
    await writeFile(path.join(directory, 'sources', name), file, { flag: 'wx' })
  }
  if (phase === 'changed') {
    await mkdir(path.join(directory, 'approved-incremental-media'))
    await writeFile(path.join(directory, 'approved-incremental-media', image), bytes, { flag: 'wx' })
    await writeFile(path.join(directory, 'media-additions.json'), JSON.stringify({
      contentRevision: manifest.contentRevision,
      images: [{ name: image, bytes: bytes.length, rightsEvidence: 'Original generated checkerboard for the requested rehearsal', approvedBy: 'Rehearsal scope' }],
    }), { flag: 'wx' })
  }
  await writeFile(path.join(directory, 'source-manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' })
  return { phase, revision: manifest.contentRevision, productionWrites: 0, delta: publicIdentityDelta(base.feeds, feeds) }
}

export async function verifyRehearsal(workspace, directory, manifest, feeds) {
  const { baseRun, id, phase, marker, image, baselineRevision } = manifest.rehearsal
  assert.match(id, drillId)
  assert.equal(marker, 'JNQ-REHEARSAL-' + id.toUpperCase())
  assert.match(image, /^[a-f0-9]{64}\.png$/)
  assert.ok(['changed', 'reverted'].includes(phase))
  assert.equal(path.basename(directory), `drill-${id}-${phase}`)
  const base = await baseline(workspace, baseRun)
  assert.equal(base.manifest.contentRevision, baselineRevision)
  const asset = await makeTestImage()
  assert.equal(sha(asset) + '.png', image)
  const expected = phase === 'changed' ? applyApprovedChanges(base.feeds, changedRecords(base.feeds, marker, image)) : base.feeds
  assert.deepEqual(feeds, expected, 'REHEARSAL_CHANGED_MORE_THAN_APPROVED_RECORDS')
  requireWithdrawalApproval(base.feeds, feeds)
  return { authority: base.directory, branch: 'full-drill-' + id }
}
