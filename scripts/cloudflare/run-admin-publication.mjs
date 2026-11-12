import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { access, mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { createClient } from '@supabase/supabase-js'
import { FUNCTION, PRIVATE_BUCKET, PROJECT_REF, SUPABASE_ORIGIN } from '../../cloudflare/admin-preview/scope.mjs'
import { jobState, publicationStore, RELEASE_PROJECT, ROOT, sha256 } from '../../cloudflare/admin-preview/publication.mjs'
import { ACCOUNT, privateWranglerToken } from './candidate-cloudflare.mjs'
import { isolatedKeys } from './isolated-supabase.mjs'
import { buildAdminRelease } from './build-admin-release.mjs'
import { budgetBlockedUntil } from './publication-budget.mjs'

assert.deepEqual(process.argv.slice(2), ['--watch', PROJECT_REF])
const root = path.resolve('artifacts/cloudflare-admin-isolated/publisher')
const recovery = path.resolve('artifacts/cloudflare-static-recovery')
await mkdir(root, { recursive: true })
const run = promisify(execFile)
const readJson = file => readFile(file, 'utf8').then(JSON.parse).catch(error => {
  if (error.code === 'ENOENT') return null
  throw error
})
const pendingFile = path.join(root, 'pending.json')
const ledgerFile = path.join(recovery, 'publication-attempts.json')
const sharedLock = path.join(recovery, 'publication.lock')
const config = await readJson(path.join(root, 'settings.json'))
assert.equal(config?.projectRef, PROJECT_REF)
assert.equal(config?.pagesProject, RELEASE_PROJECT)
for (const [key, file] of [['JNQ_SUPABASE_CLI', config.supabaseCli], ['JNQ_WRANGLER_CLI', config.wranglerCli]]) {
  assert.ok(typeof file === 'string' && path.isAbsolute(file) && file.endsWith('.js'))
  process.env[key] = file
}
const keys = await isolatedKeys()
const runnerKey = (await readFile(path.join(root, '.runner-key'), 'utf8')).trim()
assert.match(runnerKey, /^[a-f0-9]{64}$/)
const runnerHeaders = { Authorization: 'Bearer ' + keys.anon, 'X-JnQ-Runner-Key': runnerKey }
const db = createClient(SUPABASE_ORIGIN, keys.service, {
  auth: { persistSession: false, autoRefreshToken: false }, global: {
    fetch: (input, init) => fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(20000), cache: 'no-store' }),
  },
})
const bucket = await db.storage.getBucket(PRIVATE_BUCKET)
assert.ok(!bucket.error && bucket.data?.public === false)
const queue = publicationStore(db)
await writeFile(path.join(root, 'wrangler.jsonc'), JSON.stringify({ name: RELEASE_PROJECT, pages_build_output_dir: './releases' }))
const storageProgress = (job, value) => queue.write(`${ROOT}/progress/${job.id}.json`, {
  ...value, updatedAt: new Date().toISOString(),
})
const reportFile = path.join(root, 'health.json')
const log = (event, detail = {}) => console.log(JSON.stringify({ at: new Date().toISOString(), event, ...detail }))
const failure = (code, retryable = true) => Object.assign(new Error(code), { code, retryable })

async function verifyAuthority(job) {
  const response = await fetch(`${SUPABASE_ORIGIN}/functions/v1/${FUNCTION}/publication/runner/verify/${job.id}`, {
    headers: runnerHeaders, redirect: 'error', signal: AbortSignal.timeout(25000),
  })
  if (response.status === 409) throw failure('APPROVED_VERSION_CHANGED', false)
  if (!response.ok || (await response.json()).revision !== job.id) throw failure('AUTHORITY_VERIFICATION_FAILED')
}

