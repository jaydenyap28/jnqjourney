import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { RECOVERY } from './recovery-sources.mjs'

const namePattern = /^[a-f0-9]{64}\.(?:png|jpg|webp|gif)$/
const draftReference = /\/admin-draft-media\/([a-f0-9]{64}\.(?:png|jpg|webp|gif))(?![a-z0-9/])/g

// Each delta is an explicit decision for one exact private authority snapshot.
// The approval and bytes stay local and outside the deploy directory.
export async function readApprovedAdditions() {
  if (!process.env.JNQ_RECOVERY_VERIFIED_MEDIA) return new Map()
  const raw = await readFile(path.join(RECOVERY, 'media-additions.json'), 'utf8').catch(error => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (raw === null) return new Map()
  const approval = JSON.parse(raw)
  const authority = JSON.parse(await readFile(path.join(RECOVERY, 'source-manifest.json'), 'utf8'))
  assert.equal(approval.contentRevision, authority.contentRevision, 'INCREMENTAL_MEDIA_AUTHORITY_CHANGED')
  assert.match(approval.contentRevision, /^[a-f0-9]{64}$/)
  assert.ok(Array.isArray(approval.images) && approval.images.length <= 200, 'INCREMENTAL_MEDIA_COUNT_LIMIT')
  const additions = new Map()
  for (const row of approval.images) {
    assert.match(row.name || '', namePattern, 'INCREMENTAL_MEDIA_NAME')
    assert.ok(!additions.has(row.name) && Number.isSafeInteger(row.bytes) && row.bytes > 0 && row.bytes <= 10 * 1024 ** 2)
    assert.ok(typeof row.rightsEvidence === 'string' && row.rightsEvidence.trim() &&
      typeof row.approvedBy === 'string' && row.approvedBy.trim(), 'INCREMENTAL_MEDIA_APPROVAL_REQUIRED')
    additions.set(row.name, { disposition: 'static-copy', approvedBytesSha256: row.name.split('.')[0],
      path: '/media/static/' + row.name, bytes: row.bytes })
  }
  return additions
}

export function rewriteApprovedAdditions(text, additions) {
  return text.replace(draftReference, (reference, name) => additions.get(name)?.path || reference)
}

export function rewriteApprovedAdditionValues(value, additions) {
  if (typeof value === 'string') return rewriteApprovedAdditions(value, additions)
  if (Array.isArray(value)) return value.map(item => rewriteApprovedAdditionValues(item, additions))
  if (!value || typeof value !== 'object') return value
  const entries = new Map()
  for (const [key, item] of Object.entries(value)) {
    const target = rewriteApprovedAdditions(key, additions)
    const payload = rewriteApprovedAdditionValues(item, additions)
    if (entries.has(target)) assert.deepEqual(entries.get(target), payload, 'INCREMENTAL_IMAGE_METADATA_COLLISION')
    entries.set(target, payload)
  }
  return Object.fromEntries(entries)
}
