// Production data is read-only. This entry point can upload a noindex branch preview only.
import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, realpath, symlink, writeFile, open, unlink } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { ACCOUNT, privateWranglerToken } from './candidate-cloudflare.mjs'
import { connectFormalReadSource, FORMAL_REF } from './formal-read-source.mjs'
import { BRANCH, captureRecoverySources, fingerprint, PROJECT, RECOVERY, RECOVERY_BASE, SOURCE, recoveryContentRevision } from './recovery-sources.mjs'
import { budgetBlockedUntil } from './publication-budget.mjs'

const acceptedProduction = '333e51aa-506e-4a66-a7c6-4f28e3e890a1'
const run = promisify(execFile)
const json = async file => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const hashPattern = /^[a-f0-9]{64}$/
const mode = process.argv[2]
const workspace = path.resolve(process.env.JNQ_RECOVERY_WORKSPACE || '.')
const manifestFile = path.join(RECOVERY, 'source-manifest.json')
const output = path.join(RECOVERY, 'deploy')

async function checkWorkspace() {
  assert.deepEqual(process.argv.slice(3), [FORMAL_REF], 'EXACT_FORMAL_REF_REQUIRED')
  assert.ok(['--capture', '--build', '--resume-export', '--preview', '--verify-preview', '--check-operator'].includes(mode),
    'FULL_RELEASE_PREVIEW_COMMAND_REQUIRED')
  assert.equal((await run('git', ['branch', '--show-current'], { windowsHide: true })).stdout.trim(), BRANCH)
  assert.notEqual(RECOVERY, RECOVERY_BASE)
  assert.equal(path.dirname(path.dirname(RECOVERY)), workspace)
  assert.equal(await realpath(workspace), workspace, 'BACKUP_WORKSPACE_MUST_BE_REAL')
  const backup = await json(path.join(workspace, 'static-backup-result.json'))
  assert.ok(backup.restoresToFreshDirectory && backup.files === 8136 && backup.media === 4515 && hashPattern.test(backup.archiveSha256))
  const map = await readFile(path.join(workspace, 'media-map.json'))
  assert.equal(sha(map), backup.mediaMapSha256, 'BACKUP_MEDIA_MAP_MISMATCH')
  assert.equal(fingerprint(await json('cloudflare/static-recovery/media-map-2026-11-11.json')),
    fingerprint(JSON.parse(map)), 'WORKSPACE_MEDIA_MAP_CHANGED')
  const baseline = path.join(workspace, 'restore-static', 'production-deploy')
  assert.equal(sha(await readFile(path.join(baseline, '_publication.json'))), backup.receiptSha256)
  const production = await json(path.join(workspace, 'restore-static', 'image-production-deployment.json'))
  assert.equal(production.deploymentId, acceptedProduction)
  assert.ok(production.success && production.usesFunctions === false)
  return path.join(baseline, 'media/static')
}

async function runStep(script, env, args = []) {
  const log = await open(path.join(RECOVERY, script + '.log'), 'wx')
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.resolve('scripts/cloudflare', script + '.mjs'), ...args],
        { env, windowsHide: true, stdio: ['ignore', log.fd, log.fd] })
      child.on('error', reject)
      child.on('exit', code => code === 0 ? resolve() : reject(Error(`FULL_RELEASE_${script}_${code}`)))
    })
  } finally { await log.close() }
}

async function verifyCapturedFiles() {
  const manifest = await json(manifestFile)
  assert.equal(manifest.readMode, 'authenticated-server')
  assert.equal(manifest.productionWrites, 0)
  const feeds = {}
  for (const [name, item] of Object.entries(manifest.files)) {
    assert.match(name, /^[a-z-]+\.json$/)
    const bytes = await readFile(path.join(RECOVERY, 'sources', name))
    assert.ok(bytes.length === item.bytes && sha(bytes) === item.sha256, 'CAPTURE_FILE_DIGEST_MISMATCH')
    feeds[name] = JSON.parse(bytes)
  }
  assert.equal(recoveryContentRevision(feeds), manifest.contentRevision, 'APPROVED_CONTENT_REVISION_MISMATCH')
  const approved = process.env.JNQ_FORMAL_APPROVED_REVISION
  if (approved) {
    assert.match(approved, hashPattern)
    assert.equal(manifest.contentRevision, approved, 'QUEUED_RELEASE_APPROVAL_IS_STALE')
  }
  const db = feeds['database.json']
  assert.equal(db.projectRef, FORMAL_REF)
  assert.ok(db.locations.every(row => row.id < 95000 || row.id > 95099), 'ISOLATED_FIXTURE_IN_FORMAL_BUILD')
  return manifest
}

