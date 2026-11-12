import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { connectFormalReadSource, FORMAL_REF, FORMAL_STORAGE } from './formal-read-source.mjs'
import { CDN, SUPABASE } from './recovery-sources.mjs'
import { FINAL_DIR } from './recovery-media-inventory-final.mjs'

const root = path.resolve(process.env.JNQ_RECOVERY_WORKSPACE || '.')
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const json = async file => JSON.parse(await readFile(file, 'utf8'))
const storagePrefix = '/storage/v1/object/public/' + FORMAL_STORAGE + '/'

try {
  assert.deepEqual(process.argv.slice(2), ['--backup', FORMAL_REF])
  assert.ok(process.env.JNQ_RECOVERY_WORKSPACE && await realpath(root) === root)
  await json(path.join(root, 'authority-backup/manifest.json'))
  const inventory = await json(path.join(FINAL_DIR, 'inventory.private.json'))
  const r2 = inventory.records.filter(row => row.status === 'EXCLUDED_CLOSED_ONLY' && new URL(row.identity).origin === CDN)
  const storage = inventory.records.filter(row => {
    const url = new URL(row.identity)
    return url.origin === SUPABASE && url.pathname.startsWith(storagePrefix)
  })
  assert.equal(r2.length, 33, 'REVIEWED_CLOSED_MEDIA_SCOPE_CHANGED')
  assert.ok(storage.length > 0 && storage.length <= 24, 'REVIEWED_STORAGE_MEDIA_SCOPE_CHANGED')
  const directory = path.join(root, 'media-exceptions-backup')
  const restore = path.join(root, 'restore-media-exceptions')
  await mkdir(directory)
  await mkdir(restore)
  const source = await connectFormalReadSource()
  const manifest = []
  const { id, public: bucketPublic, file_size_limit, allowed_mime_types } = await source.storageConfig()
  const { external, disable_signup, mailer_autoconfirm, phone_autoconfirm } = await source.authClientConfig()
  await writeFile(path.join(directory, 'supabase-config.json'), JSON.stringify({
    bucket: { id, public: bucketPublic, file_size_limit, allowed_mime_types },
    clientAuthSettings: { external, disable_signup, mailer_autoconfirm, phone_autoconfirm },
  }), { flag: 'wx' })
  for (const [type, objects] of [['r2-closed', r2], ['storage-reviewed', storage]]) {
    for (let offset = 0; offset < objects.length; offset += 4) {
      for (const row of await Promise.all(objects.slice(offset, offset + 4).map(async item => {
        const url = new URL(item.identity)
        const key = decodeURIComponent(url.pathname.slice(type === 'r2-closed' ? 1 : storagePrefix.length))
        try {
          const image = await (type === 'r2-closed' ? source.backupR2Image(key) : source.backupStorageImage(key))
          const name = item.sha256 + '.bin'
          assert.match(name, /^[a-f0-9]{64}\.bin$/)
          await writeFile(path.join(directory, name), image.bytes, { flag: 'wx' })
          await copyFile(path.join(directory, name), path.join(restore, name))
          assert.equal(digest(await readFile(path.join(restore, name))), image.sha256, 'RESTORED_MEDIA_HASH_MISMATCH')
          return { type, key, name, status: 200, bytes: image.bytes.length, sha256: image.sha256 }
        } catch (error) {
          if (/^FORMAL_(?:R2_IMAGE|STORAGE_IMAGE)_HTTP_(?:400|404)$/.test(error.message)) {
            return { type, key, status: Number(error.message.slice(-3)) }
          }
          throw error
        }
      }))) manifest.push(row)
    }
  }
  const summary = { projectRef: FORMAL_REF, supabaseStorageBucketPublic: bucketPublic,
    clientAuthSettingsBackedUp: true, fullAuthConfiguration: false, productionWrites: 0,
    results: Object.fromEntries(['r2-closed', 'storage-reviewed'].map(type => {
      const rows = manifest.filter(row => row.type === type)
      return [type, { checked: rows.length, restored: rows.filter(row => row.status === 200).length,
        unavailable: rows.filter(row => row.status !== 200).map(row => row.status) }]
    })) }
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ ...summary, objects: manifest }, null, 2), { flag: 'wx' })
  console.log(JSON.stringify(summary))
} catch (error) {
  console.error(String(error.message).split('\n')[0])
  process.exitCode = 1
}
