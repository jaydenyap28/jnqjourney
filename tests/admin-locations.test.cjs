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
  const publications = []
  let token = 'test-admin-token'
  let missingColumn = null
  let publicationFailure = false
  let uncertain = false
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
    const data = request.method === 'DELETE' ? null : await request.json()
    writes.push({ method: request.method, data, url, headers: request.headers })
    if(uncertain) return Response.json({message:'Synthetic response failure'}, {status:500})
    if (missingColumn) {
      return Response.json({ code: 'PGRST204', message: `Could not find the '${missingColumn}' column`, details: null, hint: null }, { status: 400 })
    }
    const filter = url.searchParams.get('id') || ''
    const requested = request.method === 'POST' ? [901] : filter.startsWith('in.(')
      ? filter.slice(4, -1).split(',').map(Number) : [Number(filter.replace('eq.', ''))]
    const expected = url.searchParams.get('updated_at')
    const ids = request.method === 'POST' ? requested : requested.filter(id => rows.has(id) &&
      (!expected || (expected === 'is.null' ? rows.get(id).updated_at == null : expected === `eq.${rows.get(id).updated_at}`)))
    assert.ok(ids.every(id => Number.isSafeInteger(id) && id > 0))
    const id = ids[0]
    const fields = request.method === 'POST' ? data[0] : data
    for (const targetId of ids) {
      if (request.method === 'DELETE') rows.delete(targetId)
      else rows.set(targetId, { ...rows.get(targetId), ...fields, id: targetId, updated_at: fields.updated_at || '2026-09-21T00:00:00Z' })
    }
    if (url.searchParams.has('select')) {
      if (url.searchParams.get('select') === 'id') return Response.json(ids.map(id=>({id})))
      // Locked SDK maybeSingle() requests a list and enforces cardinality locally.
      if (expected) return Response.json(ids.map(id => ({ id, updated_at: rows.get(id).updated_at })))
      assert.equal(url.searchParams.get('select'), 'id,updated_at')
      assert.equal(request.headers.get('accept'), 'application/vnd.pgrst.object+json')
      return Response.json({ id, updated_at: rows.get(id).updated_at }, { status: request.method === 'POST' ? 201 : 200 })
    }
    return new Response(null, { status: 204 })
  }
  const cache = new Map()
  let route
  const apiFetch = async (input, init) => {
    if (input.startsWith('/api/admin/spot-content-revalidate/')) {
      publications.push({ kind: 'english', id: Number(input.split('/').pop()) })
      return Response.json({ ok: true })
    }
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
      if (name === '@/lib/server/publication') return require('./helpers/publication-mock.cjs').publicationMock()
      if (name === '@/lib/server/publish-location-batch') return { publishLocationBatch: async ids => { publications.push({ kind: 'snapshot', ids }); if (publicationFailure) throw new Error('Synthetic publication failure'); return {previousLocations: []} } }
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
    rows, writes, publications,
    setToken(value) { token = value },
    setMissingColumn(value) { missingColumn = value },
    setPublicationFailure(value) { publicationFailure = value },
    setUncertain(value) { uncertain = value },
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
  opening_hours: '{"isUnknown":true}', price_info: '{"currency":"RM"}', status: 'active',
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
  assert.equal(f.writes[0].url.searchParams.get('select'), 'id')
  assert.deepEqual(f.publications, [{ kind: 'snapshot', ids: [903] }]) // coordinator owns deduplicated English plan
})

test('bulk publication runs once after the real SDK write; failure stops English refresh and reports partial completion', async (t) => {
  const f = fixture(); t.after(() => f.restore())
  for (const id of [903, 904, 905]) f.rows.set(id, { ...allFields, id, visit_date: '2026-10-18' })
  const success = await f.mutate('PATCH', { ids: [903, 904], data: { visit_date: null } })
  assert.equal(success.error, null)
  assert.equal(f.rows.get(903).visit_date, null); assert.equal(f.rows.get(904).visit_date, null)
  assert.equal(f.rows.get(905).visit_date, '2026-10-18')
  assert.deepEqual(f.publications, [{ kind: 'snapshot', ids: [903, 904] }])
  f.publications.length = 0
  f.setPublicationFailure(true)
  const partial = await f.mutate('DELETE', { ids: [903, 904] })
  assert.match(partial.error.message, /already be saved.*publication failed/)
  assert.equal(f.rows.has(903), false); assert.equal(f.rows.has(904), false); assert.equal(f.rows.has(905), true)
  assert.deepEqual(f.publications, [{ kind: 'snapshot', ids: [903, 904] }])
  assert.equal(f.writes.length, 2) // one write for each request; never retry the committed mutation
})

