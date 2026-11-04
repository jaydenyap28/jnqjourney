const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const { assertPreviewIsolation } = require('../scripts/lib/preview-isolation-policy.cjs')
const safe = { VERCEL_ENV: 'preview', VERCEL_URL: 'jnq-test-branch.vercel.app',
  JNQ_PREVIEW_SUPABASE_PROJECT_REF: 'rnamstwwbzknwbjwdgrf',
  NEXT_PUBLIC_SUPABASE_URL: 'https://rnamstwwbzknwbjwdgrf.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_synthetic_public_key' }

function loader(env = safe, mocks = {}, globals = {}) {
  const cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const exports = {}; cache.set(file, exports)
    const context = { exports, process: { env }, console, URL, URLSearchParams, Request, Response, Headers, AbortSignal, Buffer, setTimeout, clearTimeout, ...globals,
      require(id) {
        if (id in mocks) return mocks[id]
        if (id === 'server-only') return {}
        if (id === 'next/server') return require(id)
        if (id === 'next/cache') return { unstable_cache: fn => fn }
        if (id === '@/lib/preview-safety') return load('lib/preview-safety.ts')
        if (id === '@/lib/server/admin-auth') return load('lib/server/admin-auth.ts')
        if (id === '@/lib/server/supabase-read-key' || id === './supabase-read-key') return load('lib/server/supabase-read-key.ts')
        if (id === '@/lib/server/package-visibility') return load('lib/server/package-visibility.ts')
        if (id === './public-fallback-snapshot') return load('lib/server/public-fallback-snapshot.ts')
        if (id === 'react') return { cache: fn => fn }
        if (id.startsWith('@/')) return mocks.__unknown || {}
        if (id === './scripts/lib/preview-isolation-policy.cjs') return { assertPreviewIsolation }
        if (id === './scripts/lib/font-entry.cjs') return require('../scripts/lib/font-entry.cjs')
        return require(id)
      } }
    const source = fs.readFileSync(file, 'utf8').replace(/import\.meta\.url/g, JSON.stringify(require('node:url').pathToFileURL(require('node:path').resolve(file)).href))
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText, context, { filename: file })
    return exports
  }
  return load
}
test('Preview rejects inherited writers and analytics without exposing synthetic values; Production is unchanged', () => {
  assert.doesNotThrow(() => assertPreviewIsolation(safe))
  const fakeJWT = role => `synthetic.${Buffer.from(JSON.stringify({ role, ref: safe.JNQ_PREVIEW_SUPABASE_PROJECT_REF })).toString('base64url')}.synthetic`
  assert.doesNotThrow(() => assertPreviewIsolation({ ...safe, NEXT_PUBLIC_SUPABASE_ANON_KEY: fakeJWT('anon') }))
  for (const key of ['sb_secret_synthetic', fakeJWT('service_role'), fakeJWT('authenticated')]) {
    assert.throws(() => assertPreviewIsolation({ ...safe, NEXT_PUBLIC_SUPABASE_ANON_KEY: key }), /NEXT_PUBLIC_SUPABASE_ANON_KEY/)
  }
  for (const key of ['SUPABASE_SERVICE_ROLE_KEY','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','NEXT_PUBLIC_GA_MEASUREMENT_ID','JNQ_BUDGET_SYNC_SECRET','OPENAI_API_KEY']) {
    assert.throws(() => assertPreviewIsolation({ ...safe, [key]: 'do-not-echo-this-synthetic-value' }), error => error.message.includes(key) && !error.message.includes('do-not-echo-this-synthetic-value'))
  }
  assert.doesNotThrow(() => assertPreviewIsolation({ VERCEL_ENV: 'production', SUPABASE_SERVICE_ROLE_KEY: 'synthetic' }))
  assert.doesNotThrow(() => assertPreviewIsolation({ VERCEL_ENV: 'development' }))
})
test('Preview requires the pinned test project and bundled fixture sources', () => {
  for (const patch of [
    { JNQ_PREVIEW_SUPABASE_PROJECT_REF: '' }, { NEXT_PUBLIC_SUPABASE_URL: 'https://other-project.supabase.co' },
    { JNQ_PREVIEW_SUPABASE_PROJECT_REF: 'vrufunuomioczocdsoer', NEXT_PUBLIC_SUPABASE_URL: 'https://vrufunuomioczocdsoer.supabase.co' },
    { NEXT_PUBLIC_SUPABASE_ANON_KEY: '' }, { VERCEL_URL: 'www.jnqjourney.com' }, { NEXT_PUBLIC_SITE_URL: 'https://www.jnqjourney.com' },
    { PUBLIC_DATA_CDN_BASE_URL: 'https://test-cdn.example' },
    { PUBLIC_DATA_CDN_BASE_URL: 'https://other.example', JNQ_PREVIEW_PUBLIC_DATA_ORIGIN: 'https://test-cdn.example' },
    { PUBLIC_DATA_CDN_BASE_URL: 'https://user:private@test-cdn.example', JNQ_PREVIEW_PUBLIC_DATA_ORIGIN: 'https://test-cdn.example' },
    { PUBLIC_DATA_CDN_BASE_URL: 'https://www.jnqjourney.com', JNQ_PREVIEW_PUBLIC_DATA_ORIGIN: 'https://www.jnqjourney.com' },
  ]) assert.throws(() => assertPreviewIsolation({ ...safe, ...patch }))
  assert.throws(() => assertPreviewIsolation({ ...safe, PUBLIC_DATA_CDN_BASE_URL: 'https://test-cdn.example/assets', R2_PUBLIC_BASE_URL: 'https://test-cdn.example', JNQ_PREVIEW_PUBLIC_DATA_ORIGIN: 'https://test-cdn.example' }))
})
test('next.config enforces isolation before build and attaches noindex to every Preview response', async () => {
  const config = loader(safe)('next.config.mjs').default
  assert.equal(config.env.JNQ_PREVIEW_READ_ONLY, '1')
  const rules = await config.headers()
  assert.equal(rules[0].source, '/:path*')
  assert.equal(rules[0].headers[0].value, 'noindex, nofollow, noarchive')
  assert.throws(() => loader({ ...safe, SUPABASE_SERVICE_ROLE_KEY: 'synthetic' })('next.config.mjs'))
  const production = loader({ VERCEL_ENV: 'production' })('next.config.mjs').default
  assert.equal(production.env.JNQ_PREVIEW_READ_ONLY, '0')
  assert.equal((await production.headers()).length, 0)
})
test('Preview canonical origin ignores inherited production SITE_URL; robots blocks crawling without sitemap', () => {
  const load = loader({ ...safe, NEXT_PUBLIC_SITE_URL: 'https://www.jnqjourney.com', SITE_URL: 'https://www.jnqjourney.com' })
  assert.equal(load('lib/site.ts').getSiteUrl().origin, 'https://jnq-test-branch.vercel.app')
  const robots = load('app/robots.ts').default()
  assert.equal(robots.rules.disallow, '/')
  assert.equal(robots.sitemap, undefined)
  assert.throws(() => loader({ VERCEL_ENV: 'preview' })('lib/site.ts').getSiteUrl())
  assert.equal(loader({ VERCEL_ENV: 'production', SITE_URL: 'https://www.jnqjourney.com' })('lib/site.ts').getSiteUrl().origin, 'https://www.jnqjourney.com')
})

