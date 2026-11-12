import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdir, readFile, readdir, realpath, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import { ACCOUNT, privateWranglerToken } from './candidate-cloudflare.mjs'
import { connectFormalReadSource } from './formal-read-source.mjs'
import { FORMAL_ADMIN_API, FORMAL_PROJECT } from '../../cloudflare/admin-preview/formal-admin-read.mjs'

const [mode, ref] = process.argv.slice(2)
assert.ok(['--preflight', '--edge', '--pages', '--verify-pages'].includes(mode) && ref === FORMAL_PROJECT)
const workspace = path.resolve(process.env.JNQ_RECOVERY_WORKSPACE || '.')
assert.ok(process.env.JNQ_RECOVERY_WORKSPACE && await realpath(workspace) === workspace)
const root = path.join(workspace, 'production-publisher')
const projectName = 'jnqjourney-admin-formal'
const branch = 'read-only'
const origin = `https://${branch}.${projectName}.pages.dev`
const currentProduction = '333e51aa-506e-4a66-a7c6-4f28e3e890a1'
const run = promisify(execFile)
const json = file => readFile(file, 'utf8').then(text => JSON.parse(text.replace(/^\uFEFF/, '')))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const cli = process.env.JNQ_SUPABASE_CLI
const wrangler = process.env.JNQ_WRANGLER_CLI
assert.ok(cli && wrangler)
const settings = await json(path.join(root, 'settings.json'))
const roles = await json(path.join(root, 'verified-operator-allowlists.json'))
assert.ok(settings.projectRef === FORMAL_PROJECT && roles.projectRef === FORMAL_PROJECT &&
  settings.enabled === false && roles.enabled === false)
