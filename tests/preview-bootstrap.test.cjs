const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { createClient } = require('@supabase/supabase-js')
const { loader } = require('./helpers/spot-travel-loader.cjs')
const { assertPreviewIsolation } = require('../scripts/lib/preview-isolation-policy.cjs')

const env = {
  VERCEL_ENV: 'preview', VERCEL_URL: 'jnq-fixture.vercel.app',
  VERCEL_GIT_COMMIT_REF: 'codex/jnq-preview-cpu', JNQ_PREVIEW_READ_ONLY: '1',
  JNQ_PREVIEW_SUPABASE_PROJECT_REF: 'rnamstwwbzknwbjwdgrf',
  NEXT_PUBLIC_SUPABASE_URL: 'https://rnamstwwbzknwbjwdgrf.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_synthetic_fixture',
}
const globals = {
  process: { env, cwd: process.cwd }, Headers, URLSearchParams,
  fetch: () => assert.fail('Unexpected external service call'),
}

test('Preview configuration rejects wrong projects, credentials, external sources and Production targeting', () => {
  assert.doesNotThrow(() => assertPreviewIsolation(env))
  for (const patch of [
    { NEXT_PUBLIC_SUPABASE_URL: 'https://vrufunuomioczocdsoer.supabase.co' },
    { JNQ_PREVIEW_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst' },
    { NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_secret_fixture' },
    { VERCEL_ENV: 'production' }, { VERCEL_ENV: '' },
    { VERCEL_TARGET_ENV: 'production' },
    ...['SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'YOUTUBE_API_KEY',
      'R2_SECRET_ACCESS_KEY', 'NEXT_PUBLIC_GA_MEASUREMENT_ID', 'NEXT_PUBLIC_MAPBOX_TOKEN',
      'PUBLIC_DATA_CDN_BASE_URL', 'R2_PUBLIC_BASE_URL', 'JNQ_PREVIEW_PUBLIC_DATA_ORIGIN']
      .map(key => ({ [key]: 'must-never-appear-in-diagnostics' })),
  ]) {
    assert.throws(() => assertPreviewIsolation({ ...env, ...patch }), error =>
      error.message.includes('rejected') && !error.message.includes('must-never-appear-in-diagnostics'))
  }
  const jwt = claims => `synthetic.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.synthetic`
  assert.doesNotThrow(() => assertPreviewIsolation({
    ...env, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt({ role: 'anon', ref: env.JNQ_PREVIEW_SUPABASE_PROJECT_REF }),
  }))
  assert.throws(() => assertPreviewIsolation({
    ...env, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt({ role: 'anon', ref: 'vrufunuomioczocdsoer' }),
  }))
  for (const VERCEL_ENV of ['development', 'production']) {
    assert.doesNotThrow(() => assertPreviewIsolation({ VERCEL_ENV }))
  }
})

test('Preview fixture readers reject production fallbacks and contain only local media', async () => {
  const load = loader({}, globals)
  const { readPreviewSnapshot } = load('lib/server/preview-fixtures.ts')
  for (const key of ['locations.json', 'regions.json', 'guides.json', 'notes.json', 'spots/fixture-lookout-91001.json']) {
    assert.doesNotMatch(JSON.stringify(readPreviewSnapshot(key)), /https?:|wa\.me|@|60109639228/)
  }
  assert.throws(() => readPreviewSnapshot('spots/production-449.json'))
  const source = load('lib/server/localization-snapshot.ts')
  await assert.rejects(source.readBundledJson('data/guides.json'), /production snapshot/)
  assert.deepEqual(await source.readBundledJson('data/location-slugs.json'), {})
  assert.equal((await source.readLocalizationSnapshot('en', true)).version, 'preview-fixtures')
  await assert.rejects(load('lib/server/public-fallback-snapshot.ts').readPublicFallbackSnapshot(), /disabled/)
  assert.deepEqual(await load('lib/server/location-slugs-store.ts').readLocationSlugMap(), {})
})

test('the actual Preview Next configuration uses local fonts and prevents browser service connections', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    const { default: config } = await import('./next.config.mjs')
    const fontEntry = (await import('node:fs')).readFileSync('./lib/build-fonts.generated.ts', 'utf8')
    console.log(JSON.stringify({ env: config.env, rules: await config.headers(), images: config.images, fontEntry }))
  `], { encoding: 'utf8', env: { ...env, PATH: process.env.PATH, SystemRoot: process.env.SystemRoot } })
  assert.equal(result.status, 0, result.stderr)
  const config = JSON.parse(result.stdout.trim())
  assert.equal(config.env.JNQ_PREVIEW_READ_ONLY, '1')
  assert.deepEqual(config.images.remotePatterns, [])
  assert.equal(config.rules[0].headers[0].value, 'noindex, nofollow, noarchive')
  const csp = config.rules[0].headers.find(rule => rule.key === 'Content-Security-Policy').value
  for (const directive of ["default-src 'self'", "frame-src 'none'", "form-action 'none'", "worker-src 'none'"]) {
    assert.ok(csp.includes(directive))
  }
  assert.match(config.fontEntry, /from '.\/preview-fonts'/)
  assert.doesNotMatch(config.fontEntry, /next\/font|from '.\/site-fonts'/)
})

test('Home, Spot, Guide, Note and Package entry points consume the isolated fixture sources', async t => {
  let requests = 0
  const reference = loader({}, globals)('lib/server/preview-fixtures.ts').readPreviewSnapshot
  const region = { id: 91000, name: 'Fixture Harbor', country: 'Malaysia', image_url: '/preview-fixture.svg' }
  const spot = { ...reference('spots/fixture-lookout-91001.json').spot, regions: region, status: 'active' }
  const item = {
    id: 91001, slug: 'fixture-package', title_zh: '测试配套', status: 'published', region_id: 91000,
    cover_image: '/preview-fixture.svg', related_location_ids: [spot.id],
    related_guide_slugs: ['fixture-guide'], related_note_slugs: ['fixture-note'],
  }
  const transport = async (input, init) => {
    requests++
    const url = new URL(input)
    assert.equal(url.origin, env.NEXT_PUBLIC_SUPABASE_URL)
    assert.equal(new Headers(init.headers).get('apikey'), env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    assert.equal(init.method || 'GET', 'GET')
    const table = url.pathname.split('/').at(-1)
    const rows = { locations: [spot], regions: [region], travel_packages: [item], travel_package_options: [], affiliate_links: [] }[table]
    assert.ok(rows, `Unexpected fixture table ${table}`)
    const matches = rows.filter(row => !url.searchParams.has('id') || url.searchParams.get('id') === `eq.${row.id}`)
    return Response.json(matches)
  }
  const navigation = { notFound: () => { throw new Error('Fixture page unexpectedly missing') }, redirect: () => { throw new Error('Unexpected fixture redirect') } }
  const component = () => null
  const load = loader({
    react: { ...require('react'), cache: fn => fn },
    '@supabase/supabase-js': { createClient: (url, key, options) => {
      assert.equal(url, env.NEXT_PUBLIC_SUPABASE_URL)
      assert.equal(key, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
      return createClient(url, key, { ...options, global: { fetch: transport, ...options?.global } })
    } },
    'next/navigation': navigation,
    '@/components/AppHomePageClient': { __esModule: true, default: component },
    '@/components/SpotPageView': { __esModule: true, default: component },
    '@/components/GuidePageView': { __esModule: true, default: component },
    '@/components/NoteInteractiveReader': { __esModule: true, default: component, NoteTableOfContents: component },
    '@/components/TravelPackageDetail': { __esModule: true, default: component },
    '@/components/TiomanPackageDetail': { __esModule: true, default: component },
  }, { ...globals, fetch: transport })

  const home = await load('app/page.tsx').default()
  assert.equal(home.props.initialLocations[0].id, 91001)
  assert.equal(home.props.initialGuides[0].slug, 'fixture-guide')
  assert.equal(home.props.initialNotes[0].slug, 'fixture-note')
  assert.equal(home.props.initialPackages[0].slug, 'fixture-package')
  for (const [file, slug, title] of [
    ['spot', 'fixture-lookout-91001', '测试观景台'],
    ['guide', 'fixture-guide', '测试攻略'],
    ['notes', 'fixture-note', '测试游记'],
    ['packages', 'fixture-package', '测试配套'],
  ]) {
    const page = load(`app/${file}/[slug]/page.tsx`)
    const props = { params: { slug } }
    const metadata = await page.generateMetadata(props)
    assert.ok(JSON.stringify(metadata).includes(title), file)
    assert.ok(await page.default(props), file)
  }
  assert.ok(requests > 0)
  t.diagnostic(`${requests} fixture REST reads using the real Supabase SDK, all restricted to the test origin and anon key.`)
})

test('runtime database identity mismatch stops reads before the SDK or HTTP transport', async () => {
  const load = loader({ '@supabase/supabase-js': { createClient: () => assert.fail('SDK reached after invalid configuration') } }, {
    ...globals, process: { env: { ...env, NEXT_PUBLIC_SUPABASE_URL: 'https://vrufunuomioczocdsoer.supabase.co' }, cwd: process.cwd },
  })
  assert.throws(() => load('lib/server/supabase-read-key.ts').supabaseReadKey(), /rejected/)
  await assert.rejects(load('lib/server/spot-routing.ts').readSpotRouting(91001), /rejected/)
  await assert.rejects(load('lib/server/travel-packages.ts').readPublishedPackage('fixture-package'), /rejected/)
})

test('all Preview mutation, publication, statistics, cleanup and external-service handlers stop before side effects', async t => {
  const visit = root => fs.readdirSync(root, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? visit(path.join(root, entry.name)) : [path.join(root, entry.name)])
  const load = loader({
    '@supabase/supabase-js': { createClient: () => assert.fail('Mutation guard reached the SDK') },
    '@aws-sdk/client-s3': { S3Client: () => assert.fail('Mutation guard reached Storage') },
  }, globals)
  let calls = 0
  for (const file of visit('app/api/admin').filter(file => file.endsWith('route.ts'))) {
    const route = load(file)
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      if (!route[method]) continue
      const response = await route[method](new Request('https://jnq-fixture.vercel.app/api/admin', { method: 'POST', body: '{}' }), { params: { id: '91001', slug: 'fixture' } })
      assert.equal(response.status, 503, `${file} ${method}`)
      assert.equal((await response.json()).code, 'PREVIEW_READ_ONLY')
      calls++
    }
  }
  for (const file of visit('pages/api/admin').filter(file => file.endsWith('.ts'))) {
    const res = { code: 200, status(code) { this.code = code; return this }, setHeader() {}, json(value) { this.value = value; return this }, end() {} }
    await load(file).default({ method: 'POST', headers: {}, query: { id: '91001' }, body: {} }, res)
    assert.equal(res.code, 503, file)
    assert.equal(res.value.code, 'PREVIEW_READ_ONLY', file)
    calls++
  }
  for (const [file, method] of [
    ['app/api/page-view/route.ts', 'POST'], ['app/api/affiliate-click/route.ts', 'POST'],
    ['app/api/affiliate-preview/route.ts', 'GET'], ['app/api/fx/route.ts', 'GET'],
  ]) {
    const response = await load(file)[method](new Request('https://jnq-fixture.vercel.app/api/test'))
    if (file.includes('page-view') || file.includes('affiliate-click')) {
      assert.equal(response.status, 200)
      assert.equal((await response.json()).skipped, true)
    } else if (file.includes('affiliate-preview')) {
      assert.equal(response.status, 200)
      assert.equal((await response.json()).skipped, true)
    } else assert.equal(response.status, 503)
    calls++
  }
  t.diagnostic(`${calls} exported handler calls rejected or explicitly skipped before network, Storage or database writes.`)
})
