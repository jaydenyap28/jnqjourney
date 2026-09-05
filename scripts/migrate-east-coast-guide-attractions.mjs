import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'
import env from '@next/env'
import { EAST_COAST_SLUG, planEastCoastMigration, validateEastCoastCanonical } from '../lib/east-coast-guide-migration.ts'

env.loadEnvConfig(process.cwd())
const required = key => { if (!process.env[key]) throw new Error(`Missing ${key}`); return process.env[key] }
const sha = value => createHash('sha256').update(value).digest('hex')
const hash = value => sha(JSON.stringify(value))
const sb = createClient(required('NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
const bucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'location-images'
const pointer = '_system/guides-latest.webp'
const r2 = new S3Client({ region: 'auto', endpoint: `https://${required('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`, credentials: { accessKeyId: required('R2_ACCESS_KEY_ID'), secretAccessKey: required('R2_SECRET_ACCESS_KEY') } })
const r2Key = { Bucket: required('R2_BUCKET_NAME'), Key: 'public-data/guides.json' }
async function download(key) {
  const result = await sb.storage.from(bucket).download(key, { cacheNonce: `${Date.now()}-${Math.random()}` })
  if (result.error || !result.data) throw new Error(result.error?.message || `Missing ${key}`)
  return Buffer.from(await result.data.arrayBuffer())
}
async function upload(key, body, upsert) {
  const result = await sb.storage.from(bucket).upload(key, body, { upsert, contentType: 'image/webp', cacheControl: '0' })
  if (result.error) throw new Error(result.error.message)
}
const currentVersion = (await download(pointer)).toString().trim()
const resumeArg = process.argv.find(a => a.startsWith('--resume='))?.slice('--resume='.length)
let resume
if (resumeArg) {
  if (!process.argv.includes('--apply')) throw new Error('Resume requires --apply')
  const directory = path.resolve(resumeArg)
  if (!directory.startsWith(path.resolve('artifacts/east-coast-migration') + path.sep)) throw new Error('Resume must use an existing migration backup directory')
  resume = { directory, diff: JSON.parse(await readFile(path.join(directory, 'diff.json'), 'utf8')) }
}
const previousVersion = resume ? resume.diff.previousVersion : currentVersion
const beforeBytes = resume ? await readFile(path.join(resume.directory, 'authoritative-before.json')) : await download(previousVersion)
if (resume && sha(beforeBytes) !== resume.diff.authoritativeBeforeSha256) throw new Error('Resume backup hash mismatch')
const guides = JSON.parse(beforeBytes.toString())
if (!Array.isArray(guides) || guides.length !== 6) throw new Error('Expected six authoritative Guides')
const matches = guides.filter(g => g.slug === EAST_COAST_SLUG)
if (matches.length !== 1) throw new Error('Expected unique East Coast Guide')
const before = matches[0]
const locations = await sb.from('locations').select('id,name,name_cn,status').eq('status', 'active').order('id').range(0, 999)
if (locations.error) throw new Error(locations.error.message)
const plan = planEastCoastMigration(before, locations.data)
const nextGuides = guides.map(g => g.slug === EAST_COAST_SLUG ? plan.after : g)
const unchangedGuides = guides.filter(g => g.slug !== EAST_COAST_SLUG).map(g => ({ slug: g.slug, before: hash(g), after: hash(nextGuides.filter(n => n.slug === g.slug)[0]) }))
if (unchangedGuides.some(g => g.before !== g.after)) throw new Error('Another Guide changed')
const nextBytes = Buffer.from(JSON.stringify(nextGuides, null, 2) + '\n')
if (resume && (sha(nextBytes) !== resume.diff.proposedSha256 || sha(await download(currentVersion)) !== sha(nextBytes))) throw new Error('Resume latest is not the exact approved migration; stopping')
const r2Before = Buffer.from(await (await r2.send(new GetObjectCommand(r2Key))).Body.transformToByteArray())
const outDir = `artifacts/east-coast-migration/${Date.now()}`
await mkdir(outDir, { recursive: true })
await writeFile(`${outDir}/authoritative-before.json`, beforeBytes)
await writeFile(`${outDir}/r2-before.json`, r2Before)
await writeFile(`${outDir}/authoritative-proposed.json`, nextBytes)
const summary = { apply: process.argv.includes('--apply'), previousVersion, authoritativeBeforeSha256: sha(beforeBytes), r2BeforeSha256: sha(r2Before), validation: plan.validation, exactDiff: plan.exactDiff, unchangedGuides, proposedSha256: sha(nextBytes), outDir }
await writeFile(`${outDir}/diff.json`, JSON.stringify(summary, null, 2))
console.log(JSON.stringify({ ...summary, exactDiff: `${outDir}/diff.json` }, null, 2))
if (!summary.apply) process.exit(0)
// A fresh pointer and object comparison prevents publishing from a stale plan.
if ((await download(pointer)).toString().trim() !== currentVersion || sha(await download(previousVersion)) !== sha(beforeBytes)) throw new Error('Concurrent authoritative change; stopping')
const version = resume ? currentVersion : `_system/guides/${Date.now()}.webp`
if (!resume) {
  await upload(version, nextBytes, false)
  if (sha(await download(version)) !== sha(nextBytes)) throw new Error('Immutable version read-back mismatch')
  await upload(pointer, Buffer.from(version), true)
}
// Publish only the latest immutable object read back from authoritative Storage.
if ((await download(pointer)).toString().trim() !== version) throw new Error('Latest pointer changed')
const authoritativeBytes = await download(version)
const publishedGuides = JSON.parse(authoritativeBytes.toString())
validateEastCoastCanonical(publishedGuides.filter(g => g.slug === EAST_COAST_SLUG)[0])
if (sha(authoritativeBytes) !== sha(nextBytes)) throw new Error('Authoritative publish source changed')
await upload('_system/guides.webp', authoritativeBytes, true)
const snapshot = Buffer.from(JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), guides: publishedGuides }))
await r2.send(new PutObjectCommand({ ...r2Key, Body: snapshot, ContentType: 'application/json; charset=utf-8', CacheControl: 'public, max-age=3600, stale-while-revalidate=86400' }))
const r2After = Buffer.from(await (await r2.send(new GetObjectCommand(r2Key))).Body.transformToByteArray())
if (sha(r2After) !== sha(snapshot)) throw new Error('R2 read-back mismatch')
const result = { version, authoritativeSha256: sha(authoritativeBytes), r2SnapshotSha256: sha(r2After), validation: plan.validation, unchangedGuides, outDir }
await writeFile(`${outDir}/result.json`, JSON.stringify(result, null, 2))
console.log(JSON.stringify(result, null, 2))
