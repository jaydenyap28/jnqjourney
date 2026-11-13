import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, realpath, rename, unlink, writeFile, lstat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { createClient } from '@supabase/supabase-js'
import { FORMAL_PRIVATE_SCOPE, FORMAL_RELEASE_GATES } from '../../cloudflare/admin-preview/formal-runtime.mjs'
import { formalDigest } from '../../cloudflare/admin-preview/formal-publication.mjs'
import { publicationStore, jobState } from '../../cloudflare/admin-preview/publication.mjs'
import { ACCOUNT, privateWranglerToken } from './candidate-cloudflare.mjs'
import { getFormalKey } from './formal-read-source.mjs'
import { formalPublisherTick } from './formal-publisher-core.mjs'
import { buildFormalQueuedSite } from './formal-queued-build.mjs'
import { buildLocationSlug } from '../../lib/location-routing.ts'
import { readFormalFreeHeadroom } from './formal-publication-cost.mjs'
import { requireSingleReleaseSettings, requireSingleJobApproval, restoreSingleReleaseHold } from '../../cloudflare/admin-preview/formal-single-release.mjs'

const [mode, ref] = process.argv.slice(2)
assert.ok(['--prepare-off', '--check-held', '--watch'].includes(mode) && ref === FORMAL_PRIVATE_SCOPE.projectRef)
if (mode === '--check-held') {
  assert.ok(process.env.JNQ_RECOVERY_WORKSPACE)
  const root=path.join(path.resolve(process.env.JNQ_RECOVERY_WORKSPACE),'production-publisher')
  const s=JSON.parse((await readFile(path.join(root,'settings.json'),'utf8')).replace(/^\uFEFF/,''))
  assert.equal(s.projectRef,ref);assert.equal(s.publicPagesProject,'jnqjourney-static-recovery-candidate')
  assert.ok(s.enabled===false&&s.productionReleaseApproved===false&&s.formalPublishingEnabled===true&&s.supportedReleaseEnvironment==='production')
  assert.ok(s.approvedRelease == null, 'UNEXPECTED_SINGLE_JOB_APPROVAL')
  const pre=JSON.parse(await readFile(path.join(root,'publication-phase3-20261113/preflight.json'),'utf8'))
  assert.ok(pre.productionBranch);assert.equal(s.expectedProductionBranch,pre.productionBranch)
  assert.ok(path.isAbsolute(s.nodeExe)&&path.isAbsolute(s.supabaseCli)&&path.isAbsolute(s.wranglerCli))
  console.log(JSON.stringify({state:'held',entryValidated:true,queueRead:false,credentialsRead:false,heartbeatWritten:false,taskStarted:false}))
} else if (mode === '--prepare-off') {
  assert.ok(Object.values(FORMAL_RELEASE_GATES).every(value => value === false))
  console.log(JSON.stringify({ prepared: true, writes: false, uploads: false, publication: false,
    builder: 'full-static-package', productionSubmitted: false, credentialsRead: false }))
} else {
  const workspace = path.resolve(process.env.JNQ_RECOVERY_WORKSPACE || '.')
  assert.ok(process.env.JNQ_RECOVERY_WORKSPACE && await realpath(workspace) === workspace)
  const root = path.join(workspace, 'production-publisher')
  const settings = await readSettings(root)
  // Refuse a held startup before credentials, queue access or cleanup writes.
  const approval = requireSingleReleaseSettings(settings)
  assert.equal(settings.projectRef, ref)
  assert.equal(settings.formalQueueBucket, FORMAL_PRIVATE_SCOPE.storageBucket)
  assert.ok(path.isAbsolute(settings.supabaseCli) && settings.supabaseCli.endsWith('.js'))
  try { await watch(workspace, root, settings, approval) }
  catch { await closeUnexpectedStartup(root, settings, approval); process.exitCode = 1 }
}

async function readSettings(root) {
  return JSON.parse((await readFile(path.join(root, 'settings.json'), 'utf8')).replace(/^\uFEFF/, ''))
}