async function cloud() {
  await access(config.wranglerCli).catch(() => { throw failure('WRANGLER_PATH_NOT_AVAILABLE') })
  const token = await privateWranglerToken()
  const api = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/pages/projects`
  async function request(suffix, method = 'GET', body) {
    const response = await fetch(api + suffix, {
      method, body: body ? JSON.stringify(body) : undefined,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      redirect: 'error', signal: AbortSignal.timeout(20000),
    })
    if (method === 'GET' && response.status === 404) return null
    const value = await response.json()
    if (!response.ok || !value.success) throw failure('ISOLATED_PAGES_API_' + response.status)
    return value.result
  }
  function boundary(project) {
    assert.equal(project?.name, RELEASE_PROJECT, 'PAGES_PROJECT_MISMATCH')
    assert.equal(project.production_branch, 'reserved-production', 'PAGES_PRODUCTION_BRANCH_MISMATCH')
    assert.ok(!project.canonical_deployment && !project.source, 'ISOLATED_PROJECT_HAS_PRODUCTION_OR_GIT')
    assert.ok((project.domains || []).every(domain => domain === RELEASE_PROJECT + '.pages.dev'), 'ISOLATED_PROJECT_HAS_CUSTOM_DOMAIN')
    for (const cfg of Object.values(project.deployment_configs ?? {})) {
      for (const name of ['env_vars', 'r2_buckets', 'kv_namespaces', 'd1_databases', 'services', 'durable_object_namespaces']) {
        assert.equal(Object.keys(cfg[name] ?? {}).length, 0, 'ISOLATED_PROJECT_HAS_RUNTIME_BINDINGS')
      }
    }
  }
  return {
    async project(create = false) {
      const exists = await request('/' + RELEASE_PROJECT)
      boundary(exists ?? (create ? await request('', 'POST', {
        name: RELEASE_PROJECT, production_branch: 'reserved-production',
      }) : null))
    },
    async deployments() {
      const rows = await request('/' + RELEASE_PROJECT + '/deployments')
      assert.ok(Array.isArray(rows) && rows.every(row => row.environment === 'preview'))
      return rows
    },
  }
}

async function acquireBuildLock() {
  await mkdir(recovery, { recursive: true })
  try {
    const lock = await open(sharedLock, 'wx')
    await lock.writeFile(JSON.stringify({ owner: 'jnq-isolated-scheduler', pid: process.pid, at: new Date().toISOString() }))
    return lock
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    // Task Scheduler and the wrapper mutex permit just one configured runner.
    // Never reclaim the legacy recovery tool's lock or an unreadable file.
    const existing = await readJson(sharedLock).catch(() => null)
    if (existing?.owner !== 'jnq-isolated-scheduler' || !Number.isSafeInteger(existing.pid) || existing.pid <= 0) return null
    try { process.kill(existing.pid, 0); return null } catch (check) { if (check.code !== 'ESRCH') return null }
    await rename(sharedLock, path.join(root, 'recovered-lock-' + Date.now() + '.json'))
    const lock = await open(sharedLock, 'wx')
    await lock.writeFile(JSON.stringify({ owner: 'jnq-isolated-scheduler', pid: process.pid, at: new Date().toISOString() }))
    return lock
  }
}

async function verifyDeployment(record, deployment) {
  const origin = new URL(deployment.url)
  assert.equal(origin.protocol, 'https:')
  assert.match(origin.hostname, new RegExp('^[a-z0-9]+\\.' + RELEASE_PROJECT + '\\.pages\\.dev$'))
  assert.equal(origin.origin, deployment.url)
  const read = async (route, status) => {
    const response = await fetch(origin.origin + route, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) })
    assert.equal(response.status, status)
    assert.match(response.headers.get('x-robots-tag') || '', /noindex/)
    return Buffer.from(await response.arrayBuffer())
  }
  const release = JSON.parse((await read('/_publication.json', 200)).toString())
  assert.deepEqual(release, record.receipt, 'DEPLOYED_PUBLICATION_RECEIPT_MISMATCH')
  for (const file of release.files) {
    const route = file.path === 'index.html' ? '/' : '/' + file.path.replace(/\.html$/, '')
    const status = file.path === '404.html' ? 404 : 200
    if (file.path === '404.html') continue
    const bytes = await read(route, status)
    assert.equal(bytes.length, file.bytes)
    assert.equal(await sha256(bytes), file.sha256, 'DEPLOYED_STATIC_ASSET_MISMATCH')
  }
  await read('/jnq-publication-missing', 404)
  const removedPages = (record.previous?.pages ?? []).filter(route => !release.pages.includes(route))
  const removedMedia = (record.previous?.media ?? []).filter(url => !release.media.some(row => row.url === url))
  for (const route of [...removedPages, ...removedMedia]) await read(route, 404)
  return { removedPages, removedMedia }
}

async function reconcile(record) {
  const client = await cloud()
  await client.project()
  const matching = (await client.deployments()).filter(row =>
    row.deployment_trigger?.metadata?.branch === record.branch &&
    row.deployment_trigger.metadata.commit_hash === record.commit)
  if (matching.length !== 1) {
    await storageProgress(record, { state: 'verifying', attempt: record.attempt,
      reason: matching.length ? '部署记录不唯一，暂停重试。' : '等待 Cloudflare 确认 Deployment ID。' })
    return
  }
  const [deployment] = matching
  const state = deployment.latest_stage?.status
  if (['failure', 'canceled'].includes(state)) {
    await storageProgress(record, { state: 'failed', attempt: record.attempt, retryable: true, reason: 'Cloudflare 确认部署失败。', deploymentId: deployment.id })
    await unlink(pendingFile)
    return
  }
  if (state !== 'success') return
  assert.equal(deployment.uses_functions, false, 'RUNTIME_FUNCTIONS_NOT_ALLOWED')
  try {
    await verifyAuthority(record)
  } catch (error) {
    if (error.code !== 'APPROVED_VERSION_CHANGED') throw error
    await storageProgress(record, { state: 'failed', attempt: record.attempt, retryable: false,
      reason: '部署已生成，但批准版本已变化。未切换后台成功链接。', deploymentId: deployment.id })
    await unlink(pendingFile)
    return
  }
  let evidence
  try { evidence = await verifyDeployment(record, deployment) }
  catch {
    await storageProgress(record, { state: 'verifying', attempt: record.attempt, deploymentId: deployment.id,
      reason: '已确认 Deployment ID，等待静态字节及 HTTPS 验证。' })
    return
  }
  await verifyAuthority(record)
  const live = { id: record.id, deploymentId: deployment.id, url: deployment.url,
    verifiedAt: new Date().toISOString(), pages: record.receipt.pages,
    media: record.receipt.media.map(row => row.url), evidence,
    downloaded: record.downloaded, reused: record.reused, functions: 0 }
  await queue.write(ROOT + '/live.json', live)
  await storageProgress(record, { state: 'published', attempt: record.attempt, ...live })
  await unlink(pendingFile)
  log('published', { jobId: record.id, deploymentId: deployment.id })
}

async function tick() {
  await queue.write(ROOT + '/heartbeat.json', { at: new Date().toISOString() })
  const pending = await readJson(pendingFile)
  if (pending) { await reconcile(pending); return }
  const job = await queue.latest()
  if (!job) return
  const progress = await jobState(queue, job)
  if (!['queued', 'building'].includes(progress.state)) return
  const lock = await acquireBuildLock()
  if (!lock) return
  let submitted = false
  try {
    await verifyAuthority(job)
    const client = await cloud()
    await client.project(true)
    const ledger = (await readJson(ledgerFile)) ?? []
    assert.ok(Array.isArray(ledger))
    const blocked = budgetBlockedUntil(ledger)
    if (blocked) {
      await storageProgress(job, { state: 'queued', attempt: progress.attempt,
        reason: '本机构建冷却至 ' + blocked })
      return
    }
    ledger.push({ startedAt: new Date().toISOString(), status: 'BUILDING', mode: 'admin-isolated', id: job.id })
    const temp = path.join(recovery, 'publication-attempts-' + process.pid + '.tmp')
    await writeFile(temp, JSON.stringify(ledger, null, 2))
    await rename(temp, ledgerFile)
    await storageProgress(job, { state: 'building', attempt: progress.attempt })
    const output = path.join(root, 'releases', job.id, Date.now().toString(), 'out')
    const built = await buildAdminRelease({ job, output, cache: path.join(root, 'approved-media'), runnerHeaders })
    await verifyAuthority(job)
    const commit = (await sha256(job.id + ':' + progress.attempt)).slice(0, 40)
    const branch = 'release-' + commit.slice(0, 18)
    assert.ok(!(await client.deployments()).some(row =>
      row.deployment_trigger?.metadata?.branch === branch ||
      row.deployment_trigger?.metadata?.commit_hash === commit), 'DEPLOYMENT_ALREADY_EXISTS_RECONCILE')
    const record = { id: job.id, attempt: progress.attempt, branch, commit,
      receipt: built.receipt, downloaded: built.downloaded, reused: built.reused,
      previous: await queue.read(ROOT + '/live.json') }
    // Journal before submission. After a crash only the read-only reconciler
    // runs. No unknown upload is ever replaced by an automatic resubmission.
    await writeFile(pendingFile, JSON.stringify(record), { flag: 'wx' })
    submitted = true
    await storageProgress(job, { state: 'verifying', attempt: progress.attempt, reason: '正在提交隔离 Preview。' })
    try {
      await run(process.execPath, [config.wranglerCli, 'pages', 'deploy', output,
        '--project-name', RELEASE_PROJECT, '--branch', branch, '--commit-hash', commit, '--commit-dirty=true'], {
        cwd: root, windowsHide: true, timeout: 120000, maxBuffer: 2 * 1024 * 1024,
        env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT, WRANGLER_SEND_METRICS: 'false' },
      })
    } catch { log('upload-needs-reconciliation', { jobId: job.id }) }
    await reconcile(record)
  } catch (error) {
    if (submitted || await readJson(pendingFile)) throw error
    const code = typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'STATIC_BUILD_PREFLIGHT_FAILED'
    await storageProgress(job, { state: 'failed', attempt: progress.attempt, retryable: error.retryable !== false, reason: code })
    log('failed', { jobId: job.id, code })
  } finally {
    await lock.close()
    await unlink(sharedLock)
  }
}

for (;;) {
  try {
    await tick()
    await writeFile(reportFile, JSON.stringify({ at: new Date().toISOString(), pid: process.pid, online: true }))
  } catch (error) {
    // Do not include SDK bodies, OAuth output, or credentials in logs.
    const code = typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'PUBLISHER_TICK_FAILED'
    log('tick-held', { code })
    await writeFile(reportFile, JSON.stringify({ at: new Date().toISOString(), pid: process.pid, online: true, code }))
  }
  await delay(30000)
}
