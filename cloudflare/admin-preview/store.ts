import type { SupabaseClient } from '@supabase/supabase-js'
import { PRIVATE_BUCKET } from './scope.mjs'

export class AdminError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024
const writeOptions = { contentType: 'image/webp', cacheControl: '0' }
type Collection = 'notes' | 'guides' | 'spot-english' | 'location-slug-edits'

// Keep the legacy immutable snapshot and latest pointer formats. This private
// bucket belongs to this Preview only. No fallbacks or mirror writes.
export function createAdminStore(db: SupabaseClient) {
  return createScopedAdminStore(db, PRIVATE_BUCKET)
}

// Shared immutable-version protocol. Formal callers must first verify this
// separately approved bucket is private; never pass location-images here.
export function createScopedAdminStore(db: SupabaseClient, bucketName: string, verifyPrivate?: () => Promise<void>) {
  if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(bucketName) || bucketName === 'location-images' || bucketName === 'jnqjourney-img') throw new AdminError(503, '私有权威存储范围无效。')
  const bucket = db.storage.from(bucketName)

  async function download(path: string) {
    const { data, error } = await bucket.download(path, {}, { cache: 'no-store' })
    if (error || !data || data.size > MAX_SNAPSHOT_BYTES) {
      throw new AdminError(503, '无法读取权威版本，请稍后重试。')
    }
    return data.text()
  }

  async function pointer(name: Collection) {
    if (!['notes', 'guides', 'spot-english', 'location-slug-edits'].includes(name)) throw new AdminError(400, '权威集合无效。')
    const path = (await download(`_system/${name}-latest.webp`)).trim()
    const version = new RegExp(`^_system/${name}/[0-9]{13}(?:-[a-f0-9-]{36})?\\.webp$`)
    if (!version.test(path)) throw new AdminError(503, '权威版本指针无效。')
    return path
  }
  async function read<T>(name: Collection): Promise<T[]> {
    const path = await pointer(name)
    const records = JSON.parse(await download(path))
    if (!Array.isArray(records) || await pointer(name) !== path) throw new AdminError(503, '权威版本数据无效或已变化。')
    return records
  }

  async function update<T>(name: Collection, mutate: (records: T[]) => T[] | Promise<T[]>) {
    await verifyPrivate?.()
    // A lock is never stolen. An uncertain outcome can only be reconciled by
    // inspecting the pointer and releasing the lock after the invocation ends.
    const lock = `_system/${name}-write-lock.webp`
    const { error: locked } = await bucket.upload(lock, JSON.stringify({
      id: crypto.randomUUID(), createdAt: new Date().toISOString(),
    }), { ...writeOptions, upsert: false })
    if (locked) throw new AdminError(409, '存储正在保存或需核对上一笔请求，请重新读取。')
    let release = true
    try {
      const records = await mutate(await read<T>(name))
      const text = JSON.stringify(records)
      if (new TextEncoder().encode(text).length > MAX_SNAPSHOT_BYTES) {
        throw new AdminError(413, '版本文件超过后台限制。')
      }
      const version = `_system/${name}/${Date.now()}-${crypto.randomUUID()}.webp`
      const uploaded = await bucket.upload(version, text, { ...writeOptions, upsert: false })
      if (uploaded.error || await download(version) !== text) {
        throw new AdminError(503, '版本文件未通过保存校验。')
      }
      release = false
      const committed = await bucket.upload(`_system/${name}-latest.webp`, version, { ...writeOptions, upsert: true })
      if (committed.error || (await download(`_system/${name}-latest.webp`)).trim() !== version) {
        throw new AdminError(503, '版本指针提交状态待核对，请勿直接重试。')
      }
      release = true
      return records
    } finally {
      if (release) await bucket.remove([lock])
    }
  }
  return { read, update, pointer }
}