function holdPorts(root, settings, approval, consumeApproval) {
  const run = promisify(execFile)
  return {
    consumeApproval,
    async holdLocal() {
      const current = await readSettings(root)
      assert.ok(current.approvedRelease == null || await formalDigest(current.approvedRelease) === await formalDigest(approval), 'FORMAL_SINGLE_APPROVAL_CHANGED')
      const file = path.join(root, 'settings.json'), next = path.join(root, `settings-hold-${process.pid}-${Date.now()}.json`)
      Object.assign(current, { enabled: false, productionReleaseApproved: false, approvedRelease: null })
      await writeFile(next, JSON.stringify(current, null, 2), { flag: 'wx' })
      await rename(next, file)
    },
    async holdServer() {
      const file = path.join(root, `execution-hold-${process.pid}-${Date.now()}.env`)
      await writeFile(file, 'JNQ_FORMAL_EXECUTION_ENABLED=false\n', { flag: 'wx' })
      try { await run(process.execPath, [settings.supabaseCli, 'secrets', 'set', '--env-file', file, '--project-ref', ref],
        { windowsHide: true, timeout: 60000, maxBuffer: 65536 }) } finally { await unlink(file) }
    },
    async disableTask() {
      await run('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', "Disable-ScheduledTask -TaskName 'JnQ Journey Production Publisher' | Out-Null"],
        { windowsHide: true, timeout: 15000, maxBuffer: 65536 })
    },
  }
}

async function closeUnexpectedStartup(root, settings, approval) {
  const status = await restoreSingleReleaseHold(holdPorts(root, settings, approval,
    async () => {
      process.env.JNQ_SUPABASE_CLI = settings.supabaseCli
      const db = createClient(`https://${ref}.supabase.co`, await getFormalKey(), { auth: { persistSession: false } })
      await publicationStore(db, settings.formalQueueBucket, 16 * 1024 ** 2).createOnce(
        `_publication/execution-results/${approval.jobId}/${approval.attempt}.json`,
        { jobId: approval.jobId, contentFingerprint: approval.contentFingerprint, attempt: approval.attempt,
          state: 'initialization-failed', at: new Date().toISOString() })
    }), { state: 'initialization-failed' })
  await writeFile(path.join(root, 'health.json'), JSON.stringify({ at: new Date().toISOString(), ...status, reason: 'SINGLE_RELEASE_INITIALIZATION_STOPPED' }))
}