function queryClient(selections) {
  return { from(table) {
    const value = { data: [], error: null }
    const query = new Proxy({}, { get(_, key) {
      if (key === 'then') return (resolve, reject) => Promise.resolve(value).then(resolve, reject)
      if (key === 'maybeSingle') return async () => ({ data: null, error: null })
      return (...args) => { if (key === 'select') selections.push({ table, select: args[0] }); return query }
    } })
    return query
  } }
}
test('actual public readers use only anonymous key in Preview and retain the Production key policy', async () => {
  const keys = [], selections = []
  const createClient = (_url, key) => { keys.push(key); return queryClient(selections) }
  const env = { ...safe, SUPABASE_SERVICE_ROLE_KEY: 'inherited-secret-must-not-be-selected' }
  const load = loader(env, {
    '@supabase/supabase-js': { createClient },
    '@/lib/spot-redirect': { resolveSpotRouting: async (_id, read) => read(1) },
    '@/lib/public-region-media': { resolvePublicRegionMedia: regions => regions },
    '@/lib/public-data': { hasValidCoordinates: () => true },
    '@/lib/spot-content': { isSpotPublished: () => true },
  }, { fetch: async (_url, init) => {
    keys.push(init.headers.apikey)
    return Response.json([])
  } })
  await load('lib/server/spot-routing.ts').readSpotRouting(1)
  const packages = load('lib/server/travel-packages.ts')
  await packages.readPublishedPackagesUncached(); await packages.readPublishedPackage('fixture'); await packages.readPublishedPackageOptions(1)
  await load('lib/server/public-spot-resolver.ts').readAuthoritativePublicSpotById(1)
  await load('lib/server/public-data-resolver.ts').resolvePublicSnapshotBundleUncached()
  await load('app/api/package-visibility/[slug]/route.ts').GET(new Request('https://test.invalid'), { params: { slug: 'fixture' } })
  await load('app/api/affiliate-links/route.ts').GET(new Request('https://test.invalid/api/affiliate-links?locationId=1'))
  assert.equal(keys.length, 8)
  assert.ok(keys.every(key => key === safe.NEXT_PUBLIC_SUPABASE_ANON_KEY))
  assert.ok(selections.some(item => item.table === 'locations'))
  assert.ok(selections.some(item => item.table === 'travel_package_options'))
  const production = loader({ ...env, VERCEL_ENV: 'production' })('lib/server/supabase-read-key.ts')
  assert.equal(production.supabaseReadKey(true), env.SUPABASE_SERVICE_ROLE_KEY)
  assert.equal(loader({ NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public' })('lib/server/supabase-read-key.ts').supabaseReadKey(true), undefined)
})
test('private source client factories cannot use inherited Service Role in Preview', () => {
  for (const file of ['guides-store.ts','notes-store.ts','location-slugs-store.ts','klook-widgets-store.ts','guide-price-highlights-store.ts','guide-budget-store.ts']) {
    const target = `lib/server/${file}`
    const ast = ts.createSourceFile(target, fs.readFileSync(target, 'utf8'), ts.ScriptTarget.Latest, true)
    const name = file === 'guide-budget-store.ts' ? 'getBudgetAdminClient' : 'getAdminSupabaseClient'
    const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)
    assert.ok(node)
    const context = { process: { env: { VERCEL_ENV: 'preview', SUPABASE_SERVICE_ROLE_KEY: 'synthetic' } }, createClient: () => assert.fail(`Private client constructed in ${file}`), exports: {} }
    vm.runInNewContext(ts.transpileModule(`${node.getText(ast)}; exports.factory = ${name}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
    if (file === 'guide-budget-store.ts') assert.throws(() => context.exports.factory(), /Preview/)
    else assert.equal(context.exports.factory(), null)
  }
})
test('R2 and localization publishing fail before SDK construction even with inherited settings', () => {
  const reject = () => assert.fail('No SDK construction or outgoing request in Preview')
  const load = loader({ ...safe, R2_ACCESS_KEY_ID: 'synthetic', R2_SECRET_ACCESS_KEY: 'synthetic' }, {
    '@aws-sdk/client-s3': { S3Client: reject, PutObjectCommand: reject }, '@supabase/supabase-js': { createClient: reject },
    '../localization.ts': { isLocalizedTextPath: () => true },
  })
  assert.throws(() => load('lib/server/r2.ts').assertR2Env(), /Preview/)
  assert.throws(() => load('lib/server/localization-publisher.mjs').createLocalizationIO(), /Preview/)
})
test('Preview skips external affiliate metadata fetch and never mounts or executes dynamic Klook code', async () => {
  const load = loader({ ...safe, JNQ_PREVIEW_READ_ONLY: '1' }, {}, { fetch: () => assert.fail('External tracking URL requested') })
  const response = await load('app/api/affiliate-preview/route.ts').GET(new Request('https://test.invalid/api/affiliate-preview?url=https://affiliate.test/click'))
  assert.equal((await response.json()).skipped, true)
  let effects = 0
  const react = require('react')
  const Component = loader({ JNQ_PREVIEW_READ_ONLY: '1' }, {
    react: { ...react, useMemo: fn => fn(), useId: () => 'widget', useEffect: fn => { effects++; fn() } },
  }, { document: new Proxy({}, { get() { assert.fail('Widget touched DOM') } }) })('components/KlookWidgetEmbed.tsx').default
  const tree = Component({ code: '<script src="https://affiliate.test/pixel.js"></script>' })
  const html = require('react-dom/server').renderToStaticMarkup(tree)
  assert.equal(effects, 1)
  assert.ok(html.includes('disabled'))
  assert.ok(!html.includes('affiliate.test') && !html.includes('data-jnq-widget-code'))
})
test('all candidate route writers and sync endpoints remain blocked with inherited privileged credentials', async () => {
  const unexpected = () => { throw Error('Unexpected dependency call before Preview guard') }
  const unknown = new Proxy(unexpected, { get: () => unexpected })
  const load = loader({ ...safe, SUPABASE_SERVICE_ROLE_KEY: 'synthetic', R2_SECRET_ACCESS_KEY: 'synthetic' }, {
    __unknown: unknown,
    '@/lib/server/storage-admin': { getStorageBucketName: () => 'fixture' },
    '@supabase/supabase-js': { createClient: unexpected },
    '@aws-sdk/client-s3': unknown,
  })
  const files = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`])
  let checked = 0
  for (const file of [...files('app/api/admin'), 'app/api/upload/r2/route.ts'].filter(f => f.endsWith('/route.ts'))) {
    const route = load(file)
    for (const method of ['GET','POST','PUT','PATCH','DELETE']) {
      if (typeof route[method] !== 'function') continue
      const response = await route[method](new Request('https://test.invalid/api/admin', { method: 'POST', body: '{}' }), { params: { id: '1', slug: 'fixture' } })
      assert.equal(response.status, 503, `${file} ${method}`); checked++
    }
  }
  assert.ok(checked >= 35)
  for (const file of files('pages/api/admin').filter(f => f.endsWith('.ts'))) {
    let status, payload
    const res = { setHeader() {}, status(value) { status = value; return res }, json(value) { payload = value; return res }, end() {} }
    await load(file).default({ method: 'POST', headers: {}, query: { id: '1' }, body: {} }, res)
    assert.equal(status, 503, file)
    assert.equal(payload.code, 'PREVIEW_READ_ONLY', file)
  }
  for (const file of ['app/api/page-view/route.ts', 'app/api/affiliate-click/route.ts']) {
    const response = await load(file).POST(new Request('https://test.invalid', { method: 'POST', body: '{}' }))
    assert.equal((await response.json()).reason, 'preview-read-only')
  }
})
