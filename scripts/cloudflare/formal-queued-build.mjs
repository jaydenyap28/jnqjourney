import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { link, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { buildFullStaticPackage } from './full-static-package.mjs'
import { fingerprint, recoveryContentRevision } from './recovery-sources.mjs'
import { rewriteApprovedAdditionValues } from './full-release-media.mjs'
import { staticRecoveryIndexingPolicy } from './recovery-launch-policy.mjs'
import { formalDigest } from '../../cloudflare/admin-preview/formal-publication.mjs'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
export async function buildFormalQueuedSite({ job, baseline, workspace, attempt, readMedia, build = buildFullStaticPackage }) {
  assert.equal(await formalDigest(job.payload), job.id, 'FORMAL_JOB_HASH_MISMATCH')
  assert.equal(job.payload.baselineRevision, baseline.revision, 'FORMAL_BASELINE_CHANGED')
  const directory = path.join(workspace, 'runs', 'formal-release-' + job.id.slice(0, 16) + '-' + attempt)
  await mkdir(directory) // Existing attempts are reconciled, never overwritten.
  const feeds = job.payload.feeds
  const manifest = { ...baseline.manifest, files: {}, capturedAt: new Date().toISOString(), readMode: 'formal-queue-approved',
    productionWrites: 0, contentRevision: recoveryContentRevision(feeds), databaseFingerprint: fingerprint(feeds['database.json']),
    counts: { ...baseline.manifest.counts, totalSpots: feeds['database.json'].inventory.length,
      publicSpots: feeds['database.json'].locations.length, notes: feeds['notes.json'].notes.length, guides: feeds['guides.json'].guides.length } }
  await mkdir(path.join(directory, 'sources'))
  for (const [name, value] of Object.entries(feeds)) {
    assert.match(name, /^[a-z-]+\.json$/)
    const bytes = Buffer.from(JSON.stringify(value))
    manifest.files[name] = { bytes: bytes.length, sha256: sha(bytes) }
    await writeFile(path.join(directory, 'sources', name), bytes, { flag: 'wx' })
  }
  await writeFile(path.join(directory, 'source-manifest.json'), JSON.stringify(manifest), { flag: 'wx' })
  const images = []
  const additions = new Map()
  if (job.payload.media.length) await mkdir(path.join(directory, 'approved-incremental-media'))
  for (const name of job.payload.media) {
    const asset = await readMedia(job.id, name)
    assert.ok(asset.bytes.length > 0 && asset.bytes.length <= 10 * 1024 ** 2 && sha(asset.bytes) === name.split('.')[0])
    assert.ok(asset.rightsEvidence?.trim(), 'FORMAL_MEDIA_RIGHTS_REQUIRED')
    await writeFile(path.join(directory, 'approved-incremental-media', name), asset.bytes, { flag: 'wx' })
    images.push({ name, bytes: asset.bytes.length, rightsEvidence: asset.rightsEvidence, approvedBy: 'Verified formal publisher selection' })
    additions.set(name, { path: '/media/static/' + name })
  }
  await writeFile(path.join(directory, 'media-additions.json'), JSON.stringify({ contentRevision: manifest.contentRevision, images }))
  await build({ workspace, directory, manifest, mediaRoot: path.join(workspace, 'restore-static/production-deploy/media/static') })
  const preview = path.join(directory, 'deploy'), output = path.join(directory, 'production-deploy')
  await mkdir(output)
  async function clone(relative = '') {
    for (const item of await readdir(path.join(preview, relative), { withFileTypes: true })) {
      assert.ok(!item.isSymbolicLink() && !['_worker.js', 'functions', '_routes.json'].includes(item.name))
      const name = path.join(relative, item.name)
      if (item.isDirectory()) { await mkdir(path.join(output, name)); await clone(name) }
      else await link(path.join(preview, name), path.join(output, name))
    }
  }
  await clone()
  const replace = async (name, bytes) => { await unlink(path.join(output, name)); await writeFile(path.join(output, name), bytes, { flag: 'wx' }) }
  const policy = staticRecoveryIndexingPolicy('production-review')
  await replace('_headers', policy.headers.replace('production-review-only', 'static-formal-publisher'))
  await replace('robots.txt', policy.robots)
  const receipt = JSON.parse(await readFile(path.join(output, '_publication.json')))
  Object.assign(receipt, { published: true, formalJobId: job.id, contentRevision: manifest.contentRevision,
    withdrawalPolicy: 'A_STATIC_REPUBLISH_NO_HARD_30_MINUTE_GUARANTEE' })
  await replace('_publication.json', JSON.stringify(receipt))
  const bundle = JSON.parse(await readFile(path.join(directory, 'package-result.json')))
  const mediaPaths = []
  for (const name of await readdir(path.join(output, 'media/static'))) mediaPaths.push('/media/static/' + name)
  return { directory, output, receipt, receiptSha256: sha(JSON.stringify(receipt)),
    routes: bundle.pages.map(page => page.route), redirects: bundle.redirects, mediaPaths,
    source: { revision: await formalDigest(rewriteApprovedAdditionValues(feeds, additions)),
      feeds: rewriteApprovedAdditionValues(feeds, additions), manifest,
      media: Object.fromEntries(images.map(image => [image.name, { bytes: image.bytes, rightsEvidence: image.rightsEvidence }])) } }
}