assert.equal(settings.formalAdminPagesProject, projectName)
assert.deepEqual(settings.formalEditorAuthIds, roles.editorAuthIds)
assert.deepEqual(settings.formalPublisherAuthIds, roles.publisherAuthIds)
assert.ok(roles.editorAuthIds.length && roles.publisherAuthIds.length)
const source = await connectFormalReadSource()
for (const id of new Set([...roles.editorAuthIds, ...roles.publisherAuthIds])) {
  assert.equal(await source.confirmedOperator(id), id)
}
const token = await privateWranglerToken()
async function cloud(resource = '', method = 'GET', body) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/pages/projects/${resource}`, {
    method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, redirect: 'error', signal: AbortSignal.timeout(20000),
  })
  if (method === 'GET' && response.status === 404) return null
  const value = await response.json()
  assert.ok(response.ok && value.success, 'FORMAL_ADMIN_PAGES_HTTP_' + response.status)
  return value.result
}
const publicBefore = await cloud('jnqjourney-static-recovery-candidate')
assert.equal(publicBefore.canonical_deployment?.id, currentProduction)
const publicFingerprint = sha(JSON.stringify({
  canonical: publicBefore.canonical_deployment.id, domains: publicBefore.domains,
  configs: publicBefore.deployment_configs, branch: publicBefore.production_branch,
}))
async function checkPublicSite() {
  const after = await cloud('jnqjourney-static-recovery-candidate')
  assert.equal(sha(JSON.stringify({ canonical: after.canonical_deployment?.id, domains: after.domains,
    configs: after.deployment_configs, branch: after.production_branch })), publicFingerprint, 'PUBLIC_SITE_CONFIGURATION_CHANGED')
}
async function supabase(args) {
  try {
    return await run(process.execPath, [cli, ...args, '--project-ref', FORMAL_PROJECT], {
      windowsHide: true, timeout: 180000, maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' },
    })
  } catch { throw Error('FORMAL_ADMIN_CLI_FAILED_RECONCILE_BEFORE_RETRY') }
}
const functions = async () => JSON.parse((await supabase(['functions', 'list', '--output', 'json'])).stdout)
function adminBoundary(project) {
  assert.equal(project?.name, projectName)
  assert.equal(project.production_branch, 'reserved-production')
  assert.ok(!project.source && !project.canonical_deployment)
  assert.deepEqual(project.domains, [projectName + '.pages.dev'])
  for (const cfg of Object.values(project.deployment_configs || {})) {
    for (const type of ['env_vars', 'r2_buckets', 'kv_namespaces', 'd1_databases', 'services', 'durable_object_namespaces']) {
      assert.equal(Object.keys(cfg[type] || {}).length, 0)
    }
  }
}

try {
  if (mode === '--preflight') {
    const before = await functions()
    assert.ok(!before.some(item => item.slug === FORMAL_ADMIN_API), 'FORMAL_FUNCTION_ALREADY_EXISTS_RECONCILE')
    const project = await cloud(projectName)
    if (project) adminBoundary(project)
    console.log(JSON.stringify({ projectRef: FORMAL_PROJECT, editors: roles.editorAuthIds.length,
      publishers: roles.publisherAuthIds.length, functionExists: false, adminProjectExists: Boolean(project),
      adminOrigin: origin, production: currentProduction, writesEnabled: false, publishEnabled: false }))
  } else if (mode === '--edge') {
    const before = await functions()
    assert.ok(!before.some(item => item.slug === FORMAL_ADMIN_API), 'FORMAL_FUNCTION_ALREADY_EXISTS_RECONCILE')
    const work = path.join(root, 'read-only-edge')
    const folder = path.join(work, 'supabase/functions', FORMAL_ADMIN_API)
    await mkdir(folder, { recursive: true })
    const { build } = await import(pathToFileURL(path.resolve(path.dirname(wrangler), '../../esbuild/lib/main.js')).href)
    await build({ entryPoints: ['cloudflare/admin-preview/formal-edge.ts'], bundle: true, format: 'esm',
      platform: 'neutral', target: 'es2022', external: ['npm:*'], outfile: path.join(folder, 'index.ts') })
    const bundle = await readFile(path.join(folder, 'index.ts'))
    await writeFile(path.join(work, 'supabase/config.toml'),
      `project_id = "jnq-admin-formal-read-only"\n[functions.${FORMAL_ADMIN_API}]\nverify_jwt = true\nentrypoint = "./functions/${FORMAL_ADMIN_API}/index.ts"\n`)
    const environment = path.join(work, '.formal-read-only.env')
    const secrets = { JNQ_FORMAL_ADMIN_ORIGIN: origin, JNQ_FORMAL_EDITOR_IDS: roles.editorAuthIds.join(','),
      JNQ_FORMAL_PUBLISHER_IDS: roles.publisherAuthIds.join(',') }
    await writeFile(environment, Object.entries(secrets).map(([key, value]) => key + '=' + value).join('\n') + '\n', { flag: 'wx' })
    try { await supabase(['secrets', 'set', '--env-file', environment]) }
    finally { await unlink(environment) }
    await writeFile(path.join(root, 'read-only-edge-submission.json'), JSON.stringify({
      projectRef: FORMAL_PROJECT, function: FORMAL_ADMIN_API, sha256: sha(bundle),
      requestedAt: new Date().toISOString(), writesEnabled: false, publishEnabled: false,
    }), { flag: 'wx' })
    await supabase(['functions', 'deploy', FORMAL_ADMIN_API, '--workdir', work, '--use-api', '--yes'])
    const deployed = (await functions()).find(item => item.slug === FORMAL_ADMIN_API)
    assert.ok(deployed?.status === 'ACTIVE' && deployed.verify_jwt)
    const evidence = { projectRef: FORMAL_PROJECT, function: FORMAL_ADMIN_API, id: deployed.id,
      version: deployed.version, verifyJwt: true, adminOrigin: origin, sourceSha256: sha(bundle),
      writesEnabled: false, publishEnabled: false, deployedAt: new Date().toISOString() }
    await checkPublicSite()
    await writeFile(path.join(root, 'read-only-edge-deployment.json'), JSON.stringify(evidence, null, 2))
    console.log(JSON.stringify(evidence))
  } else {
    const pkg = await json(path.join(root, 'frontend-review/package.json'))
    const out = path.resolve(pkg.out)
    assert.ok(out.startsWith(path.join(root, 'frontend-review') + path.sep) && await realpath(out) === out &&
      pkg.zeroFunctions && pkg.readOnly && pkg.projectRef === FORMAL_PROJECT)
    const files = (await readdir(out, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile())
    assert.ok(files.length <= 20000 && files.every(entry => !['_worker.js', '_routes.json'].includes(entry.name)))
    await access(path.join(out, 'admin/login.html'))
    assert.match(await readFile(path.join(out, '_headers'), 'utf8'), /X-Robots-Tag: noindex/)
    const deny = ['rnamstwwbzknwbjwdgrf', ...roles.editorAuthIds, ...roles.publisherAuthIds]
    for (const file of files.filter(entry => /\.(html|js|json|txt)$/.test(entry.name))) {
      const body = await readFile(path.join(file.parentPath, file.name), 'utf8')
      for (const value of deny) assert.ok(!body.includes(value), 'PRIVATE_IDENTITY_OR_ISOLATED_TARGET_IN_FRONTEND')
      assert.doesNotMatch(body, /sb_secret_[A-Za-z0-9_-]{16,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/)
    }
    const journalFile = path.join(root, 'read-only-pages-submission.json')
    let journal
    if (mode === '--pages') {
      const existing = await cloud(projectName)
      const project = existing ?? await cloud('', 'POST', { name: projectName, production_branch: 'reserved-production' })
      adminBoundary(project)
      const commit = (await run('git', ['rev-parse', 'HEAD'], { windowsHide: true })).stdout.trim()
      journal = { project: projectName, branch, commit, submittedAt: new Date().toISOString() }
      await writeFile(journalFile, JSON.stringify(journal), { flag: 'wx' })
      await writeFile(path.join(root, 'wrangler.jsonc'), JSON.stringify({ name: projectName, pages_build_output_dir: out }), { flag: 'wx' })
      try {
        await run(process.execPath, [wrangler, 'pages', 'deploy', out,
          '--project-name', projectName, '--branch', branch, '--commit-hash', commit, '--commit-dirty=true', '--force'], {
          cwd: root, windowsHide: true, timeout: 180000, maxBuffer: 2 * 1024 * 1024,
          env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT, WRANGLER_SEND_METRICS: 'false' },
        })
      } catch { throw Error('ADMIN_UPLOAD_UNCERTAIN_USE_VERIFY_PAGES') }
    } else journal = await json(journalFile)
    adminBoundary(await cloud(projectName))
    const deployments = (await cloud(projectName + '/deployments')).filter(item =>
      item.environment === 'preview' && item.deployment_trigger?.metadata?.branch === journal.branch &&
      item.deployment_trigger.metadata.commit_hash === journal.commit &&
      Date.parse(item.created_on) >= Date.parse(journal.submittedAt) - 5000)
    assert.equal(deployments.length, 1, 'ADMIN_DEPLOYMENT_UNCONFIRMED')
    const [deployment] = deployments
    assert.ok(deployment.latest_stage?.status === 'success' && deployment.uses_functions === false)
    const response = await fetch(origin + '/admin/login', { redirect: 'error', signal: AbortSignal.timeout(20000) })
    assert.equal(response.status, 200)
    assert.match(response.headers.get('x-robots-tag') || '', /noindex/)
    await response.body?.cancel()
    await checkPublicSite()
    const evidence = { url: origin + '/admin/login', fixedUrl: deployment.url, deploymentId: deployment.id,
      project: projectName, branch, environment: 'preview', noindex: true, functions: 0,
      formalDataReadOnly: true, writesEnabled: false, publishEnabled: false }
    await writeFile(path.join(root, 'read-only-pages-deployment.json'), JSON.stringify(evidence, null, 2))
    console.log(JSON.stringify(evidence))
  }
} catch (error) {
  const message = typeof error.message === 'string' && /^[A-Z_0-9]+$/.test(error.message) ? error.message : 'FORMAL_ADMIN_VERIFICATION_FAILED'
  console.error(message)
  process.exitCode = 1
}
