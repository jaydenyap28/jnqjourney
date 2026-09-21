const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { createClient } = require('@supabase/supabase-js')

// Run the real helper, adminFetch, auth guard, route and Supabase SDK against
// isolated Auth/PostgREST responses; no production records are mutated.
function fixture() {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://regions-test.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    ADMIN_EMAILS: 'admin@example.test',
  }
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]))
  Object.assign(process.env, env)
  const rows = new Map()
  const writes = []
  let token = 'test-admin-token'
  let databaseError = null
  const dbFetch = async (input, init = {}) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (url.pathname === '/auth/v1/user') {
      assert.equal(request.headers.get('apikey'), env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
      assert.equal(request.headers.get('authorization'), `Bearer ${token}`)
      return Response.json({ id: 'admin-id', email: env.ADMIN_EMAILS })
    }
    assert.equal(url.pathname, '/rest/v1/regions')
    assert.equal(request.headers.get('apikey'), env.SUPABASE_SERVICE_ROLE_KEY)
    assert.equal(request.headers.get('authorization'), `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`)
    assert.equal(url.searchParams.has('select'), false)
    assert.ok(!request.headers.get('prefer')?.includes('return=representation'))
    const data = request.method === 'DELETE' ? null : await request.json()
    writes.push({ method: request.method, data, url })
    if (databaseError) return Response.json(databaseError, { status: 409 })
    const id = request.method === 'POST' ? 901 : Number(url.searchParams.get('id').replace('eq.', ''))
    if (request.method === 'DELETE') rows.delete(id)
    else rows.set(id, { ...rows.get(id), ...(request.method === 'POST' ? data[0] : data), id })
    return new Response(null, { status: request.method === 'POST' ? 201 : 204 })
  }
  const cache = new Map()
  let route
  const apiFetch = async (input, init) => {
    assert.equal(input, '/api/admin/regions')
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
  route = load('app/api/admin/regions/route.ts')
  return {
    mutate: load('lib/admin-regions.ts').mutateAdminRegions,
    rows, writes,
    setToken(value) { token = value },
    setDatabaseError(value) { databaseError = value },
    restore() {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    },
  }
}

const allFields = {
  name: 'Test Region', name_cn: '测试地区', description: 'Region description',
  image_url: 'https://cdn.test/region-cover.webp', code: 'test-region', parent_id: 40, country: 'Malaysia',
}

test('create region through admin API preserves every editor field and parent ID', async (t) => {
  const f = fixture(); t.after(() => f.restore())
  f.setToken(null)
  const denied = await f.mutate('POST', { data: allFields })
  assert.ok(denied.error)
  assert.equal(f.writes.length, 0)
  f.setToken('test-admin-token')
  const saved = await f.mutate('POST', { data: allFields })
  assert.deepEqual(saved, { data: null, error: null })
  assert.deepEqual(f.rows.get(901), { ...allFields, id: 901 })
  assert.deepEqual(f.writes[0].data, [allFields])
  assert.equal(f.writes[0].method, 'POST')
})

test('update region through admin API preserves fields and supports clearing the parent', async (t) => {
  const f = fixture(); t.after(() => f.restore())
  f.rows.set(902, { ...allFields, id: 902 })
  f.rows.set(903, { ...allFields, id: 903 })
  const data = { ...allFields, name: 'Updated Region', name_cn: null, description: null, image_url: null, code: null, parent_id: null }
  const updated = await f.mutate('PATCH', { id: 902, data })
  assert.deepEqual(updated, { data: null, error: null })
  assert.deepEqual(f.writes[0].data, data)
  assert.equal(f.writes[0].method, 'PATCH')
  assert.equal(f.writes[0].url.searchParams.get('id'), 'eq.902')
  assert.deepEqual(f.rows.get(902), { ...data, id: 902 })
  assert.deepEqual(f.rows.get(903), { ...allFields, id: 903 })
})

test('delete region through admin API targets only its ID and preserves database errors', async (t) => {
  const f = fixture(); t.after(() => f.restore())
  f.rows.set(902, { ...allFields, id: 902 })
  f.rows.set(903, { ...allFields, id: 903 })
  const error = { code: '23503', message: 'Region is still referenced', details: 'Foreign key reference', hint: null }
  f.setDatabaseError(error)
  const failed = await f.mutate('DELETE', { id: 902 })
  assert.deepEqual(failed, { data: null, error })
  assert.equal(f.rows.has(902), true)
  f.setDatabaseError(null)
  const deleted = await f.mutate('DELETE', { id: 902 })
  assert.deepEqual(deleted, { data: null, error: null })
  assert.equal(f.writes[1].method, 'DELETE')
  assert.equal(f.writes[1].url.searchParams.get('id'), 'eq.902')
  assert.equal(f.writes[1].data, null)
  assert.equal(f.rows.has(902), false)
  assert.deepEqual(f.rows.get(903), { ...allFields, id: 903 })
})