async function build(mediaRoot, { resume = false } = {}) {
  const manifest = await verifyCapturedFiles()
  const env = {
    ...process.env, JNQ_RECOVERY_FINAL_MEDIA: '1', JNQ_RECOVERY_REUSE_MEDIA: '1',
    JNQ_RECOVERY_VERIFIED_MEDIA: mediaRoot,
  }
  if (resume) {
    const stage = await json(path.join(RECOVERY, 'manifest.json'))
    assert.equal(stage.sourceFingerprint, fingerprint(manifest.files))
    const buildLog = await readFile(path.join(RECOVERY, 'build-candidate.log'), 'utf8')
    assert.match(buildLog, /Generating static pages \(\d+\/\d+\)/)
    assert.match(buildLog, /at linkFinalMediaToExport/, 'EXPORT_COMPLETION_NOT_PROVEN')
    const exported = path.join(SOURCE, 'out')
    await readFile(path.join(exported, '404.html'))
    assert.equal((await readdir(path.join(exported, 'media/static'))).length, 0, 'MEDIA_LINK_PHASE_ALREADY_STARTED')
    process.env.JNQ_RECOVERY_VERIFIED_MEDIA = mediaRoot
    const { linkFinalMediaToExport, readFinalMediaPlan } = await import('./recovery-media-staging.mjs')
    await linkFinalMediaToExport(exported, await readFinalMediaPlan({ verifyCache: false, reuseExistingMedia: true }))
  } else {
    await mkdir(SOURCE, { recursive: true })
    assert.equal((await readdir(SOURCE)).length, 0, 'PREVIOUS_SOURCE_MUST_BE_PRESERVED')
    // Stage existing UI, then resolve installed dependencies without copying the repository or credentials.
    const dependencies = path.join(workspace, 'build-dependencies', 'node_modules')
    assert.equal((await json(path.join(dependencies, 'next/package.json'))).version,
      (await json('node_modules/next/package.json')).version, 'FORMAL_BUILD_DEPENDENCIES_MISMATCH')
    await runStep('prepare-static-candidate', env, ['--recovery'])
    await symlink(dependencies, path.join(SOURCE, 'node_modules'), 'junction')
    await runStep('build-candidate', env, ['--recovery'])
  }
  for (const [script, args] of [
    ['package-candidate', ['--recovery']], ['verify-static-candidate', ['--recovery']], ['recovery-links-check', []],
    ['recovery-media-release-gate', ['--verify-package']],
  ]) await runStep(script, env, args)
  const evidence = await json(path.join(RECOVERY, 'verification.json'))
  const media = await json(path.join(RECOVERY, 'media-approval-gate.json'))
  assert.ok(evidence.passed && evidence.functions === 0 && media.finalPackageVerified)
  assert.equal(evidence.publicSpotDetails, manifest.counts.publicSpots)
  const receipt = await json(path.join(output, '_publication.json'))
  assert.equal(receipt.sourceFingerprint, fingerprint(manifest.files))
  return { ...evidence, staticMedia: media.packageResult.approvedStaticImages }
}

async function buildWithBudget(mediaRoot, resume) {
  const lockPath = path.join(RECOVERY_BASE, 'publication.lock')
  const ledgerPath = path.join(RECOVERY_BASE, 'publication-attempts.json')
  const lock = await open(lockPath, 'wx')
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, mode: 'formal-full-preview', run: path.basename(RECOVERY) }))
    const ledger = await json(ledgerPath).catch(error => {
      if (error.code === 'ENOENT') return []
      throw error
    })
    assert.ok(Array.isArray(ledger))
    if (resume) {
      assert.ok(ledger.some(row => row.id === path.basename(RECOVERY) && row.mode === 'formal-full-preview'))
      return await build(mediaRoot, { resume: true })
    }
    const blocked = budgetBlockedUntil(ledger)
    assert.ok(!blocked, 'LOCAL_BUILD_BUDGET_BLOCKED_UNTIL_' + blocked)
    await verifyCapturedFiles()
    ledger.push({ id: path.basename(RECOVERY), startedAt: new Date().toISOString(), status: 'BUILDING', mode: 'formal-full-preview' })
    await writeFile(ledgerPath, JSON.stringify(ledger, null, 2))
    return await build(mediaRoot)
  } finally {
    await lock.close()
    await unlink(lockPath)
  }
}

