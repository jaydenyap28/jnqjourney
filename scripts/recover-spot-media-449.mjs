import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'
import env from '@next/env'
import { buildMediaRecovery, MEDIA_SELECT, sha256, semanticHash, validate449Pilot } from './lib/spot-media-recovery.mjs'

env.loadEnvConfig(process.cwd())
const required = key => { if (!process.env[key]) throw new Error(`Missing ${key}`); return process.env[key] }
const r2 = new S3Client({ region: 'auto', maxAttempts: 1, endpoint: `https://${required('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`, credentials: { accessKeyId: required('R2_ACCESS_KEY_ID'), secretAccessKey: required('R2_SECRET_ACCESS_KEY') } })
const key = { Bucket: required('R2_BUCKET_NAME'), Key: 'public-data/spots/spot-449.json' }
const db = createClient(required('NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
const argument = name => process.argv.filter(value => value.startsWith(`--${name}=`)).map(value => value.slice(name.length + 3))[0]
const root = path.resolve('artifacts/spot-media-recovery-449')
const applyDirectory = argument('apply')
const approvedSha256 = argument('approved-sha256')
if (process.argv.slice(2).some(value => !value.startsWith('--apply=') && !value.startsWith('--approved-sha256='))) throw new Error('Only the Spot 449 pilot is supported; no bulk mode')
if (Boolean(applyDirectory) !== Boolean(approvedSha256)) throw new Error('Apply requires a reviewed directory and --approved-sha256')

async function authoritative() {
  const { data, error } = await db.from('locations').select(MEDIA_SELECT).eq('id', 449).eq('status', 'active').single()
  if (error || !data) throw new Error(error?.message || 'Active authoritative Spot 449 missing')
  return data
}
async function object() {
  const response = await r2.send(new GetObjectCommand(key))
  return { bytes: Buffer.from(await response.Body.transformToByteArray()), etag: response.ETag, contentType: response.ContentType, cacheControl: response.CacheControl, metadata: response.Metadata }
}
async function otherObjects() {
  const objects = []
  let token
  do {
    const result = await r2.send(new ListObjectsV2Command({ Bucket: key.Bucket, Prefix: 'public-data/', ContinuationToken: token }))
    for (const item of result.Contents || []) if (item.Key !== key.Key) objects.push({ key: item.Key, etag: item.ETag, size: item.Size })
    token = result.IsTruncated ? result.NextContinuationToken : undefined
  } while (token)
  return objects.sort((a, b) => a.key.localeCompare(b.key))
}
async function publicBaseline() {
  const records = []
  for (const endpoint of ['/api/locations', '/api/guides']) {
    const response = await fetch(`https://www.jnqjourney.com${endpoint}`, { signal: AbortSignal.timeout(30000) })
    if (!response.ok) throw new Error(`Baseline ${endpoint} returned ${response.status}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    const body = JSON.parse(bytes.toString())
    const rows = Array.isArray(body) ? body : body.locations || body.guides
    records.push({ endpoint, bytes: bytes.length, sha256: sha256(bytes), count: rows?.length, hasGalleryFields: rows?.some(row => 'images' in row || 'gallery' in row) })
  }
  return records
}
const json = value => `${JSON.stringify(value, null, 2)}\n`
async function save(directory, name, value) {
  await writeFile(path.join(directory, name), typeof value === 'string' || Buffer.isBuffer(value) ? value : json(value), { flag: 'wx' })
}

if (!applyDirectory) {
  const [before, row, others, baseline] = await Promise.all([object(), authoritative(), otherObjects(), publicBaseline()])
  const current = JSON.parse(before.bytes.toString())
  const { candidate } = buildMediaRecovery(current, row, new Date().toISOString())
  const validation = validate449Pilot(current, row, candidate)
  const bytes = Buffer.from(`${JSON.stringify(candidate)}\n`)
  const directory = path.join(root, String(Date.now()))
  await mkdir(directory, { recursive: true })
  await save(directory, 'r2-before.json', before.bytes)
  await save(directory, 'authoritative-media.json', row)
  await save(directory, 'candidate.json', bytes)
  await save(directory, 'other-public-objects.json', others)
  const report = { directory, objectKey: key.Key, beforeSha256: sha256(before.bytes), beforeEtag: before.etag, beforeHeaders: { contentType: before.contentType, cacheControl: before.cacheControl, metadata: before.metadata }, beforeSource: current.source, beforeGalleryCount: current.spot.images.length, authoritativeRowSha256: semanticHash(row), candidateSha256: sha256(bytes), baseline, otherObjectsSha256: semanticHash(others), validation }
  await save(directory, 'diff.json', report)
  console.log(json(report))
} else {
  const directory = path.resolve(applyDirectory)
  if (!directory.startsWith(root + path.sep)) throw new Error('Apply directory must be a prepared Spot 449 backup')
  const report = JSON.parse(await readFile(path.join(directory, 'diff.json'), 'utf8'))
  const backup = await readFile(path.join(directory, 'r2-before.json'))
  const candidateBytes = await readFile(path.join(directory, 'candidate.json'))
  if (sha256(backup) !== report.beforeSha256 || sha256(candidateBytes) !== approvedSha256 || report.candidateSha256 !== approvedSha256) throw new Error('Reviewed backup/candidate hash mismatch')
  const [fresh, row, others] = await Promise.all([object(), authoritative(), otherObjects()])
  if (sha256(fresh.bytes) === approvedSha256) throw new Error('Candidate already published; do not repeat recovery. Read back/verify only.')
  if (sha256(fresh.bytes) !== report.beforeSha256 || fresh.etag !== report.beforeEtag) throw new Error('R2 changed since review; stop without overwriting')
  if (semanticHash(row) !== report.authoritativeRowSha256 || semanticHash(others) !== report.otherObjectsSha256) throw new Error('Authoritative media or another public snapshot changed since review')
  const validation = validate449Pilot(JSON.parse(backup.toString()), row, JSON.parse(candidateBytes.toString()))
  // Exactly one permitted remote mutation, conditionally replacing the reviewed ETag.
  // No Storage writes, other snapshots, index writes, automatic retry or revalidation.
  await r2.send(new PutObjectCommand({ ...key, Body: candidateBytes, IfMatch: fresh.etag, ContentType: 'application/json; charset=utf-8', CacheControl: 'public, max-age=3600, stale-while-revalidate=86400', Metadata: fresh.metadata }))
  const after = await object()
  if (sha256(after.bytes) !== approvedSha256) throw new Error('R2 read-back mismatch; preserve backup and stop, no blind retry')
  validate449Pilot(JSON.parse(backup.toString()), row, JSON.parse(after.bytes.toString()))
  const afterOthers = await otherObjects()
  if (semanticHash(afterOthers) !== report.otherObjectsSha256) throw new Error('Another public snapshot changed; investigate before proceeding')
  const result = { objectKey: key.Key, beforeSha256: report.beforeSha256, afterSha256: sha256(after.bytes), afterEtag: after.etag, validation, otherPublicObjectsUnchanged: true, supabaseWrites: 0, r2Writes: 1, revalidated: false }
  await save(directory, 'r2-after.json', after.bytes)
  await save(directory, 'result.json', result)
  console.log(json(result))
}
