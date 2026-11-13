import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, open, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises'
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

const [mode, ref] = process.argv.slice(2)
assert.ok(['--prepare-off', '--watch'].includes(mode) && ref === FORMAL_PRIVATE_SCOPE.projectRef)
if (mode === '--prepare-off') {
  assert.ok(Object.values(FORMAL_RELEASE_GATES).every(value => value === false))
  console.log(JSON.stringify({ prepared: true, writes: false, uploads: false, publication: false,
    builder: 'full-static-package', productionSubmitted: false, credentialsRead: false }))
} else {
  // Stop before reading credentials, touching a queue or starting a heartbeat.
  assert.equal(FORMAL_RELEASE_GATES.publication, true, 'FORMAL_PUBLISHER_COMPILED_OFF')
  await watch()
}

async function watch() {
  const workspace = path.resolve(process.env.JNQ_RECOVERY_WORKSPACE || '.')
  assert.ok(process.env.JNQ_RECOVERY_WORKSPACE && await realpath(workspace) === workspace)
  const root = path.join(workspace, 'production-publisher')
  const json = async file => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
  const settings = await json(path.join(root, 'settings.json'))
  assert.ok(settings.enabled === true && settings.formalPublishingEnabled === true && settings.supportedReleaseEnvironment === 'production')
  assert.equal(settings.projectRef, ref)
  assert.equal(settings.formalQueueBucket, FORMAL_PRIVATE_SCOPE.storageBucket)
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
  const headers = { Authorization: 'Bearer ' + publicKey.apiKey, 'X-JnQ-Runner-Key': runnerKey }
  const api = `https://${ref}.supabase.co/functions/v1/jnq-admin-formal/publication/runner`
  const run = promisify(execFile)
  const sha = value => createHash('sha256').update(value).digest('hex')
  const readLocal = async file => json(file).catch(error => { if (error.code === 'ENOENT') return null; throw error })
  const pendingFile = path.join(root, 'pending.json')
  const shared = path.resolve('artifacts/cloudflare-static-recovery')
  const ledgerFile = path.join(shared, 'publication-attempts.json')
  const live = () => queue.read('_publication/live.json')
  const cloudToken = await privateWranglerToken()
  const cloudBase = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/pages/projects/jnqjourney-static-recovery-candidate`
  const cloud = async suffix => {
    const response = await fetch(cloudBase + suffix, { headers: { Authorization: 'Bearer ' + cloudToken }, redirect: 'error', signal: AbortSignal.timeout(20000) })
    const result = await response.json(); assert.ok(response.ok && result.success, 'FORMAL_PAGES_READ_FAILED'); return result.result
  }
  const configDigest = project => sha(JSON.stringify({ domains: project.domains, branch: project.production_branch, config: project.deployment_configs }))
  async function verifyAuthority(record) {
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
    pending: () => readLocal(pendingFile),
    latest: () => queue.latest(), state: job => jobState(queue, job),
    ledger: async () => await readLocal(ledgerFile) || [],
    async recordAttempt(job, now) { const ledger = await ports.ledger(); ledger.push({ id: job.id, startedAt: new Date(now).toISOString(), mode: 'formal-admin' }); await writeFile(ledgerFile, JSON.stringify(ledger)) },
    progress: (job, value) => queue.write('_publication/progress/' + job.id + '.json', { ...value, attempt: value.attempt || job.attempt || 1, updatedAt: new Date().toISOString() }),
    verifyAuthority,
    async build(job) {
      const baseline = (await live()).source
      const state = await jobState(queue, job)
      return buildFormalQueuedSite({ job, baseline, workspace, attempt: state.attempt || 1,
        async readMedia(id, name) {
          const response = await fetch(api + '/media/' + id + '/' + name, { headers, redirect: 'error', signal: AbortSignal.timeout(120000) })
          assert.ok(response.ok && /^image\//.test(response.headers.get('content-type')), 'FORMAL_PRIVATE_MEDIA_READ_FAILED')
          const meta = await queue.read('_media/' + name + '.json')
          return { bytes: Buffer.from(await response.arrayBuffer()), rightsEvidence: meta?.rightsEvidence }
        } })
    },
    async prepareSubmission(job, built, attempt) {
      const project = await cloud(''), current = await live()
      assert.ok(!project.source && project.production_branch && project.production_branch === settings.expectedProductionBranch)
      assert.equal(project.canonical_deployment?.id, current.deploymentId || settings.expectedCurrentProductionId, 'FORMAL_PRODUCTION_CHANGED')
      assert.deepEqual([...project.domains].sort(), ['jnqjourney-static-recovery-candidate.pages.dev', 'www.jnqjourney.com', 'jnqjourney.com'].sort())
      for (const cfg of Object.values(project.deployment_configs)) for (const type of ['env_vars','r2_buckets','kv_namespaces','d1_databases','services','durable_object_namespaces']) assert.equal(Object.keys(cfg[type] || {}).length, 0)
      const commit = sha(job.id + ':' + attempt).slice(0, 40)
      return { ...job, attempt, built, branch: project.production_branch, commit, submittedAt: new Date().toISOString(), beforeConfig: configDigest(project) }
    },
    savePending: record => writeFile(pendingFile, JSON.stringify(record), { flag: 'wx' }),
    async submit(record) {
      await verifyAuthority(record)
      await writeFile(path.join(root, 'wrangler.jsonc'), JSON.stringify({ name: 'jnqjourney-static-recovery-candidate', pages_build_output_dir: record.built.output }))
      // Wrangler reuses content-addressed assets in this same Pages project.
      await run(process.execPath, [settings.wranglerCli, 'pages', 'deploy', record.built.output, '--project-name',
        'jnqjourney-static-recovery-candidate', '--branch', record.branch, '--commit-hash', record.commit, '--commit-dirty=true', '--force'],
      { cwd: root, windowsHide: true, timeout: 45 * 60_000, maxBuffer: 4 * 1024 ** 2,
        env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT, WRANGLER_SEND_METRICS: 'false' } })
    },
    async findDeployment(record) {
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
      for (const route of [...(previous.routes || []), ...(previous.mediaPaths || [])].filter(route => !record.built.routes.includes(route) && !record.built.mediaPaths.includes(route) && !record.built.redirects.some(item => item.from === route))) await get(fixed.origin, route, 404)
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
  await mkdir(root, { recursive: true })
  for (;;) {
    try {
      await queue.write('_publication/heartbeat.json', { at: new Date().toISOString() })
      const result = await formalPublisherTick({ enabled: true, ports })
      await writeFile(path.join(root, 'health.json'), JSON.stringify({ at: new Date().toISOString(), state: result.state }))
    } catch { await writeFile(path.join(root, 'health.json'), JSON.stringify({ at: new Date().toISOString(), state: 'held', reason: 'FORMAL_PUBLISHER_RECONCILIATION_REQUIRED' })) }
    await delay(30000)
  }
}
