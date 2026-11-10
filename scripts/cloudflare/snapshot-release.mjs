import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { ACCOUNT, BUCKET, PROJECT, cloudflareClient, privateWranglerToken } from './candidate-cloudflare.mjs'
import { ISOLATED_ORIGIN, isolatedKeys, isolatedRequest } from './isolated-supabase.mjs'
import { createMediaPreparer } from './edge-bridge-media.mjs'
import { LOCAL, ROOT, SITE, runNext } from './snapshot-renderer.mjs'
import { EN, ORIGIN, SPOT_ID, SLUG, STATIC_EXCLUDES, ZH, projectionHash, verifiedProjection } from '../../cloudflare/spot-loop/snapshot-gateway.mjs'

const run = promisify(execFile)
const output = path.join(ROOT, 'out')
const build = JSON.parse(await readFile(path.join(ROOT, 'build.json'), 'utf8'))
export const dataPath = `/_next/data/${build.buildId}${EN}.json`
const fixturePath = `/rest/v1/locations?id=eq.${SPOT_ID}`
const digest = bytes => createHash('sha256').update(bytes).digest('hex')

export async function releaseSession(report, prior) {
  const [keys, token, cf] = await Promise.all([isolatedKeys(), privateWranglerToken(), cloudflareClient()])
  const prefix = `snapshot-poc/${Date.now()}`
  const expiresAt = Math.floor(Date.now() / 1000) + 7200
  report.prefix = prefix
  report.releases = []

  async function r2(key, init = {}) {
    assert.ok(key.startsWith(`${prefix}/`))
    return fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects/${key}`, {
      ...init, redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${token}`, ...init.headers },
    })
  }

  async function boundary() {
    const project = await cf()
    const { production, preview } = project.deployment_configs
    assert.equal(project.name, PROJECT)
    assert.equal(project.production_branch, 'main')
    assert.ok(!project.canonical_deployment && !Object.keys(production.env_vars || {}).length && !Object.keys(production.r2_buckets || {}).length)
    assert.ok((project.domains || []).every(domain => domain === `${PROJECT}.pages.dev`))
    assert.equal(production.fail_open, false)
    assert.equal(preview.fail_open, false)
    assert.equal(preview.r2_buckets.TEST_MEDIA.name, BUCKET)
    assert.equal(preview.env_vars.SUPABASE_SERVICE_ROLE_KEY.type, 'secret_text')
    for (const name of ['managed', 'custom']) {
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/domains/${name}`, {
        headers: { Authorization: `Bearer ${token}` }, redirect: 'manual', signal: AbortSignal.timeout(10000),
      })
      const value = await response.json()
      assert.ok(response.ok && value.success)
      if (name === 'managed') assert.equal(value.result.enabled, false)
      else assert.equal(value.result.domains.length, 0)
    }
    return { productionEmpty: true, failClosed: true, bucketPrivate: true }
  }

  async function fixture() {
    const response = await isolatedRequest(keys, `${fixturePath}&select=id,name,name_cn,status,publication_status,updated_at,visit_date,description,image_url,images`)
    assert.ok(response.ok, 'ISOLATED_FIXTURE_READ_FAILED')
    const [row] = await response.json()
    assert.ok(row?.id === SPOT_ID && row.name === 'Consumer Fixture 92061' && row.updated_at, 'UNEXPECTED_FIXTURE')
    return row
  }

  report.boundaryBefore = await boundary()
  const original = await fixture()
  assert.equal(original.publication_status, 'hidden')
  assert.equal(original.status, 'active')
  let version = original.updated_at
  let changed = false
  let renderer

  async function patch(fields) {
    const next = new Date(Math.max(Date.now(), Date.parse(version) + 1)).toISOString()
    const response = await isolatedRequest(keys, `${fixturePath}&updated_at=eq.${encodeURIComponent(version)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ ...fields, updated_at: next }),
    })
    assert.ok(response.ok, 'ISOLATED_FIXTURE_PATCH_FAILED')
    const rows = await response.json()
    assert.ok(rows.length === 1 && rows[0].id === SPOT_ID && Date.parse(rows[0].updated_at) === Date.parse(next), 'FIXTURE_CAS_CONFLICT')
    version = rows[0].updated_at
    changed = true
  }

  async function readProjection() {
    const response = await isolatedRequest(keys, '/rest/v1/rpc/jnq_public_spots', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_ids: [SPOT_ID] }),
    })
    assert.ok(response.ok, 'PUBLIC_PROJECTION_FAILED')
    return verifiedProjection(await response.json())
  }

  async function prepare() {
    const assets = await createMediaPreparer({ root: ROOT + path.sep, keys, token, fixtureIds: [SPOT_ID], resume: Boolean(prior) })
    let mediaPath
    if (prior) {
      const [entry] = assets.report.media
      assert.ok(assets.report.media.length === 1 && entry?.registered && entry.id === SPOT_ID && '/'+entry.key === prior.media.path)
      mediaPath = prior.media.path
    } else [mediaPath] = await assets.prepare(SPOT_ID, 1)
    report.media = { path: mediaPath, sha256: assets.report.sha256 }
    renderer = runNext(['start', '--hostname', '127.0.0.1', '--port', '4417'], 'ignore')
    for (let i = 0; i < 60; i++) {
      if (renderer.exitCode !== null) throw Error('RENDERER_EXITED')
      try { await (await fetch(`${LOCAL}/icon.png`, { signal: AbortSignal.timeout(1000) })).body?.cancel(); return mediaPath } catch {}
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    throw Error('RENDERER_NOT_READY')
  }

  async function put(key, bytes, contentType) {
    const upload = await r2(key, { method: 'PUT', headers: { 'Content-Type': contentType, 'If-None-Match': '*' }, body: bytes })
    const value = await upload.json()
    assert.ok(upload.ok && value.success && value.result.key === key && value.result.version && value.result.etag && Number(value.result.size) === bytes.length, 'PRIVATE_SNAPSHOT_UPLOAD_FAILED')
    const check = await r2(key)
    const etag = check.headers.get('etag')?.replace(/^W\//, '').replaceAll('"', '')
    assert.ok(check.ok && etag === value.result.etag && digest(Buffer.from(await check.arrayBuffer())) === digest(bytes), 'PRIVATE_SNAPSHOT_READBACK_FAILED')
    return { sha256: digest(bytes), bytes: bytes.length, etag: value.result.etag, version: value.result.version }
  }

  async function capture(label) {
    const row = await readProjection()
    assert.ok(row && row.updated_at === version, 'CAPTURE_PROJECTION_NOT_CURRENT')
    const revision = await projectionHash(row)
    await writeFile(path.join(SITE, 'snapshot-row.json'), JSON.stringify(row))
    const targets = [
      ['home-html', '/', 'text/html'], ['home-rsc', '/', 'text/x-component'],
      ['zh-html', ZH, 'text/html'], ['zh-rsc', ZH, 'text/x-component'],
      ['en-html', EN, 'text/html'], ['en-json', dataPath, 'application/json'],
      ['locations-json', '/api/locations', 'application/json'], ['spot-json', `/api/spots/${SLUG}`, 'application/json'],
    ]
    const objects = {}
    const local = path.join(ROOT, label)
    await mkdir(local)
    for (const [name, route, type] of targets) {
      const response = await fetch(LOCAL + route, { redirect: 'manual', signal: AbortSignal.timeout(30000), headers: type === 'text/x-component' ? { RSC: '1' } : {} })
      const bytes = Buffer.from(await response.arrayBuffer())
      const text = bytes.toString('utf8')
      assert.ok(response.ok && response.headers.get('content-type')?.startsWith(type) && bytes.length > 0 && bytes.length <= 2 * 1024 * 1024, `RENDER_${name}_HTTP_${response.status}`)
      assert.ok(text.includes(String(SPOT_ID)) && text.includes(row.name), `RENDER_${name}_FIXTURE_MISSING`)
      assert.ok(!text.includes(keys.service) && !text.includes('pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev'), `RENDER_${name}_SENSITIVE_OR_LEGACY_SOURCE`)
      if (name === 'en-json') assert.equal(JSON.parse(text).pageProps.data.spot.id, SPOT_ID)
      if (name === 'home-html') assert.ok(text.includes(`href="${ZH}"`), 'HOME_FIXTURE_LINK_MISSING')
      await writeFile(path.join(local, name), bytes, { flag: 'wx' })
      objects[name] = await put(`${prefix}/${revision}/${name}-${digest(bytes)}`, bytes, type)
    }
    assert.equal(await projectionHash(await readProjection()), revision, 'PROJECTION_CHANGED_DURING_RENDER')
    const manifest = { buildId: build.buildId, spotId: SPOT_ID, revision, updatedAt: row.updated_at, objects }
    // Manifest is written last, so partially uploaded representations cannot
    // become readable. Current revision selection requires no mutable pointer.
    await put(`${prefix}/${revision}/manifest.json`, Buffer.from(JSON.stringify(manifest)), 'application/json')
    report.releases.push({ label, ...manifest })
    return manifest
  }

  async function packageAssets() {
    await mkdir(output)
    const items = []
    async function copyTree(source, relative) {
      for (const item of await readdir(source, { withFileTypes: true })) {
        const file = path.join(source, item.name)
        const name = `${relative}/${item.name}`
        if (item.isDirectory()) await copyTree(file, name)
        else if (item.isFile() && /\.(js|css|woff2|woff|ttf|png|svg|ico)$/.test(item.name)) {
          const bytes = await readFile(file)
          assert.ok(bytes.length <= 25 * 1024 * 1024)
          if (/\.(js|css|svg)$/.test(name)) {
            const text = bytes.toString('utf8')
            assert.ok(!text.includes(keys.service) && !text.includes('Consumer Fixture 92061') && !text.includes('pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev'), `UNSAFE_STATIC_ASSET_${name}`)
          }
          const destination = path.join(output, name)
          await mkdir(path.dirname(destination), { recursive: true })
          await copyFile(file, destination)
          items.push({ path: '/'+name, bytes: bytes.length, sha256: digest(bytes) })
        }
      }
    }
    await copyTree(path.join(SITE, '.next/static'), '_next/static')
    await copyTree(path.join(SITE, 'public/fonts'), 'fonts')
    for (const name of ['icon.png', 'apple-icon.png', 'favicon.ico']) {
      const response = await fetch(LOCAL + '/' + name, { redirect: 'manual' })
      if (!response.ok) { await response.body?.cancel(); continue }
      const bytes = Buffer.from(await response.arrayBuffer())
      assert.ok(response.headers.get('content-type')?.startsWith('image/'))
      await writeFile(path.join(output, name), bytes, { flag: 'wx' })
      items.push({ path: '/'+name, bytes: bytes.length, sha256: digest(bytes) })
    }
    for (const name of ['snapshot-gateway.mjs','publication-gate.mjs','worker.mjs','legacy-media-preview.mjs','spot-contract.mjs','media-identity.mjs']) {
      const workerDir = path.join(output, '_worker.js')
      await mkdir(workerDir, { recursive: true })
      await copyFile(`cloudflare/spot-loop/${name}`, path.join(workerDir, name === 'snapshot-gateway.mjs' ? 'index.js' : name))
    }
    await writeFile(path.join(output, '_routes.json'), JSON.stringify({ version: 1, include: ['/*'], exclude: STATIC_EXCLUDES }))
    await writeFile(path.join(output, '_headers'), '/*\n  X-Robots-Tag: noindex, nofollow\n  X-Content-Type-Options: nosniff\n')
    await writeFile(path.join(ROOT, 'assets.json'), JSON.stringify(items, null, 2))
    report.staticFiles = items.length
    report.staticBytes = items.reduce((sum, item) => sum + item.bytes, 0)
    report.routes = { include: ['/*'], exclude: STATIC_EXCLUDES }
    assert.ok(items.length > 0 && items.length < 20000)
  }

  async function deploy() {
    await packageAssets()
    const config = {
      name: PROJECT, pages_build_output_dir: './out', compatibility_date: '2026-11-08',
      vars: { SUPABASE_URL: ISOLATED_ORIGIN, SNAPSHOT_BUILD_ID: build.buildId, SNAPSHOT_PREFIX: prefix, SNAPSHOT_EXPIRES_AT: String(expiresAt) },
      r2_buckets: [{ binding: 'TEST_MEDIA', bucket_name: BUCKET, preview_bucket_name: BUCKET }],
    }
    await writeFile(path.join(ROOT, 'wrangler.jsonc'), JSON.stringify(config, null, 2))
    const ids = new Set((await cf('/deployments')).map(entry => entry.id))
    const branch = 'codex/snapshot-poc'
    const commit = (await run('git', ['rev-parse', 'HEAD'], { windowsHide: true })).stdout.trim()
    try {
      await run(process.execPath, [process.env.JNQ_WRANGLER_CLI, 'pages', 'deploy', output, '--project-name', PROJECT, '--branch', branch, '--commit-hash', commit, '--commit-dirty=true'], { cwd: ROOT, windowsHide: true, maxBuffer: 4 * 1024 * 1024, timeout: 120000 })
    } catch (error) {
      const message = String(error.stderr || error.message || '').replaceAll(token, '[redacted]').replaceAll(keys.service, '[redacted]')
      report.deployError = message.split(/\r?\n/).filter(line => /ERROR|code:|failed|Invalid/i.test(line)).slice(-8).join(' ').slice(0, 600)
      throw Error('PAGES_PREVIEW_DEPLOY_FAILED')
    }
    const deployment = (await cf('/deployments')).find(item => !ids.has(item.id) && item.environment === 'preview' && item.deployment_trigger?.metadata?.branch === branch && item.latest_stage?.status === 'success')
    assert.ok(deployment?.aliases?.includes(ORIGIN), 'PREVIEW_NOT_CONFIRMED')
    const actual = await cf('/deployments/'+deployment.id)
    assert.equal(actual.r2_buckets.TEST_MEDIA.name, BUCKET)
    assert.equal(actual.env_vars.SUPABASE_SERVICE_ROLE_KEY.type, 'secret_text')
    for (const [key, value] of Object.entries(config.vars)) assert.equal(actual.env_vars[key].value, value)
    report.boundaryAfterDeploy = await boundary()
    const record = { deploymentId: deployment.id, environment: 'preview', success: true, origin: ORIGIN, expiresAt, buildId: build.buildId }
    await writeFile(path.join(ROOT, 'deployment.json'), JSON.stringify(record, null, 2), { flag: 'wx' })
    return record
  }

  async function revoke(mediaPath) {
    assert.equal(mediaPath, report.media?.path)
    const response = await isolatedRequest(keys, '/rest/v1/rpc/jnq_media_revoke', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_spot: SPOT_ID, p_key: mediaPath.slice(1) }),
    })
    assert.ok(response.ok && await response.json() === true, 'FIXTURE_MEDIA_REVOCATION_FAILED')
    const row = await fixture()
    assert.equal(row.publication_status, 'hidden')
    version = row.updated_at
  }

  async function cleanup() {
    renderer?.kill()
    if (changed) {
      const { name_cn, status, publication_status, visit_date, description, image_url, images } = original
      await patch({ name_cn, status, publication_status, visit_date, description, image_url, images })
      report.fixtureRestoredHidden = (await fixture()).publication_status === 'hidden'
    }
    report.boundaryFinal = await boundary()
  }

  return { prepare, patch, capture, deploy, revoke, cleanup }
}
