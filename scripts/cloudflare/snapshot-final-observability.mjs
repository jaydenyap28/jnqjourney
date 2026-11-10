// One bounded diagnostic on the existing isolated deployment. No data writes.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ACCOUNT, BUCKET, PROJECT, cloudflareClient, privateWranglerToken } from './candidate-cloudflare.mjs'
import { isolatedKeys, isolatedRequest, ISOLATED_ORIGIN } from './isolated-supabase.mjs'
import { openSnapshotTail } from './snapshot-native-tail.mjs'
import { ORIGIN, SPOT_ID } from '../../cloudflare/spot-loop/snapshot-gateway.mjs'

const previousRoot = 'artifacts/cloudflare-snapshot-navigation-20261110/'
const root = 'artifacts/cloudflare-snapshot-final-20261110/'
await mkdir(root, { recursive: true })
const journal = path.join(root, 'observability.json')
const report = { startedAt: new Date().toISOString(), verdict: 'SNAPSHOT_HOSTING_POC_BLOCKED',
  history: { originalRequests: 16, previousRoundRequests: 13, remainingBudget: 23 }, diagnosticLimit: 2,
  requests: [], formalMigration: 'HOLD', proxyConfigured: Boolean(process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy),
  persistentLogs: { pagesWorkersLogsSupported: false, pagesLogpushSupported: false,
    sources: ['https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/#compatibility-matrix', 'https://developers.cloudflare.com/pages/functions/debugging-and-logging/#limits'] } }