async function watch(workspace, root, settings, approvedRelease) {
  const json = async file => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
  for (const [key, value] of [['JNQ_SUPABASE_CLI', settings.supabaseCli], ['JNQ_WRANGLER_CLI', settings.wranglerCli]]) {
    assert.ok(path.isAbsolute(value) && value.endsWith('.js')); process.env[key] = value
  }
  const key = await getFormalKey()
  const db = createClient(`https://${ref}.supabase.co`, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const checked = await db.storage.getBucket(settings.formalQueueBucket)
  assert.ok(!checked.error && checked.data.public === false)
  const queue = publicationStore(db, settings.formalQueueBucket, 16 * 1024 ** 2)
  const runnerKey = (await readFile(path.join(root, '.runner-key'), 'utf8')).trim()
  assert.match(runnerKey, /^[a-f0-9]{64}$/)
  const publicKey = await json('artifacts/cloudflare-static-recovery/.public-read-key.json')
  assert.equal(publicKey.projectRef, ref)
  const headers = { Authorization: 'Bearer ' + publicKey.apiKey, 'X-JnQ-Runner-Key': runnerKey,
    'X-JnQ-Release-Attempt': String(approvedRelease.attempt) }
  const api = `https://${ref}.supabase.co/functions/v1/jnq-admin-formal/publication/runner`
  const run = promisify(execFile)
  const sha = value => createHash('sha256').update(value).digest('hex')
  const readLocal = async file => json(file).catch(error => { if (error.code === 'ENOENT') return null; throw error })
  const pendingFile = path.join(root, 'pending.json')
  const shared = path.resolve('artifacts/cloudflare-static-recovery')
  const ledgerFile = path.join(shared, 'publication-attempts.json')
  const live = () => queue.read('_publication/live.json')
  const cloudToken = await privateWranglerToken()
  async function checkCosts() {
    const measured = await readFormalFreeHeadroom(cloudToken, ACCOUNT)
    await writeFile(path.join(root, 'cost-headroom.json'), JSON.stringify(measured))
  }
  const cloudBase = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/pages/projects/jnqjourney-static-recovery-candidate`
  const cloud = async suffix => {
    const response = await fetch(cloudBase + suffix, { headers: { Authorization: 'Bearer ' + cloudToken }, redirect: 'error', signal: AbortSignal.timeout(20000) })
    const result = await response.json(); assert.ok(response.ok && result.success, 'FORMAL_PAGES_READ_FAILED'); return result.result
  }
  const configDigest = project => sha(JSON.stringify({ domains: project.domains, branch: project.production_branch, config: project.deployment_configs }))
  async function checkSelectedJob(record) {
    const current = requireSingleReleaseSettings(await json(path.join(root, 'settings.json')))
    assert.equal(await formalDigest(current), await formalDigest(approvedRelease), 'FORMAL_SINGLE_APPROVAL_CHANGED')
    assert.ok(record?.id === approvedRelease.jobId && await formalDigest(record.payload) === approvedRelease.contentFingerprint &&
      record.payload.authorityRevision === approvedRelease.authorityFingerprint && record.payload.baselineRevision === approvedRelease.baselineRevision &&
      (!record.attempt || record.attempt === approvedRelease.attempt), 'FORMAL_SINGLE_JOB_MISMATCH')
    const remote = await queue.read(`_publication/execution-approvals/${record.id}/${approvedRelease.attempt}.json`)
    assert.equal(await formalDigest(remote), await formalDigest(approvedRelease), 'FORMAL_SERVER_SINGLE_APPROVAL_MISMATCH')
    assert.equal(await queue.read(`_publication/execution-results/${record.id}/${approvedRelease.attempt}.json`), null, 'FORMAL_SINGLE_APPROVAL_CONSUMED')
  }
  async function verifyAuthority(record) {
    await checkSelectedJob(record)
    await requireSingleJobApproval({ approval: approvedRelease, job: record, attempt: approvedRelease.attempt, live: await live(), spent: null })
    const response = await fetch(api + '/verify/' + record.id, { headers, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(120000) })
    assert.ok(response.ok && (await response.json()).revision === record.id, 'FORMAL_QUEUED_VERSION_CHANGED')
  }
  const ports = {
    async lock() {
      const file = path.join(shared, 'publication.lock')
      try {
        const handle = await open(file, 'wx'); await handle.writeFile(JSON.stringify({ owner: 'jnq-formal-publisher', pid: process.pid }))
        return { async release() { await handle.close(); await unlink(file) } }
      } catch (error) {
        if (error.code !== 'EEXIST') throw error
        const old = await readLocal(file)
        if (old?.owner === 'jnq-formal-publisher' && Number.isSafeInteger(old.pid)) {
          try { process.kill(old.pid, 0) } catch (check) {
            if (check.code === 'ESRCH') await rename(file, path.join(root, 'stale-lock-' + Date.now() + '.json'))
          }
        }
        return null
      }
    },
    async pending() { const record = await readLocal(pendingFile); if (record) await checkSelectedJob(record); return record },
    async latest() { const job = await queue.job(approvedRelease.jobId); await checkSelectedJob(job); return job },
    async state(job) { const state = await jobState(queue, job); assert.equal(state.attempt || 1, approvedRelease.attempt, 'FORMAL_APPROVED_ATTEMPT_CHANGED'); return state },
    async claimSingleAttempt(job, attempt) {
      await checkSelectedJob({ ...job, attempt })
      const claim = { nonce: randomUUID(), at: new Date().toISOString() }
      const saved = await queue.createOnce(`_publication/execution-claims/${job.id}/${attempt}.json`, claim)
      assert.equal(saved.nonce, claim.nonce, 'FORMAL_SINGLE_ATTEMPT_ALREADY_CLAIMED')
    },
    ledger: async () => await readLocal(ledgerFile) || [],
    async recordAttempt(job, now) { const ledger = await ports.ledger(); ledger.push({ id: job.id, startedAt: new Date(now).toISOString(), mode: 'formal-admin' }); await writeFile(ledgerFile, JSON.stringify(ledger)) },
    progress: (job, value) => queue.write('_publication/progress/' + job.id + '.json', { ...value, attempt: value.attempt || approvedRelease.attempt, updatedAt: new Date().toISOString() }),
    verifyAuthority,
    async build(job) {
      await checkCosts()
      const baseline = (await live()).source
      const state = await jobState(queue, job)
      return buildFormalQueuedSite({ job, baseline, workspace, attempt: state.attempt || 1,
        async readMedia(id, name) {
          const meta = await queue.read('_media/' + name + '.json')
          assert.ok(meta && !meta.revoked && meta.rightsEvidence?.trim(), 'FORMAL_MEDIA_NO_LONGER_APPROVED')
          const cache = path.join(root, 'verified-incremental-media', name)
          try {
            const info = await lstat(cache)
            assert.ok(info.isFile() && !info.isSymbolicLink() && info.size <= 10 * 1024 ** 2)
            const bytes = await readFile(cache)
            assert.equal(sha(bytes), name.split('.')[0])
            // verifyAuthority() checks the current server receipt and R2 HEAD;
            // the cache only avoids transferring identical verified bytes.
            return { bytes, rightsEvidence: meta.rightsEvidence }
          } catch (error) { if (error.code !== 'ENOENT') throw error }
          const response = await fetch(api + '/media/' + id + '/' + name, { headers, redirect: 'error', signal: AbortSignal.timeout(120000) })
          assert.ok(response.ok && /^image\//.test(response.headers.get('content-type')), 'FORMAL_PRIVATE_MEDIA_READ_FAILED')
          const bytes = Buffer.from(await response.arrayBuffer())
          assert.ok(bytes.length <= 10 * 1024 ** 2 && sha(bytes) === name.split('.')[0])
          await mkdir(path.dirname(cache), { recursive: true })
          await writeFile(cache, bytes, { flag: 'wx' })
          return { bytes, rightsEvidence: meta.rightsEvidence }
        } })
    },
    async prepareSubmission(job, built, attempt) {
      await checkSelectedJob({ ...job, attempt })
      await checkCosts()
      const project = await cloud(''), current = await live()
      assert.ok(!project.source && project.production_branch && project.production_branch === settings.expectedProductionBranch)
      assert.equal(project.production_branch, approvedRelease.expectedProductionBranch)
      assert.equal(project.canonical_deployment?.id, approvedRelease.expectedProductionId, 'FORMAL_APPROVED_PRODUCTION_CHANGED')
      assert.equal(project.canonical_deployment?.id, current.deploymentId || settings.expectedCurrentProductionId, 'FORMAL_PRODUCTION_CHANGED')
      assert.deepEqual([...project.domains].sort(), ['jnqjourney-static-recovery-candidate.pages.dev', 'www.jnqjourney.com', 'jnqjourney.com'].sort())
      for (const cfg of Object.values(project.deployment_configs)) for (const type of ['env_vars','r2_buckets','kv_namespaces','d1_databases','services','durable_object_namespaces']) assert.equal(Object.keys(cfg[type] || {}).length, 0)
      const commit = sha(job.id + ':' + attempt).slice(0, 40)
      return { ...job, attempt, built, branch: project.production_branch, commit, submittedAt: new Date().toISOString(), beforeConfig: configDigest(project) }
    },
    savePending: record => writeFile(pendingFile, JSON.stringify(record), { flag: 'wx' }),
    async submit(record) {
      await verifyAuthority(record)
      const project = await cloud('')
      assert.equal(project.canonical_deployment?.id, approvedRelease.expectedProductionId, 'FORMAL_APPROVED_PRODUCTION_CHANGED')
      assert.equal(configDigest(project), record.beforeConfig, 'FORMAL_PAGES_CONFIGURATION_CHANGED')
      await writeFile(path.join(root, 'wrangler.jsonc'), JSON.stringify({ name: 'jnqjourney-static-recovery-candidate', pages_build_output_dir: record.built.output }))
      // Wrangler reuses content-addressed assets in this same Pages project.
      await run(process.execPath, [settings.wranglerCli, 'pages', 'deploy', record.built.output, '--project-name',
        'jnqjourney-static-recovery-candidate', '--branch', record.branch, '--commit-hash', record.commit, '--commit-dirty=true', '--force'],
      { cwd: root, windowsHide: true, timeout: 45 * 60_000, maxBuffer: 4 * 1024 ** 2,
        env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT, WRANGLER_SEND_METRICS: 'false' } })
    },
    async findDeployment(record) {
      await checkSelectedJob(record)
      const matches = []
      for (let page = 1; page <= 10; page++) {
        const deployments = await cloud('/deployments?per_page=100&page=' + page)
        matches.push(...deployments.filter(item => item.environment === 'production' && item.deployment_trigger?.metadata?.commit_hash === record.commit && item.deployment_trigger.metadata.branch === record.branch))
        if (deployments.length < 100) break
      }
      assert.ok(matches.length <= 1, 'FORMAL_DEPLOYMENT_NOT_UNIQUE')
      return matches[0] || null
    },
    async verifyDeployment(record, deployment) {
      assert.equal(deployment.uses_functions, false)
      const project = await cloud('')
      assert.equal(project.canonical_deployment?.id, deployment.id)
      assert.equal(configDigest(project), record.beforeConfig)
      const fixed = new URL(deployment.url)
      assert.match(fixed.origin, /^https:\/\/[a-f0-9]+\.jnqjourney-static-recovery-candidate\.pages\.dev$/)
      const get = async (base, route, status = 200) => {
        const response = await fetch(base + route, { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(25000) })
        assert.equal(response.status, status, 'FORMAL_DEPLOYED_STATUS_MISMATCH')
        return Buffer.from(await response.arrayBuffer())
      }
      for (const base of [fixed.origin, 'https://www.jnqjourney.com']) {
        assert.equal(sha(await get(base, '/_publication.json')), record.built.receiptSha256)
        await get(base, '/')
      }
      const previous = await live()
      const inventory = previous.routes?.length ? previous : await queue.read('_publication/baseline-inventory/' + previous.source.revision + '.json')
      assert.ok(inventory?.routes?.length && inventory.mediaPaths?.length, 'FORMAL_WITHDRAWAL_INVENTORY_MISSING')
      for (const route of [...inventory.routes, ...inventory.mediaPaths].filter(route => !record.built.routes.includes(route) && !record.built.mediaPaths.includes(route) && !record.built.redirects.some(item => item.from === route))) {
        await get(fixed.origin, route, 404)
        await get('https://www.jnqjourney.com', route, 404)
      }
      for (const selected of record.payload.approvals.filter(item => item.action === 'publish')) {
        let route = selected.kind === 'spot' ? '/spot/' + buildLocationSlug(record.payload.feeds['database.json'].locations.find(row => String(row.id) === selected.key).name, selected.key) :
          (selected.kind === 'note' ? '/notes/' : '/guide/') + selected.key
        for (let depth = 0; depth < 10; depth++) { const redirect = record.built.redirects.find(item => item.from === route); if (!redirect) break; route = redirect.to }
        await get(fixed.origin, route)
      }
      for (const name of record.payload.media) assert.equal(sha(await get(fixed.origin, '/media/static/' + name)), name.split('.')[0])
    },
    async alreadyCommitted(record, deployment) { const current = await live(); return current?.id === record.id && current.deploymentId === deployment.id },
    async commit(record, deployment) {
      await queue.write('_publication/live.json', { id: record.id, deploymentId: deployment.id, at: new Date().toISOString(),
        source: record.built.source, routes: record.built.routes, mediaPaths: record.built.mediaPaths })
      const confirmed = await live()
      assert.ok(confirmed?.id === record.id && confirmed.deploymentId === deployment.id && await formalDigest(confirmed.source) === await formalDigest(record.built.source), 'FORMAL_LIVE_RECEIPT_UNCONFIRMED')
    },
    clearPending: () => unlink(pendingFile),
  }
  const approvalPath = `${approvedRelease.jobId}/${approvedRelease.attempt}.json`
  async function finish(result) {
    if (['queued','idle'].includes(result.state)) {
      result = {...result,state:'failed',reason:'SINGLE_RELEASE_NOT_STARTED_REQUIRES_NEW_APPROVAL'}
      await ports.progress({id:approvedRelease.jobId},{state:'failed',retryable:true,reason:result.reason})
    }
    const status = await restoreSingleReleaseHold(holdPorts(root, settings, approvedRelease,
      async () => {
        await queue.createOnce('_publication/execution-results/' + approvalPath, {
          jobId: approvedRelease.jobId, contentFingerprint: approvedRelease.contentFingerprint,
          authorityFingerprint: approvedRelease.authorityFingerprint, attempt: approvedRelease.attempt,
          state: result.state, deploymentId: result.deploymentId || null, at: new Date().toISOString() })
      }), result)
    await writeFile(path.join(root, 'health.json'), JSON.stringify({ at: new Date().toISOString(), ...status, jobId: approvedRelease.jobId }))
  }
  await mkdir(root, { recursive: true })
  // This entry never follows the next queued job. Reconciliation of this one
  // submission is bounded; uncertainty consumes approval and retains journal.
  for (let poll = 0; poll < 20; poll++) {
    try {
      requireSingleReleaseSettings(await json(path.join(root, 'settings.json')))
      await queue.write('_publication/heartbeat.json', { at: new Date().toISOString() })
      const result = await formalPublisherTick({ enabled: true, ports, singleRelease: true })
      await writeFile(path.join(root, 'health.json'), JSON.stringify({ at: new Date().toISOString(), state: result.state }))
      if (!['verifying', 'busy'].includes(result.state)) { await finish(result); return }
    } catch { await finish({state:'uncertain',reason:'FORMAL_PUBLISHER_RECONCILIATION_REQUIRED'}); return }
    await delay(30000)
  }
  await finish({state:'uncertain',reason:'BOUNDED_RECONCILIATION_TIMEOUT_NO_RESUBMISSION'})
}
