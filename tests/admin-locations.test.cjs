const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { createClient } = require('@supabase/supabase-js')

// Exercise the real client helper, adminFetch, auth guard, route and Supabase SDK.
// Only Auth/PostgREST HTTP responses are isolated from production.
function fixture() {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://locations-test.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    ADMIN_EMAILS: 'admin@example.test',
  }
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]))
  Object.assign(process.env, env)
  const rows = new Map()
  const writes = []
  let token = 'test-admin-token'
  let missingColumn = null
  const dbFetch = async (input, init = {}) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (url.pathname === '/auth/v1/user') {
      assert.equal(request.headers.get('apikey'), env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
      assert.equal(request.headers.get('authorization'), `Bearer ${token}`)
      return Response.json({ id: 'admin-id', email: env.ADMIN_EMAILS })
    }
    assert.equal(url.pathname, '/rest/v1/locations')
    assert.equal(request.headers.get('apikey'), env.SUPABASE_SERVICE_ROLE_KEY)
    assert.equal(request.headers.get('authorization'), `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`)
    const data = await request.json()
    writes.push({ method: request.method, data, url, headers: request.headers })
    if (missingColumn) {
      return Response.json({ code: 'PGRST204', message: `Could not find the '${missingColumn}' column`, details: null, hint: null }, { status: 400 })
    }
    const id = request.method === 'POST' ? 901 : Number(url.searchParams.get('id').replace('eq.', ''))
    const fields = request.method === 'POST' ? data[0] : data
    rows.set(id, { ...rows.get(id), ...fields, id, updated_at: '2026-09-21T00:00:00Z' })
    if (url.searchParams.has('select')) {
      assert.equal(url.searchParams.get('select'), 'id,updated_at')
      assert.equal(request.headers.get('accept'), 'application/vnd.pgrst.object+json')
      return Response.json({ id, updated_at: rows.get(id).updated_at }, { status: request.method === 'POST' ? 201 : 200 })
    }
    return new Response(null, { status: 204 })
  }
  const cache = new Map()
  let route
  const apiFetch = async (input, init) => {
    assert.equal(input, '/api/admin/locations')
    return route[init.method](new Request(`https://app.test${input}`, init))
  }
  function load(relative) {
    const file = path.resolve(relative)
    if (cache.has(file)) return cache.get(file).exports
    const mod = { exports: {} }
    cache.set(file, mod)
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText
    const req = name => {
      if (name === '@/lib/supabase') return { supabase: { auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null } }) } } }
      if (name === '@supabase/supabase-js') return { createClient: (url, key, options) => createClient(url, key, { ...options, global: { fetch: dbFetch } }) }
      if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`)
      return require(name)
    }
    new Function('require', 'module', 'exports', 'fetch', source)(req, mod, mod.exports, apiFetch)
    return mod.exports
  }
  route = load('app/api/admin/locations/route.ts')
  return {
    mutate: load('lib/admin-locations.ts').mutateAdminLocations,
    rows, writes,
    setToken(value) { token = value },
    setMissingColumn(value) { missingColumn = value },
    restore() {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    },
  }
}

const allFields = {
  name: 'Test Spot', name_cn: '测试景点', category: 'attraction', address: 'Test address',
  latitude: 1.23, longitude: 103.45, region_id: 92,
  video_url: 'https://youtube.test/watch?v=test', facebook_video_url: 'https://facebook.test/video',
  image_url: 'https://cdn.test/cover.webp#focus=50,50', images: ['https://cdn.test/gallery.webp'],
  description: 'Complete description', tags: ['景点'], visit_date: null,
  opening_hours: '{"isUnknown":true}', price_info: { currency: 'RM' }, status: 'active',
  publication_status: 'draft', seo_title_zh: '中文标题', seo_description_zh: '中文说明',
  seo_title_en: 'English title', seo_description_en: 'English description',
  experience_zh: '中文体验', experience_en: 'English experience', related_note_slugs: ['test-note'],
  image_metadata: { 'https://cdn.test/gallery.webp': { alt_zh: '照片', alt_en: 'Photo', caption: 'Caption' } },
  redirect_url: null, redirect_type: 301,
}

test('create Spot through admin API preserves every field and save result', async (t) => {
  const f = fixture(); t.after(() => f.restore())
  f.setToken(null)
  const denied = await f.mutate('POST', { data: allFields })
  assert.ok(denied.error)
  assert.equal(f.writes.length, 0)
  f.setToken('test-admin-token')
  const saved = await f.mutate('POST', { data: allFields })
  assert.equal(saved.error, null)
  assert.deepEqual(saved.data, { id: 901, updated_at: '2026-09-21T00:00:00Z' })
  assert.deepEqual(f.rows.get(901), { ...allFields, ...saved.data })
  assert.deepEqual(f.writes[0].data, [allFields])
  assert.equal(f.writes[0].method, 'POST')
})

test('update Spot through admin API preserves fields and safe-save error details', async (t) => {
  const f = fixture(); t.after(() => f.restore())
  f.rows.set(902, { ...allFields, id: 902 })
  const data = { ...allFields, name: 'Updated Spot', visit_date: '2026-09-21' }
  const updated = await f.mutate('PATCH', { id: 902, data, returning: true })
  assert.equal(updated.error, null)
  assert.equal(updated.data.id, 902)
  assert.deepEqual(f.writes[0].data, data)
  assert.equal(f.writes[0].url.searchParams.get('id'), 'eq.902')
  assert.deepEqual(f.rows.get(902), { ...data, ...updated.data })
  f.setMissingColumn('images')
  const failed = await f.mutate('PATCH', { id: 902, data, returning: true })
  assert.equal(failed.error.code, 'PGRST204')
  assert.match(failed.error.message, /images/)
  assert.equal(failed.data, null)
  f.setMissingColumn(null)
  const { images, ...safeData } = data
  const retried = await f.mutate('PATCH', { id: 902, data: safeData, returning: true })
  assert.equal(retried.error, null)
  assert.deepEqual(f.rows.get(902).images, images)
})

test('clear cover through admin API changes only image_url with minimal result', async (t) => {
  const f = fixture(); t.after(() => f.restore())
  f.rows.set(903, { ...allFields, id: 903 })
  const cleared = await f.mutate('PATCH', { id: 903, data: { image_url: '' } })
  assert.deepEqual(cleared, { data: null, error: null })
  assert.deepEqual(f.rows.get(903), { ...allFields, id: 903, image_url: '', updated_at: '2026-09-21T00:00:00Z' })
  assert.deepEqual(f.writes[0].data, { image_url: '' })
  assert.equal(f.writes[0].url.searchParams.get('id'), 'eq.903')
  assert.equal(f.writes[0].url.searchParams.has('select'), false)
})


test('admin API normalizes legacy stringified price_info before writing JSONB', async (t) => {
  const f = fixture(); t.after(() => f.restore())
  const legacy = { ...allFields, price_info: '{"currency":"CNY","mealBudget":"87","mealPartySize":2}' }
  const saved = await f.mutate('POST', { data: legacy })
  assert.equal(saved.error, null)
  assert.deepEqual(f.writes[0].data[0].price_info, {
    currency: 'CNY',
    mealBudget: '87',
    mealPartySize: 2,
  })
  assert.deepEqual(f.rows.get(901).price_info, {
    currency: 'CNY',
    mealBudget: '87',
    mealPartySize: 2,
  })
})
