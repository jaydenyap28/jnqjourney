import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { ACCOUNT, privateWranglerToken } from './candidate-cloudflare.mjs'
import { isolatedKeys } from './isolated-supabase.mjs'
import { ADMIN_ORIGIN, FIRST_SPOT_ID, FUNCTION, LAST_SPOT_ID, PAGES_BRANCH, PAGES_PROJECT, PRIVATE_BUCKET, PROJECT_REF, SUPABASE_ORIGIN } from '../../cloudflare/admin-preview/scope.mjs'

const [mode, ref] = process.argv.slice(2)
assert.ok(['--prepare', '--edge', '--pages', '--verify-pages'].includes(mode) && ref === PROJECT_REF)
const run = promisify(execFile)
const root = path.resolve('artifacts/cloudflare-admin-isolated')
await mkdir(root, { recursive: true })
const json = async file => JSON.parse(await readFile(file, 'utf8'))
const wrangler = process.env.JNQ_WRANGLER_CLI
const cli = process.env.JNQ_SUPABASE_CLI

if (mode === '--prepare') {
  const keys = await isolatedKeys()
  const identity = await json('cloudflare/spot-loop/.dev.vars.spot-loop-session')
  assert.equal(identity.projectRef, PROJECT_REF)
  const publicDb = createClient(SUPABASE_ORIGIN, keys.anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const login = await publicDb.auth.signInWithPassword({ email: identity.email, password: identity.password })
  assert.ok(!login.error && login.data.user?.id === identity.userId, 'ISOLATED_ADMIN_LOGIN_FAILED')
  const anonymous = createClient(SUPABASE_ORIGIN, keys.anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const access = await anonymous.from('locations').select('id').limit(1)
  assert.ok(access.error || access.data?.length === 0, 'ISOLATED_DIRECT_ANON_READ_ENABLED')
  await writeFile(path.join(root, 'anon-build.json'), JSON.stringify({ origin: SUPABASE_ORIGIN, key: keys.anon }))
  console.log(JSON.stringify({ isolatedProject: PROJECT_REF, adminLogin: true, anonymousDirectLocationsReadDenied: true }))
} else if (mode === '--edge') {
  assert.ok(wrangler && cli)
  const keys = await isolatedKeys()
  const identity = await json('cloudflare/spot-loop/.dev.vars.spot-loop-session')
  assert.equal(identity.projectRef, PROJECT_REF)
  const { build } = await import(pathToFileURL(path.resolve(path.dirname(wrangler), '../../esbuild/lib/main.js')).href)
  const work = path.join(root, 'edge')
  const folder = path.join(work, 'supabase/functions', FUNCTION)
  await mkdir(folder, { recursive: true })
  await build({
    entryPoints: ['cloudflare/admin-preview/index.ts'], bundle: true, format: 'esm',
    platform: 'neutral', target: 'es2022', external: ['npm:*'],
    alias: { '@': process.cwd() }, outfile: path.join(folder, 'index.ts'),
    plugins: [{ name: 'isolated-operator', setup(builder) {
      builder.onResolve({ filter: /^\.\/operator\.json$/ }, () => ({ path: 'admin', namespace: 'operator' }))
      builder.onLoad({ filter: /.*/, namespace: 'operator' }, () => ({
        contents: JSON.stringify({ adminId: identity.userId }), loader: 'json',
      }))
    } }],
  })
  const result = await readFile(path.join(folder, 'index.ts'), 'utf8')
  assert.ok(result.includes(PROJECT_REF) && !result.includes('vrufunuomioczocdsoer') && !result.includes(keys.service))
  const db = createClient(SUPABASE_ORIGIN, keys.service, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: bucket, error } = await db.storage.getBucket(PRIVATE_BUCKET)
  const functions = async () => JSON.parse((await run(process.execPath, [cli, 'functions', 'list', '--project-ref', PROJECT_REF, '--output', 'json'],
    { windowsHide: true, timeout: 30000 })).stdout)
  const before = (await functions()).find(item => item.slug === FUNCTION)
  if (!bucket) {
    assert.ok(!before && error, 'PRIVATE_STORE_MISSING_FOR_EXISTING_ADMIN')
    const rows = await db.from('locations').select('id').gte('id', FIRST_SPOT_ID).lte('id', LAST_SPOT_ID).limit(1)
    assert.ok(!rows.error && rows.data.length === 0, 'SPOT_FIXTURE_RANGE_OCCUPIED')
    const created = await db.storage.createBucket(PRIVATE_BUCKET, { public: false, fileSizeLimit: 8 * 1024 * 1024 })
    assert.ok(!created.error, 'ISOLATED_PRIVATE_BUCKET_CREATE_FAILED')
  } else {
    assert.equal(bucket.public, false, 'ADMIN_STORAGE_MUST_BE_PRIVATE')
  }
  const store = db.storage.from(PRIVATE_BUCKET)
  for (const collection of ['notes', 'guides', 'spot-english']) {
    const pointer = `_system/${collection}-latest.webp`
    const existing = await store.download(pointer)
    if (existing.data) continue
    const check = await store.list('_system', { search: collection + '-latest.webp', limit: 5 })
    const initializing = !before || (collection === 'spot-english' && before.version === 1)
    assert.ok(initializing && !check.error && !check.data.some(row => row.name === collection + '-latest.webp'), 'MISSING_EXISTING_AUTHORITY_POINTER')
    const version = `_system/${collection}/${Date.now()}.webp`
    const opts = { upsert: false, contentType: 'image/webp', cacheControl: '0' }
    assert.ok(!(await store.upload(version, '[]', opts)).error, 'ISOLATED_VERSION_SEED_FAILED')
    assert.ok(!(await store.upload(pointer, version, opts)).error, 'ISOLATED_POINTER_SEED_FAILED')
  }
  await writeFile(path.join(work, 'supabase/config.toml'),
    `project_id = "jnq-admin-isolated"\n[functions.${FUNCTION}]\nverify_jwt = true\nentrypoint = "./functions/${FUNCTION}/index.ts"\n`)
  try {
    await run(process.execPath, [cli, 'functions', 'deploy', FUNCTION, '--project-ref', PROJECT_REF,
      '--workdir', work, '--use-api', '--yes'], { windowsHide: true, timeout: 120000, maxBuffer: 2 * 1024 * 1024 })
  } catch (error) {
    // CLI output may include a credential or request body. Reconcile via list.
    throw new Error('ISOLATED_FUNCTION_DEPLOY_FAILED; CLI exit ' + String(error.code))
  }
  const deployed = (await functions()).find(item => item.slug === FUNCTION)
  assert.ok(deployed?.verify_jwt && deployed.status === 'ACTIVE')
  const evidence = { projectRef: PROJECT_REF, functionId: deployed.id, version: deployed.version, jwt: true, privateBucket: PRIVATE_BUCKET }
  await writeFile(path.join(root, 'edge-deployment.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify(evidence))
} else {
  assert.ok(wrangler)
  const bundle = await json(path.join(root, 'package.json'))
  const out = path.resolve(bundle.out)
  assert.ok(out.startsWith(root + path.sep) && path.basename(out) === 'out' && bundle.zeroFunctions)
  const token = await privateWranglerToken()
  const api = 'https://api.cloudflare.com/client/v4/accounts/' + ACCOUNT + '/pages/projects'
  async function request(resource, method = 'GET', payload) {
    const response = await fetch(api + resource, {
      method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: payload ? JSON.stringify(payload) : undefined, redirect: 'error', signal: AbortSignal.timeout(20000),
    })
    const data = await response.json()
    if (method === 'GET' && response.status === 404) return null
    assert.ok(response.ok && data.success, `ADMIN_PAGES_API_${response.status}_${data.errors?.[0]?.code ?? ''}`)
    return data.result
  }
  function boundary(project) {
    assert.equal(project.name, PAGES_PROJECT)
    assert.equal(project.production_branch, 'reserved-production')
    assert.ok(!project.canonical_deployment && !project.source)
    assert.ok((project.domains ?? []).every(domain => domain === PAGES_PROJECT + '.pages.dev'))
  }
  const existing = await request('/' + PAGES_PROJECT)
  assert.ok(existing || mode === '--pages', 'ADMIN_PREVIEW_PROJECT_NOT_FOUND')
  const project = existing ?? await request('', 'POST', { name: PAGES_PROJECT, production_branch: 'reserved-production' })
  boundary(project)
  const prior = new Set()
  if (mode === '--pages') {
    await writeFile(path.join(root, 'wrangler.jsonc'), JSON.stringify({ name: PAGES_PROJECT, pages_build_output_dir: out }))
    for (const row of await request('/' + PAGES_PROJECT + '/deployments')) prior.add(row.id)
    try {
      await run(process.execPath, [wrangler, 'pages', 'deploy', out, '--project-name', PAGES_PROJECT, '--branch', PAGES_BRANCH, '--commit-dirty=true'],
        { cwd: root, windowsHide: true, timeout: 180000, maxBuffer: 1024 * 1024, env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT, WRANGLER_SEND_METRICS: 'false' } })
    } catch (error) { throw new Error('ADMIN_PREVIEW_UPLOAD_FAILED; reconcile before retry; CLI exit ' + String(error.code)) }
  }
  boundary(await request('/' + PAGES_PROJECT))
  const deployment = (await request('/' + PAGES_PROJECT + '/deployments')).filter(row =>
    !prior.has(row.id) && row.environment === 'preview' && row.latest_stage?.status === 'success' &&
    row.uses_functions === false && row.deployment_trigger?.metadata?.branch === PAGES_BRANCH &&
    (row.aliases ?? []).some(alias => alias === ADMIN_ORIGIN || alias === new URL(ADMIN_ORIGIN).hostname))
  assert.equal(deployment.length, 1, 'ADMIN_PREVIEW_RESULT_AMBIGUOUS')
  const evidence = { url: ADMIN_ORIGIN + '/admin/login', fixedUrl: deployment[0].url, deploymentId: deployment[0].id, functions: 0, production: false }
  await writeFile(path.join(root, 'pages-submitted.json'), JSON.stringify(evidence, null, 2))
  const response = await fetch(ADMIN_ORIGIN + '/admin/login', { redirect: 'error', signal: AbortSignal.timeout(20000) })
  assert.ok(response.ok && response.headers.get('x-robots-tag')?.includes('noindex'))
  await response.body?.cancel()
  await writeFile(path.join(root, 'pages-deployment.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify(evidence))
}
