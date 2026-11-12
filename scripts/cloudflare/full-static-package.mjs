import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, open, readFile, readdir, symlink } from 'node:fs/promises'
import path from 'node:path'
import { fingerprint } from './recovery-sources.mjs'

const json = file => readFile(file, 'utf8').then(JSON.parse)

async function runStep(directory, script, env, args = []) {
  const log = await open(path.join(directory, script + '.log'), 'wx')
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.resolve('scripts/cloudflare', script + '.mjs'), ...args],
        { env, windowsHide: true, stdio: ['ignore', log.fd, log.fd] })
      child.on('error', reject)
      child.on('exit', code => code === 0 ? resolve() : reject(Error(`FULL_RELEASE_${script}_${code}`)))
    })
  } finally { await log.close() }
}

export async function buildFullStaticPackage({ workspace, directory, manifest, mediaRoot, resume = false }) {
  const source = path.join(directory, 'source')
  const env = {
    ...process.env, JNQ_RECOVERY_WORKSPACE: workspace, JNQ_RECOVERY_OUTPUT: directory,
    JNQ_RECOVERY_FINAL_MEDIA: '1', JNQ_RECOVERY_REUSE_MEDIA: '1',
    JNQ_RECOVERY_VERIFIED_MEDIA: mediaRoot,
  }
  if (resume) {
    const stage = await json(path.join(directory, 'manifest.json'))
    assert.equal(stage.sourceFingerprint, fingerprint(manifest.files))
    const buildLog = await readFile(path.join(directory, 'build-candidate.log'), 'utf8')
    assert.match(buildLog, /Generating static pages \(\d+\/\d+\)/)
    assert.match(buildLog, /at linkFinalMediaToExport/, 'EXPORT_COMPLETION_NOT_PROVEN')
    const exported = path.join(source, 'out')
    await readFile(path.join(exported, '404.html'))
    assert.equal((await readdir(path.join(exported, 'media/static'))).length, 0, 'MEDIA_LINK_PHASE_ALREADY_STARTED')
    assert.equal(path.resolve(process.env.JNQ_RECOVERY_OUTPUT), directory)
    process.env.JNQ_RECOVERY_VERIFIED_MEDIA = mediaRoot
    const { linkFinalMediaToExport, readFinalMediaPlan } = await import('./recovery-media-staging.mjs')
    await linkFinalMediaToExport(exported, await readFinalMediaPlan({ verifyCache: false, reuseExistingMedia: true }))
  } else {
    await mkdir(source, { recursive: true })
    assert.equal((await readdir(source)).length, 0, 'PREVIOUS_SOURCE_MUST_BE_PRESERVED')
    // Stage existing UI, then resolve installed dependencies without copying the repository or credentials.
    const dependencies = path.join(workspace, 'build-dependencies', 'node_modules')
    assert.equal((await json(path.join(dependencies, 'next/package.json'))).version,
      (await json('node_modules/next/package.json')).version, 'FORMAL_BUILD_DEPENDENCIES_MISMATCH')
    await runStep(directory, 'prepare-static-candidate', env, ['--recovery'])
    await symlink(dependencies, path.join(source, 'node_modules'), 'junction')
    await runStep(directory, 'build-candidate', env, ['--recovery'])
  }
  for (const [script, args] of [
    ['package-candidate', ['--recovery']], ['verify-static-candidate', ['--recovery']], ['recovery-links-check', []],
    ['recovery-media-release-gate', ['--verify-package']],
  ]) await runStep(directory, script, env, args)
  return readVerifiedFullPackage(directory, manifest)
}

export async function readVerifiedFullPackage(directory, manifest) {
  const evidence = await json(path.join(directory, 'verification.json'))
  const media = await json(path.join(directory, 'media-approval-gate.json'))
  assert.ok(evidence.passed && evidence.functions === 0 && media.finalPackageVerified)
  assert.equal(evidence.publicSpotDetails, manifest.counts.publicSpots)
  const body = await readFile(path.join(directory, 'deploy', '_publication.json'))
  assert.equal(createHash('sha256').update(body).digest('hex'), evidence.publicationReceiptSha256)
  const receipt = JSON.parse(body)
  assert.equal(receipt.sourceFingerprint, fingerprint(manifest.files))
  return { ...evidence, staticMedia: media.packageResult.approvedStaticImages }
}
