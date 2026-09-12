import { createHash, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { isLocalizedTextPath } from '../localization.ts'

export const localizationPointer = '_system/i18n/en/latest.webp'
export const localizationPublicKey = 'public-data/i18n/en/records.json'
const lockKey = '_system/i18n/en/authoring-lock.webp'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

export function validateLocalizationSnapshot(snapshot) {
  if (snapshot?.schemaVersion !== 1 || snapshot.locale !== 'en' || !/^[a-zA-Z0-9-]+$/.test(snapshot.version) || !Array.isArray(snapshot.records)) throw Error('Invalid localization manifest')
  const keys = new Set()
  for (const record of snapshot.records) {
    const key = `${record.entityType}:${record.entityId}`
    if (keys.has(key) || !['spot','region','guide','page'].includes(record.entityType) || record.locale !== 'en' || typeof record.entityId !== 'string' || !['missing','partial','complete'].includes(record.translationStatus) || !/^\/(?!\/)/.test(record.canonicalPath) || record.canonicalPath.includes('..')) throw Error('Invalid localization record')
    keys.add(key)
    for (const [path, field] of Object.entries(record.fields || {})) {
      if (!isLocalizedTextPath(path) || typeof field.source !== 'string' || typeof field.text !== 'string') throw Error(`Forbidden field: ${path}`)
    }
  }
  return snapshot
}

export function createLocalizationIO() {
  const required = ['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET_NAME','R2_PUBLIC_BASE_URL']
  if (required.some(key => !process.env[key])) throw Error('Localization publishing configuration is incomplete')
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      if (url.pathname.includes('/storage/v1/object/')) url.searchParams.set('revision', randomUUID())
      return fetch(url, init)
    } },
  })
  const bucket = supabase.storage.from(process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'location-images')
  const r2 = new S3Client({ region:'auto', endpoint:`https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY} })
  return {
    async read(key) {
      const { data, error } = await bucket.download(key)
      if (error || !data) throw Error(`Authoritative localization unavailable: ${key}`)
      return Buffer.from(await data.arrayBuffer())
    },
    async write(key, bytes, upsert) {
      const { error } = await bucket.upload(key, bytes, {upsert,contentType:'image/webp',cacheControl:'0'})
      if (error) throw Error(`Localization storage write failed: ${key}`)
    },
    async lock() {
      const { error } = await bucket.upload(lockKey, Buffer.from(JSON.stringify({startedAt:new Date().toISOString()})), {upsert:false,contentType:'image/webp',cacheControl:'0'})
      if (error) throw Error('Localization publication is locked. Another editor may be publishing; a lock left by an interrupted process requires operator review.')
    },
    async unlock() {
      const { error } = await bucket.remove([lockKey])
      if (error) throw Error('Publication finished but the authoring lock could not be released')
    },
    async publish(key, bytes, immutable) {
      await r2.send(new PutObjectCommand({Bucket:process.env.R2_BUCKET_NAME,Key:key,Body:bytes,ContentType:'application/json; charset=utf-8',CacheControl:immutable?'public, max-age=31536000, immutable':'public, max-age=3600, stale-while-revalidate=86400'}))
    },
    async publicRead(version) {
      const response = await fetch(`${process.env.R2_PUBLIC_BASE_URL.replace(/\/$/,'')}/${localizationPublicKey}?version=${version}`, {cache:'no-store'})
      if (!response.ok) throw Error('Public localization read-back failed')
      return Buffer.from(await response.arrayBuffer())
    },
  }
}

export async function readAuthoritativeLocalization(io) {
  const key = (await io.read(localizationPointer)).toString().trim()
  if (!/^_system\/i18n\/en\/[a-zA-Z0-9-]+\.webp$/.test(key) || key === localizationPointer) throw Error('Invalid authoritative localization pointer')
  const bytes = await io.read(key)
  return { snapshot:validateLocalizationSnapshot(JSON.parse(bytes)), revision:hash(bytes) }
}

// Same immutable Storage -> latest pointer -> immutable/public R2 pipeline for CLI and Admin.
// Storage's create-only lock serializes all cooperating writers. No public/empty fallback on authoring reads.
export async function saveAndPublishLocalization(io, expectedRevision, update) {
  await io.lock()
  try {
    const current = await readAuthoritativeLocalization(io)
    if (current.revision !== expectedRevision) throw Error('Localization changed in another session. Reload before saving.')
    const snapshot = validateLocalizationSnapshot(await update(current.snapshot))
    const bytes = Buffer.from(JSON.stringify(snapshot, null, 2) + '\n')
    const revision = hash(bytes)
    const version = `${snapshot.version}-${revision.slice(0,16)}`
    const immutable = `_system/i18n/en/${version}.webp`
    if (revision !== current.revision) {
      try { await io.write(immutable, bytes, false) } catch { /* A verified immutable object can be reused after an interrupted attempt. */ }
      if (hash(await io.read(immutable)) !== revision) throw Error('Authoritative localization hash mismatch')
      await io.write(localizationPointer, Buffer.from(immutable), true)
    }
    // A retry can republish an already-saved version after an R2 failure.
    await io.publish(`public-data/i18n/en/versions/${version}.json`, bytes, true)
    await io.publish(localizationPublicKey, bytes, false)
    if (hash(await io.publicRead(version)) !== revision) throw Error('Saved to Storage, but public localization verification failed. Reload and retry publication.')
    return {snapshot,revision,version}
  } finally { await io.unlock() }
}