await writeFile(journal, JSON.stringify(report, null, 2), { flag: 'wx' })
const persist = () => writeFile(journal, JSON.stringify(report, null, 2) + '\n')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
let tail, keys
try {
  const [cf, token, value] = await Promise.all([cloudflareClient(), privateWranglerToken(), isolatedKeys()])
  keys = value
  const previous = JSON.parse(await readFile(previousRoot + 'acceptance-navigation-gates.json', 'utf8'))
  assert.equal(previous.requestCounts.roundTotal, 13)
  const deployment = previous.deployment
  assert.equal(deployment.deploymentId, '763e3adf-a713-4049-bb47-22322152df15')
  assert.equal(deployment.origin, ORIGIN)
  assert.equal(deployment.buildId, 'voTUxzUwYFr1dxq3Q-Ntv')
  const project = await cf()
  const { production, preview } = project.deployment_configs
  assert.equal(project.name, PROJECT)
  assert.equal(project.production_branch, 'main')
  assert.ok(!project.canonical_deployment && !Object.keys(production.env_vars || {}).length && !Object.keys(production.r2_buckets || {}).length)
  assert.equal(production.fail_open, false)
  assert.equal(preview.fail_open, false)
  assert.ok((project.domains || []).every(name => name === PROJECT + '.pages.dev'))
  const actual = await cf('/deployments/' + deployment.deploymentId)
  assert.equal(actual.environment, 'preview')
  assert.equal(actual.latest_stage.status, 'success')
  assert.ok(actual.aliases.includes(ORIGIN))
  assert.equal(actual.r2_buckets.TEST_MEDIA.name, BUCKET)
  assert.equal(actual.env_vars.SUPABASE_SERVICE_ROLE_KEY.type, 'secret_text')
  assert.equal(actual.env_vars.SUPABASE_URL.value, ISOLATED_ORIGIN)
  assert.equal(actual.env_vars.SNAPSHOT_BUILD_ID.value, deployment.buildId)
  assert.equal(actual.env_vars.SNAPSHOT_PREFIX.value, previous.prefix)
  const deployments = await cf('/deployments')
  assert.equal(deployments.find(item => item.environment === 'preview' && item.deployment_trigger?.metadata?.branch === 'codex/snapshot-poc').id, deployment.deploymentId)
  const build = JSON.parse(await readFile(previousRoot + 'build.json', 'utf8'))
  assert.equal(build.buildId, deployment.buildId)
  const fixture = await isolatedRequest(keys, `/rest/v1/locations?id=eq.${SPOT_ID}&select=id,name,status,publication_status`)
  assert.ok(fixture.ok)
  const [row] = await fixture.json()
  assert.ok(row?.id === SPOT_ID && row.name === 'Consumer Fixture 92061' && row.status === 'active' && row.publication_status === 'hidden')
  for (const type of ['managed', 'custom']) {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/domains/${type}`, {
      headers: { Authorization: `Bearer ${token}` }, redirect: 'manual', signal: AbortSignal.timeout(10000),
    })
    const result = await response.json()
    assert.ok(response.ok && result.success)
    if (type === 'managed') assert.equal(result.result.enabled, false)
    else assert.equal(result.result.domains.length, 0)
  }
  const object = async key => {
    assert.ok(key.startsWith(previous.prefix + '/'))
    return fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects/${key}`, {
      headers: { Authorization: `Bearer ${token}` }, redirect: 'manual', signal: AbortSignal.timeout(15000),
    })
  }
  const [release] = previous.releases
  const { label, ...manifest } = release
  const directory = previous.prefix + '/' + release.revision
  const remoteManifest = await object(directory + '/manifest.json')
  assert.ok(remoteManifest.ok)
  assert.deepEqual(await remoteManifest.json(), manifest)
  let verified = 0
  for (const [name, entry] of Object.entries(manifest.objects)) {
    const response = await object(directory + '/' + name + '-' + entry.sha256)
    const bytes = Buffer.from(await response.arrayBuffer())
    assert.ok(response.ok && bytes.length === entry.bytes && sha(bytes) === entry.sha256)
    assert.equal(response.headers.get('etag')?.replace(/^W\//, '').replaceAll('"', ''), entry.etag)
    verified++
  }
  assert.equal(verified, 8)
  report.preflight = { deploymentId: deployment.deploymentId, buildId: deployment.buildId, prefix: previous.prefix,
    hardExpired: Date.now() >= Number(actual.env_vars.SNAPSHOT_EXPIRES_AT.value) * 1000,
    expiresAt: Number(actual.env_vars.SNAPSHOT_EXPIRES_AT.value), fixtureHidden: true, bucketPrivate: true,
    productionEmpty: true, failClosed: true, privateSnapshotBytesAndEtagsVerified: verified,
    pagesObservabilityConfigPresent: Object.hasOwn(actual, 'observability') }
  await persist()
  tail = await openSnapshotTail(deployment, path.join(root, 'runtime-diagnostic.json'), { diagnostic: true })
  report.socketOpenedAt = tail.openedAt
  for (let index = 0; index < report.diagnosticLimit; index++) {
    const id = `${Date.now()}-${index}`
    const route = `/__jnq_snapshot_observe/${id}`
    const record = { acceptanceId: id, path: route, method: 'GET', status: 'UNKNOWN', cpuMs: 'UNKNOWN', purpose: 'read-only-no-content-diagnostic' }
    report.requests.push(record)
    await persist()
    const pending = tail.track(id)
    try {
      const response = await fetch(ORIGIN + route, { headers: { 'X-JnQ-Acceptance': id, 'Cache-Control': 'no-store' },
        redirect: 'manual', signal: AbortSignal.timeout(15000) })
      record.status = response.status
      record.cfRay = response.headers.get('cf-ray')
      record.gateHeader = response.headers.get('x-jnq-snapshot-gate')
      const bytes = Buffer.from(await response.arrayBuffer())
      record.bytes = bytes.length
      record.bodyDrained = true
      await persist()
      assert.equal(response.status, 404)
      assert.equal(record.gateHeader, '1')
      assert.equal(bytes.toString(), 'Not Found')
      const event = await pending.result()
      assert.ok(event && Number.isFinite(event.cpuTime), 'NATIVE_TAIL_MISSING')
      Object.assign(record, { cpuMs: event.cpuTime, outcome: event.outcome, correlation: event.correlation,
        nativeTraceId: event.nativeTraceId, nativeCfRay: event.cfRay, nativeEventTimestamp: event.eventTimestamp, nativeReceivedAt: event.receivedAt })
      await persist()
      assert.ok(event.cpuTime <= 10, 'NATIVE_CPU_OVER_10_MS')
      assert.ok(event.acceptanceId === id && event.path === route && event.status === 404 && event.method === 'GET' && event.outcome === 'ok' && !event.truncated, 'NATIVE_ASSOCIATION_FAILED')
      if (event.cfRay && record.cfRay) assert.equal(event.cfRay.split('-')[0].toLowerCase(), record.cfRay.split('-')[0].toLowerCase(), 'NATIVE_RAY_MISMATCH')
    } finally { pending.cancel() }
  }
  report.observabilityDiagnosticPassed = true
} catch (error) {
  report.blocker = 'OBSERVABILITY_BLOCKED'
  report.reason = String(error.message).split('\n')[0].slice(0, 180)
  process.exitCode = 1
} finally {
  if (tail) {
    try { await tail.close(); report.tailDeleted = true } catch { report.tailDeleted = false; process.exitCode = 1 }
  }
  if (keys) {
    try {
      const response = await isolatedRequest(keys, `/rest/v1/locations?id=eq.${SPOT_ID}&select=id,publication_status`)
      const rows = await response.json()
      report.fixtureHiddenAfter = response.ok && rows.length === 1 && rows[0].id === SPOT_ID && rows[0].publication_status === 'hidden'
    } catch { report.fixtureHiddenAfter = false }
    if (!report.fixtureHiddenAfter) { report.cleanupError = 'FIXTURE_HIDDEN_NOT_CONFIRMED'; process.exitCode = 1 }
  }
  report.remainingBudget = 23 - report.requests.length
  report.finishedAt = new Date().toISOString()
  await persist()
  console.log(JSON.stringify(report))
}
