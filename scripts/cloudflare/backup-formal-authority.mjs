import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { authorityKey, connectFormalReadSource, FORMAL_REF } from './formal-read-source.mjs'

const root = path.resolve(process.env.JNQ_RECOVERY_WORKSPACE || '.')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const backup = path.join(root, 'authority-backup')
const restored = path.join(root, 'restore-authority')
const files = {}
let total = 0

async function save(name, bytes) {
  const file = path.join(backup, name)
  total += bytes.length
  assert.ok(total <= 512 * 1024 * 1024, 'AUTHORITY_BACKUP_BYTE_LIMIT')
  assert.ok(!Object.hasOwn(files, name), 'DUPLICATE_AUTHORITY_BACKUP_NAME')
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, bytes, { flag: 'wx' })
  files[name] = { bytes: bytes.length, sha256: sha(bytes) }
}

async function collectionKeys(source, name) {
  const keys = []
  for (let offset = 0; offset < 500; offset += 100) {
    const page = await source.listAuthority(name, offset)
    assert.ok(Array.isArray(page) && page.length <= 100)
    for (const item of page) {
      const key = '_system/' + name + '/' + item.name
      assert.ok(authorityKey.test(key) && !keys.includes(key), 'UNKNOWN_AUTHORITY_HISTORY_ENTRY')
      keys.push(key)
    }
    if (page.length < 100) return keys
  }
  throw Error('AUTHORITY_HISTORY_LIMIT_REVIEW_REQUIRED')
}

try {
  assert.deepEqual(process.argv.slice(2), ['--backup', FORMAL_REF])
  assert.ok(process.env.JNQ_RECOVERY_WORKSPACE && await realpath(root) === root)
  // The operator creates this owner-only directory before any formal bytes are read.
  await readFile(path.join(root, 'static-backup-result.json'))
  const source = await connectFormalReadSource()
  await mkdir(backup)
  const pointers = {}
  for (const name of ['notes', 'guides']) {
    const pointer = '_system/' + name + '-latest.webp'
    const before = await source.storage(pointer)
    const target = before.bytes.toString().trim()
    assert.ok(authorityKey.test(target) && target.startsWith('_system/' + name + '/'), 'AUTHORITY_POINTER_INVALID')
    const keys = await collectionKeys(source, name)
    assert.ok(keys.includes(target), 'CURRENT_VERSION_NOT_LISTED')
    await save('supabase-storage/' + pointer, before.bytes)
    for (let offset = 0; offset < keys.length; offset += 4) {
      const group = keys.slice(offset, offset + 4)
      const reads = await Promise.all(group.map(key => source.storage(key)))
      for (const [index, item] of reads.entries()) await save('supabase-storage/' + group[index], item.bytes)
    }
    assert.equal((await source.storage(pointer)).sha256, before.sha256, 'POINTER_CHANGED_DURING_BACKUP')
    assert.deepEqual(await collectionKeys(source, name), keys, 'VERSION_LIST_CHANGED_DURING_BACKUP')
    assert.equal((await source.storage(target)).sha256, files['supabase-storage/' + target].sha256, 'CURRENT_BYTES_CHANGED_DURING_BACKUP')
    pointers[name] = { versions: keys.length, target, pointer }
  }
  await save('supabase-storage/_system/location-slugs.webp', (await source.storage('_system/location-slugs.webp')).bytes)
  for (const key of ['i18n/en/records.json', 'guide-trip-costs.json', 'spots/index.json']) {
    await save('r2/public-data/' + key, (await source.feed(key)).bytes)
  }
  await save('r2/config.json', Buffer.from(JSON.stringify(await source.r2Config())))

  await mkdir(restored)
  for (const [name, expected] of Object.entries(files)) {
    const target = path.join(restored, name)
    await mkdir(path.dirname(target), { recursive: true })
    await copyFile(path.join(backup, name), target)
    const bytes = await readFile(target)
    assert.ok(bytes.length === expected.bytes && sha(bytes) === expected.sha256, 'RESTORED_AUTHORITY_HASH_MISMATCH')
  }
  const current = {}
  for (const [name, item] of Object.entries(pointers)) {
    const pointer = (await readFile(path.join(restored, 'supabase-storage', item.pointer), 'utf8')).trim()
    assert.equal(pointer, item.target)
    const records = JSON.parse(await readFile(path.join(restored, 'supabase-storage', pointer)))
    assert.ok(Array.isArray(records))
    current[name] = { restoredRecords: records.length, restoredVersions: item.versions, pointerAndDigestVerified: true }
  }
  const summary = { capturedAt: new Date().toISOString(), projectRef: FORMAL_REF, fileCount: Object.keys(files).length,
    totalBytes: total, current, r2AuthorityFeeds: 3, r2BucketConfig: true, productionWrites: 0,
    localRestore: true, authAndLogicalDbBackup: 'SEPARATE', originalMediaArchive: 'SEPARATE' }
  await writeFile(path.join(backup, 'manifest.json'), JSON.stringify({ ...summary, files }, null, 2), { flag: 'wx' })
  console.log(JSON.stringify(summary))
} catch (error) {
  console.error(String(error.message).split('\n')[0])
  process.exitCode = 1
}
