import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

// Offline, lossless serialization only. No records or fields are removed.
const file = 'public-data/locations.json'
const before = await readFile(file)
const payload = JSON.parse(before.toString('utf8').replace(/^\uFEFF/, ''))
assert.equal(payload.schemaVersion, 1)
assert.ok(Array.isArray(payload.locations))
const after = Buffer.from(`${JSON.stringify(payload)}\n`)
assert.deepEqual(JSON.parse(after.toString('utf8')), payload)
assert.ok(after.length < 500000, 'Compact snapshot still exceeds the public payload budget')
await writeFile(file, after)
console.log(JSON.stringify({ file, before: before.length, after: after.length, saved: before.length - after.length, records: payload.locations.length }))
