// Safe placeholder for the prepared, disabled formal scheduled task.
// Enabling production publishing requires a separately reviewed task action.
import assert from 'node:assert/strict'
import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'

const [mode, projectRef, directory] = process.argv.slice(2)
assert.ok(mode === '--disabled-only' && projectRef === 'vrufunuomioczocdsoer')
assert.ok(directory && path.isAbsolute(directory) && await realpath(directory) === directory)
const root = path.join(directory, 'production-publisher')
const settings = JSON.parse(await readFile(path.join(root, 'settings.json'), 'utf8'))
assert.equal(settings.projectRef, projectRef)
assert.equal(settings.enabled, false, 'FORMAL_PUBLISHING_REQUIRES_SEPARATE_APPROVAL')
for (const field of ['formalWritesEnabled', 'formalUploadsEnabled', 'formalPublishingEnabled']) {
  assert.equal(settings[field], false, 'FORMAL_CAPABILITY_REQUIRES_SEPARATE_APPROVAL')
}
assert.equal(settings.expectedCurrentProductionId, '333e51aa-506e-4a66-a7c6-4f28e3e890a1')
console.log(JSON.stringify({ projectRef, publishingEnabled: false, deploymentSubmitted: false }))
