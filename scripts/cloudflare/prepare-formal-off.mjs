import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { FORMAL_PRIVATE_SCOPE, FORMAL_RELEASE_GATES } from '../../cloudflare/admin-preview/formal-runtime.mjs'
assert.deepEqual(process.argv.slice(2), ['--prepare-off', FORMAL_PRIVATE_SCOPE.projectRef])
assert.ok(Object.values(FORMAL_RELEASE_GATES).every(value => value === false))
const wrangler = process.env.JNQ_WRANGLER_CLI
assert.ok(wrangler && path.isAbsolute(wrangler), 'EXISTING_WRANGLER_REQUIRED_NO_INSTALL')
const { build } = await import(pathToFileURL(path.resolve(path.dirname(wrangler), '../../esbuild/lib/main.js')).href)
const root = path.resolve('artifacts/cloudflare-formal-off-20261113')
await mkdir(root, { recursive: true })
const result = await build({ entryPoints: ['cloudflare/admin-preview/formal-prepared-edge.ts'], outfile: path.join(root, 'index.ts'),
  bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', external: ['npm:*'], metafile: true })
const bytes = await readFile(path.join(root, 'index.ts'))
assert.doesNotMatch(bytes.toString(), /sb_secret_[a-zA-Z0-9_-]{16,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/)
const evidence = { preparedAt: new Date().toISOString(), projectRef: FORMAL_PRIVATE_SCOPE.projectRef,
  gates: FORMAL_RELEASE_GATES, sourceBundleSha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
  bundledModules: Object.keys(result.metafile.inputs).length, deployed: false, productionWrites: 0,
  productionUploads: 0, publicationSubmitted: false, privateResourcesProvisioned: false }
await writeFile(path.join(root, 'off-preparation.json'), JSON.stringify(evidence, null, 2))
console.log(JSON.stringify(evidence))