test('same-write returned IDs distinguish partial and zero-row batches; only committed IDs publish', async (t) => {
  const f = fixture(); t.after(()=>f.restore())
  f.rows.set(903,{...allFields,id:903})
  const partial = await f.mutate('PATCH',{ids:[903,999,903],data:{visit_date:null}})
  assert.equal(partial.error.code,'PARTIAL_WRITE'); assert.match(partial.error.message,/1\/2 rows/)
  assert.deepEqual(f.publications,[{kind:'snapshot',ids:[903]}])
  assert.equal(f.writes.length,1)
  f.publications.length=0
  const none = await f.mutate('DELETE',{ids:[998,999]})
  assert.equal(none.error.code,'WRITE_NOT_CONFIRMED'); assert.match(none.error.message,/failed/)
  assert.deepEqual(f.publications,[]); assert.equal(f.writes.length,2)
  // A deliberate retry contains only the missing IDs and never repeats 903.
  f.rows.set(999,{...allFields,id:999})
  assert.equal((await f.mutate('PATCH',{id:999,data:{visit_date:null}})).error,null)
  assert.deepEqual(f.publications,[{kind:'snapshot',ids:[999]}])
})

test('unconfirmed Spot transport outcomes request reload and never auto-replay a write',async t=>{
  const f=fixture();t.after(()=>f.restore());f.rows.set(903,{...allFields,id:903})
  f.setUncertain(true)
  assert.match((await f.mutate('PATCH',{id:903,data:{visit_date:null}})).error.message,/outcome unknown; reload/)
  assert.equal(f.writes.length,1);assert.equal(f.publications.length,0)
  f.setUncertain(false)
  assert.equal((await f.mutate('PATCH',{id:903,data:{visit_date:null}})).error,null)
  assert.equal(f.writes.length,2)
})

test('conditional Spot save rejects a stale writer without modifying or publishing the row', async t => {
  const f = fixture(); t.after(() => f.restore())
  f.rows.set(903, { ...allFields, id: 903, updated_at: '2026-10-26T01:00:00Z' })
  const result = await f.mutate('PATCH', { id: 903, returning: true, expectedUpdatedAt: '2026-10-25T01:00:00Z', data: { description: 'Stale edit' } })
  assert.equal(result.error.code, 'EDIT_CONFLICT')
  assert.equal(f.rows.get(903).description, allFields.description)
  assert.equal(f.writes[0].url.searchParams.get('updated_at'), 'eq.2026-10-25T01:00:00Z')
  assert.equal(f.writes.length, 1); assert.equal(f.publications.length, 0)
})

test('conditional Spot save permits exactly one current-version write and handles legacy null versions', async t => {
  const f = fixture(); t.after(() => f.restore())
  const version = '2026-10-26T01:00:00Z'
  f.rows.set(903, { ...allFields, id: 903, updated_at: version })
  const first = await f.mutate('PATCH', { id: 903, returning: true, expectedUpdatedAt: version, data: { description: 'Reviewed edit' } })
  assert.equal(first.error, null); assert.equal(first.data.id, 903)
  assert.ok(Date.parse(first.data.updated_at) > Date.parse(version))
  assert.equal(f.rows.get(903).description, 'Reviewed edit')
  const second = await f.mutate('PATCH', { id: 903, returning: true, expectedUpdatedAt: version, data: { description: 'Duplicate stale edit' } })
  assert.equal(second.error.code, 'EDIT_CONFLICT')
  assert.equal(f.rows.get(903).description, 'Reviewed edit')
  f.rows.set(904, { ...allFields, id: 904, updated_at: null })
  assert.equal((await f.mutate('PATCH', { id: 904, returning: true, expectedUpdatedAt: null, data: { description: 'Legacy reviewed' } })).error, null)
  assert.equal(f.writes.at(-1).url.searchParams.get('updated_at'), 'is.null')
})
