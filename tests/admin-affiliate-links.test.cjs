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
    NEXT_PUBLIC_SUPABASE_URL: 'https://affiliate-links-test.supabase.co',
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
    assert.equal(url.pathname, '/rest/v1/affiliate_links')
    assert.equal(request.headers.get('apikey'), env.SUPABASE_SERVICE_ROLE_KEY)
    assert.equal(request.headers.get('authorization'), `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`)
    assert.equal(url.searchParams.has('select'), false)
    assert.ok(!request.headers.get('prefer')?.includes('return=representation'))
    const data = request.method === 'DELETE' ? null : await request.json()
    writes.push({ method: request.method, data, url })
    if (databaseError) return Response.json(databaseError, { status: 409 })
    if (request.method === 'POST') {
      for (const fields of Array.isArray(data) ? data : [data]) {
        const id = 901 + rows.size
        rows.set(id, { ...fields, id })
      }
    } else {
      const id = Number(url.searchParams.get('id').replace('eq.', ''))
      if (request.method === 'DELETE') rows.delete(id)
      else rows.set(id, { ...rows.get(id), ...data, id })
    }
    return new Response(null, { status: request.method === 'POST' ? 201 : 204 })
  }
  const cache = new Map()
  let route
  const apiFetch = async (input, init) => {
    assert.equal(input, '/api/admin/affiliate-links')
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
  route = load('app/api/admin/affiliate-links/route.ts')
  return {
    mutate: load('lib/admin-affiliate-links.ts').mutateAdminAffiliateLinks,
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
  provider: 'trip', link_type: 'ticket', url: 'https://trip.test/book?affiliate=test',
  title: '测试链接', description: 'Booking description', commission_rate: 4.25,
  is_active: true, location_id: 808, region_id: null,
}

test('create affiliate link through shared API preserves single and batch association payloads', async (t) => {
  const f = fixture(); t.after(() => f.restore())
  f.setToken(null)
  const denied = await f.mutate('POST', { data: allFields })
  assert.ok(denied.error)
  assert.equal(f.writes.length, 0)
  f.setToken('test-admin-token')
  const saved = await f.mutate('POST', { data: allFields })
  assert.deepEqual(saved, { data: null, error: null })
  assert.deepEqual(f.rows.get(901), { ...allFields, id: 901 })
  assert.deepEqual(f.writes[0].data, allFields)
  assert.equal(f.writes[0].method, 'POST')
  const batch = [
    { ...allFields, location_id: 809, region_id: 92, is_active: false },
    { ...allFields, location_id: 810, region_id: 92 },
    { ...allFields, location_id: null, region_id: 92, title: null, description: null },
    { ...allFields, location_id: null, region_id: null },
  ]
  assert.deepEqual(await f.mutate('POST', { data: batch }), { data: null, error: null })
  assert.deepEqual(f.writes[1].data, batch)
  batch.forEach((fields, index) => assert.deepEqual(f.rows.get(902 + index), { ...fields, id: 902 + index }))
})

test('update affiliate link through shared API preserves edits, nullable associations and active-only toggles', async (t) => {
  const f = fixture(); t.after(() => f.restore())
  const original = { ...allFields, id: 902, clicks: 17, conversions: 3 }
  f.rows.set(902, original)
  f.rows.set(903, { ...allFields, id: 903 })
  const data = { ...allFields, provider: 'klook', link_type: 'tour', url: 'https://klook.test/book', title: 'Updated title', description: null, commission_rate: 0, is_active: false, location_id: null, region_id: 92 }
  const updated = await f.mutate('PATCH', { id: 902, data })
  assert.deepEqual(updated, { data: null, error: null })
  assert.deepEqual(f.writes[0].data, data)
  assert.equal(f.writes[0].method, 'PATCH')
  assert.equal(f.writes[0].url.searchParams.get('id'), 'eq.902')
  assert.deepEqual(f.rows.get(902), { ...original, ...data })
  assert.deepEqual(await f.mutate('PATCH', { id: 902, data: { is_active: true } }), { data: null, error: null })
  assert.deepEqual(f.writes[1].data, { is_active: true })
  assert.deepEqual(f.rows.get(902), { ...original, ...data, is_active: true })
  assert.deepEqual(f.rows.get(903), { ...allFields, id: 903 })
})

test('delete affiliate link through shared API targets only its ID and preserves database errors', async (t) => {
  const f = fixture(); t.after(() => f.restore())
  f.rows.set(902, { ...allFields, id: 902 })
  f.rows.set(903, { ...allFields, id: 903 })
  const error = { code: '23503', message: 'Affiliate link is still referenced', details: 'Foreign key reference', hint: null }
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