async function preview({ verifyOnly }) {
  const manifest = await verifyCapturedFiles()
  const verified = await json(path.join(RECOVERY, 'verification.json'))
  const media = await json(path.join(RECOVERY, 'media-approval-gate.json'))
  const body = await readFile(path.join(output, '_publication.json'))
  assert.equal(sha(body), verified.publicationReceiptSha256)
  assert.ok(verified.passed && verified.functions === 0 && media.finalPackageVerified)
  const token = await privateWranglerToken()
  const base = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/pages/projects/${PROJECT}`
  const get = async (suffix = '') => {
    const response = await fetch(base + suffix, { headers: { Authorization: 'Bearer ' + token },
      redirect: 'error', signal: AbortSignal.timeout(20000) })
    const data = await response.json()
    assert.ok(response.ok && data.success, `FULL_REVIEW_PAGES_HTTP_${response.status}`)
    return data.result
  }
  const boundary = project => {
    assert.equal(project.name, PROJECT)
    assert.equal(project.canonical_deployment?.id, acceptedProduction, 'PRODUCTION_CHANGED_REVIEW_REQUIRED')
    assert.ok(!project.source && project.production_branch)
    for (const config of Object.values(project.deployment_configs || {})) {
      for (const key of ['env_vars', 'r2_buckets', 'kv_namespaces', 'd1_databases', 'services', 'durable_object_namespaces']) {
        assert.equal(Object.keys(config[key] || {}).length, 0, 'RUNTIME_BINDING_OUT_OF_SCOPE')
      }
    }
    return { canonical: project.canonical_deployment.id, branch: project.production_branch,
      domains: [...project.domains].sort(), settings: fingerprint(project.deployment_configs) }
  }
  const before = boundary(await get())
  const revision = manifest.contentRevision
  const branch = 'full-review-' + revision.slice(0, 16)
  assert.notEqual(branch, before.branch, 'PRODUCTION_BRANCH_FORBIDDEN')
  const commit = (await run('git', ['rev-parse', 'HEAD'], { windowsHide: true })).stdout.trim()
  const journal = path.join(RECOVERY, 'deployment.json')
  let receipt
  if (!verifyOnly) {
    const source = await connectFormalReadSource()
    await captureRecoverySources({ privateSource: source, verifyOnly: true })
    receipt = { project: PROJECT, branch, environment: 'preview', revision, commit,
      startedAt: new Date().toISOString(), before, success: false }
    await writeFile(journal, JSON.stringify(receipt, null, 2), { flag: 'wx' })
    await writeFile(path.join(RECOVERY, 'wrangler.jsonc'), JSON.stringify({ name: PROJECT, pages_build_output_dir: './deploy' }))
    try {
      const result = await run(process.execPath, [process.env.JNQ_WRANGLER_CLI, 'pages', 'deploy', output,
        '--project-name', PROJECT, '--branch', branch, '--commit-hash', commit, '--commit-dirty=true'], {
        cwd: RECOVERY, windowsHide: true, timeout: 45 * 60_000, maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT, WRANGLER_SEND_METRICS: 'false' },
      })
      await writeFile(path.join(RECOVERY, 'preview-upload.log'), (result.stdout + result.stderr).replaceAll(token, '[redacted]'))
    } catch { throw Error('PREVIEW_UPLOAD_UNCERTAIN_RUN_VERIFY_PREVIEW') }
  } else {
    receipt = await json(journal)
    assert.equal(receipt.revision, revision)
    assert.equal(receipt.project, PROJECT)
    assert.equal(receipt.branch, branch)
    assert.equal(receipt.environment, 'preview')
  }
  assert.deepEqual(boundary(await get()), receipt.before, 'PRODUCTION_OR_DOMAINS_CHANGED')
  const candidates = (await get('/deployments')).filter(item => item.environment === 'preview' &&
    item.deployment_trigger?.metadata?.branch === receipt.branch && item.deployment_trigger.metadata.commit_hash === receipt.commit &&
    Date.parse(item.created_on) >= Date.parse(receipt.startedAt) - 5000)
  assert.equal(candidates.length, 1, 'PREVIEW_ID_UNCONFIRMED_DO_NOT_RESUBMIT')
  const [deployed] = candidates
  assert.ok(deployed.latest_stage?.status === 'success' && deployed.uses_functions === false)
  assert.match(deployed.url, new RegExp(`^https://[a-f0-9]+\\.${PROJECT}\\.pages\\.dev$`))
  const check = await fetch(deployed.url + '/_publication.json', { redirect: 'error', signal: AbortSignal.timeout(20000) })
  assert.equal(check.status, 200)
  assert.match(check.headers.get('x-robots-tag') || '', /noindex/)
  assert.equal(sha(Buffer.from(await check.arrayBuffer())), sha(body), 'PREVIEW_RELEASE_HASH_MISMATCH')
  await captureRecoverySources({ privateSource: await connectFormalReadSource(), verifyOnly: true })
  Object.assign(receipt, { url: deployed.url, deploymentId: deployed.id, functions: 0,
    mediaApprovalFingerprint: media.approvalFingerprint, success: true, verifiedAt: new Date().toISOString() })
  await writeFile(journal, JSON.stringify(receipt, null, 2))
  return receipt
}

try {
  const mediaRoot = await checkWorkspace()
  if (mode === '--check-operator') {
    const source = await connectFormalReadSource()
    console.log(JSON.stringify(await source.verifyOperator(process.env.JNQ_FORMAL_OPERATOR_AUTH_ID || '')))
  } else if (mode === '--capture') {
    await mkdir(RECOVERY, { recursive: true })
    assert.equal((await readdir(RECOVERY)).length, 0, 'PREVIOUS_CAPTURE_MUST_BE_PRESERVED')
    const result = await captureRecoverySources({ privateSource: await connectFormalReadSource() })
    console.log(JSON.stringify({ mode: result.readMode, counts: result.counts, revision: result.contentRevision }))
  } else {
    const result = mode === '--build' || mode === '--resume-export' ? await buildWithBudget(mediaRoot, mode === '--resume-export') :
      await preview({ verifyOnly: mode === '--verify-preview' })
    console.log(JSON.stringify(result))
  }
} catch (error) {
  console.error(String(error.message).split('\n')[0])
  process.exitCode = 1
}
