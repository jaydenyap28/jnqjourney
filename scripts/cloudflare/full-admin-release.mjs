// Production data is read-only. This entry point can upload a noindex branch preview only.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, realpath, writeFile, open, unlink } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { ACCOUNT, privateWranglerToken } from './candidate-cloudflare.mjs'
import { connectFormalReadSource, FORMAL_REF } from './formal-read-source.mjs'
import { BRANCH, captureRecoverySources, fingerprint, PROJECT, RECOVERY, RECOVERY_BASE } from './recovery-sources.mjs'
import { buildFullStaticPackage } from './full-static-package.mjs'
import { budgetBlockedUntil } from './publication-budget.mjs'
import { loadReleaseSnapshot, prepareRehearsal, publicIdentityDelta, requireWithdrawalApproval, verifyRehearsal } from './full-release-rehearsal.mjs'

const acceptedProduction = '333e51aa-506e-4a66-a7c6-4f28e3e890a1'
const run = promisify(execFile)
const json = async file => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const hashPattern = /^[a-f0-9]{64}$/
const mode = process.argv[2]
const workspace = path.resolve(process.env.JNQ_RECOVERY_WORKSPACE || '.')
const output = path.join(RECOVERY, 'deploy')

async function checkWorkspace() {
  assert.deepEqual(process.argv.slice(3), [FORMAL_REF], 'EXACT_FORMAL_REF_REQUIRED')
  assert.ok(['--capture', '--build', '--resume-export', '--preview', '--verify-preview', '--check-operator', '--prepare-operators',
    '--prepare-rehearsal'].includes(mode),
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

async function verifyCapturedFiles() {
  const { manifest, feeds } = await loadReleaseSnapshot(RECOVERY)
  assert.ok(['authenticated-server', 'isolated-rehearsal'].includes(manifest.readMode))
  assert.equal(manifest.productionWrites, 0)
  const approved = process.env.JNQ_FORMAL_APPROVED_REVISION
  if (approved) {
    assert.match(approved, hashPattern)
    assert.equal(manifest.contentRevision, approved, 'QUEUED_RELEASE_APPROVAL_IS_STALE')
  }
  const db = feeds['database.json']
  assert.equal(db.projectRef, FORMAL_REF)
  assert.ok(db.locations.every(row => row.id < 95000 || row.id > 95099), 'ISOLATED_FIXTURE_IN_FORMAL_BUILD')
  if (manifest.readMode === 'isolated-rehearsal') {
    return { manifest, ...await verifyRehearsal(workspace, RECOVERY, manifest, feeds) }
  }
  const previous = process.env.JNQ_FORMAL_BASELINE_RUN || 'full-review-20261112-b'
  assert.match(previous, /^full-review-[a-z0-9-]+$/)
  const baseline = path.join(workspace, 'runs', previous)
  const snapshot = await loadReleaseSnapshot(baseline)
  const receipt = await json(path.join(baseline, 'deployment.json'))
  assert.equal(snapshot.manifest.readMode, 'authenticated-server')
  assert.ok(receipt.success && receipt.environment === 'preview' && receipt.revision === snapshot.manifest.contentRevision)
  const delta = publicIdentityDelta(snapshot.feeds, feeds)
  if (Object.values(delta.removed).some(rows => rows.length)) {
    await writeFile(path.join(RECOVERY, 'withdrawal-review.json'), JSON.stringify({
      baseline: snapshot.manifest.contentRevision, proposed: manifest.contentRevision, ...delta,
      removalDigest: fingerprint(delta.removed),
    }, null, 2))
  }
  requireWithdrawalApproval(snapshot.feeds, feeds, process.env.JNQ_FORMAL_APPROVED_REMOVAL_SHA256)
  return { manifest, authority: RECOVERY, branch: 'full-review-' + manifest.contentRevision.slice(0, 16) }
}

async function prepareOperators() {
  const root = path.join(workspace, 'production-publisher')
  const file = path.join(root, 'operator-confirmations.json')
  const stat = await lstat(file)
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 4096 && await realpath(file) === file)
  const { editors, publishers } = await json(file)
  assert.ok([editors, publishers].every(group => Array.isArray(group) && group.length > 0 && group.length <= 10 &&
    group.every(account => typeof account === 'string')))
  const settings = await json(path.join(root, 'settings.json'))
  assert.ok(settings.projectRef === FORMAL_REF && settings.enabled === false)
  const source = await connectFormalReadSource()
  const ids = new Map()
  for (const account of new Set([...editors, ...publishers])) ids.set(account, await source.confirmedOperator(account))
  const roles = { editorAuthIds: [...new Set(editors.map(account => ids.get(account)))],
    publisherAuthIds: [...new Set(publishers.map(account => ids.get(account)))] }
  await writeFile(path.join(root, 'verified-operator-allowlists.json'), JSON.stringify({
    projectRef: FORMAL_REF, verifiedAt: new Date().toISOString(), enabled: false, ...roles,
  }, null, 2), { flag: 'wx' })
  return { editorsVerified: roles.editorAuthIds.length, publishersVerified: roles.publisherAuthIds.length, enabled: false }
}

async function build(mediaRoot, { resume = false } = {}) {
  const { manifest } = await verifyCapturedFiles()
  return buildFullStaticPackage({ workspace, directory: RECOVERY, manifest, mediaRoot, resume })
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
  const { manifest, authority, branch } = await verifyCapturedFiles()
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
  assert.notEqual(branch, before.branch, 'PRODUCTION_BRANCH_FORBIDDEN')
  const commit = (await run('git', ['rev-parse', 'HEAD'], { windowsHide: true })).stdout.trim()
  const journal = path.join(RECOVERY, 'deployment.json')
  const checkAuthority = async () => captureRecoverySources({
    privateSource: await connectFormalReadSource(), verifyOnly: true, verifySourcesFrom: authority,
    preserveCapturedRates: manifest.readMode === 'isolated-rehearsal',
  })
  let receipt
  if (!verifyOnly) {
    await checkAuthority()
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
  await checkAuthority()
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
  } else if (mode === '--prepare-operators') {
    console.log(JSON.stringify(await prepareOperators()))
  } else if (mode === '--prepare-rehearsal') {
    console.log(JSON.stringify(await prepareRehearsal({ workspace, directory: RECOVERY,
      baseRun: process.env.JNQ_FORMAL_BASELINE_RUN || 'full-review-20261112-b',
      phase: process.env.JNQ_FORMAL_DRILL_PHASE, id: process.env.JNQ_FORMAL_DRILL_ID })))
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
