const assert = require('node:assert/strict')
const { test } = require('node:test')
const { loader } = require('./helpers/spot-travel-loader.cjs')

const routePath = 'app/api/admin/public-data/spots/[id]/related-note/route.ts'
const noteSlug = 'shanghai-2-yuan-ferry-dongjin-dongfu-taigong'
const detail = slug => `public-data/spots/${slug}.json`
const index = 'public-data/spots/index.json'
const spots = { 449: 'the-bund-shanghai', 452: 'lu-jia-zui-shanghai' }

function fixture() {
  const objects = new Map()
  const rows = new Map()
  const publicSlugs = { ...spots }
  const writes = []
  const reads = []
  const refreshes = []
  const env = {
    VERCEL_ENV: 'production', JNQ_SPOT_NOTE_PUBLICATION_ENABLED: '1', ADMIN_EMAILS: 'admin@example.test',
    NEXT_PUBLIC_SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'fake',
    R2_ACCOUNT_ID: 'fake', R2_BUCKET_NAME: 'fake', R2_PUBLIC_BASE_URL: 'https://cdn.example.test',
  }
  const failures = {}
  const load = loader({
    '@supabase/supabase-js': {
      createClient: () => ({
        from(table) {
          assert.equal(table, 'locations')
          const filters = {}
          let patch
          const query = {
            select: () => query,
            eq(key, value) { filters[key] = value; return query },
            is(key, value) { filters[key] = value; return query },
            filter(key, operation, value) {
              assert.equal(operation, 'eq')
              filters[key] = value.slice(1, -1).split(',').filter(Boolean)
              return query
            },
            update(value) { patch = value; return query },
            abortSignal: () => query,
            async maybeSingle() {
              const row = rows.get(filters.id)
              if (!row || Object.entries(filters).some(([key, value]) => JSON.stringify(row[key]) !== JSON.stringify(value))) return { data: null }
              if (!patch) return { data: structuredClone(row) }
              writes.push({ db: filters.id, patch, filters })
              const updated_at = new Date(Date.parse(row.updated_at) + 1000).toISOString()
              rows.set(row.id, { ...row, ...patch, updated_at })
              if (failures.dbAck) { failures.dbAck = false; throw new Error('Database response lost') }
              return { data: { updated_at } }
            },
          }
          return query
        },
      }),
    },
    '@aws-sdk/client-s3': {
      GetObjectCommand: class { constructor(input) { this.input = input } },
      PutObjectCommand: class { constructor(input) { this.input = input; this.write = true } },
      S3Client: class {
        async send({ input, write }) {
          const current = objects.get(input.Key)
          if (!write) {
            reads.push(input.Key)
            if (!current) throw Object.assign(new Error(), { name: 'NoSuchKey' })
            return { ...current, Body: { transformToString: async () => JSON.stringify(current.value) } }
          }
          assert.equal(input.Bucket, 'fake')
          if (failures.conflict) current.ETag = '"concurrent"'
          if (!current || current.ETag !== input.IfMatch) throw Object.assign(new Error(), { name: 'PreconditionFailed' })
          if (failures.r2) { failures.r2 = false; throw new Error('R2 unavailable') }
          writes.push({ r2: input.Key, input })
          objects.set(input.Key, { ...current, value: JSON.parse(input.Body), ETag: '"new"' })
          if (failures.r2Ack) { failures.r2Ack = false; throw new Error('R2 response lost') }
        }
      },
    },
    '@/lib/server/admin-auth': { requireAdminRequest: async request => ({ ok: request.headers.get('authorization') === 'Bearer fixture-admin' }) },
    './location-slugs-store': {
      readAuthoritativeLocationSlugMap: async () => ({ ...publicSlugs }),
      buildCanonicalLocationPath: async (_name, id, map) => `/spot/${map[id]}-${id}`,
      buildPublicCanonicalLocationPath: async (_name, id) => `/spot/${publicSlugs[id]}-${id}`,
    },
    './public-spot-resolver': {
      PUBLIC_SPOT_SELECT: 'id',
      getPublicSpotBySlug: async slug => ({ source: failures.source || 'cdn-cache', spot: objects.get(detail(slug)).value.spot }),
    },
    './r2': { assertR2Env() {} },
    'next/cache': {
      revalidatePath: path => refreshes.push({ path }),
      revalidateTag: tag => refreshes.push({ tag }),
    },
  }, {
    process: { env },
    fetch: async (input, options) => {
      const url = new URL(input)
      assert.equal(options.cache, 'no-store')
      assert.equal(options.redirect, 'error')
      if (url.origin === 'https://cdn.example.test') {
        assert.ok(url.searchParams.get('publication'))
        const object = objects.get(url.pathname.slice(1))
        return object ? Response.json(object.value) : new Response(null, { status: 404 })
      }
      assert.equal(url.origin, 'https://www.jnqjourney.com')
      assert.equal(options.method, 'POST')
      assert.equal(options.headers.authorization, 'Bearer fixture-admin')
      refreshes.push({ english: url.pathname, slug: options.headers['x-jnq-expected-spot-slug'] })
      return Response.json({ ok: !failures.refresh })
    },
  })
  const { publicSpotFromSupabaseRow } = load('lib/public-spot.ts')
  const { POST } = load(routePath)
  const locations = []
  function setObject(key, value) {
    objects.set(key, { value, ETag: '"original"', ContentType: 'application/json', CacheControl: 'public, max-age=3600', Metadata: { fixture: 'original' } })
  }
  function setRow(row) {
    rows.set(row.id, row)
    const summary = locations.find(item => item.id === row.id)
    setObject(detail(summary.slug), { schemaVersion: 1, source: { type: 'fixture' }, spot: publicSpotFromSupabaseRow(row, summary, row.regions) })
  }
  for (const [value, base] of Object.entries(spots)) {
    const id = Number(value)
    locations.push({ id, slug: `${base}-${id}`, region: null })
    setRow({
      id, status: 'active', publication_status: 'published', redirect_url: null, redirect_type: null,
      updated_at: '2026-11-06T00:00:00+00:00', name: id === 449 ? 'The Bund' : 'Lujiazui',
      latitude: 31, longitude: 121, regions: null, related_note_slugs: null,
      description: 'a'.repeat(320), experience_zh: 'a'.repeat(125),
      seo_title_zh: null, seo_title_en: null, seo_description_zh: null, seo_description_en: null,
      experience_en: null, image_metadata: null,
      images: ['first.jpg', 'second.jpg'], visit_date: '2026-01-01', price_info: { free: true },
    })
  }
  setObject(index, { schemaVersion: 1, slugs: locations.map(item => item.slug) })
  setObject('public-data/locations.json', { locations })
  setObject('public-data/i18n/en/records.json', { schemaVersion: 1, locale: 'en', records: [] })
  setObject('public-data/notes.json', { schemaVersion: 1, notes: [{ slug: noteSlug, title: 'Shanghai ferry', published: true, aliases: ['ferry-alias'] }] })
  async function submit(expected, { id = 449, slug = noteSlug, admin = true } = {}) {
    const response = await POST(new Request(`https://www.jnqjourney.com/api/admin/public-data/spots/${id}/related-note`, {
      method: 'POST', headers: admin ? { authorization: 'Bearer fixture-admin' } : {},
      body: JSON.stringify({ noteSlug: slug, expected }),
    }), { params: { id: String(id) } })
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    return { status: response.status, ...await response.json() }
  }
  return { objects, rows, env, failures, writes, reads, refreshes, load, submit, setRow }
}

test('Preview rejects an admin with inherited secrets and never contacts a store; production rejects missing admin', async () => {
  const f = fixture()
  f.env.VERCEL_ENV = 'preview'
  assert.equal((await f.submit()).status, 403)
  f.env.VERCEL_ENV = 'production'
  assert.equal((await f.submit(undefined, { admin: false })).status, 403)
  f.env.ADMIN_EMAILS = ', '
  assert.equal((await f.submit()).status, 403)
  assert.deepEqual(f.reads, [])
  assert.deepEqual(f.writes, [])
})

test('449 publishes just the existing object and association; retries and prepares 452 without writing it', async () => {
  const f = fixture()
  const slug = 'the-bund-shanghai-449'
  const row = structuredClone(f.rows.get(449))
  const before = structuredClone(f.objects)
  const prepared = await f.submit()
  assert.equal(prepared.state, 'prepared')
  assert.deepEqual(f.writes, [])
  assert.equal(prepared.quality.snapshot.before.indexable, true)
  assert.equal(prepared.quality.snapshot.after.indexable, true)
  assert.equal((await f.submit(prepared.receipt)).state, 'published')
  assert.deepEqual(f.rows.get(449), { ...row, updated_at: '2026-11-06T00:00:01.000Z', related_note_slugs: [noteSlug] })
  const saved = f.objects.get(detail(slug))
  assert.deepEqual(saved.value, { ...before.get(detail(slug)).value, spot: { ...before.get(detail(slug)).value.spot, related_note_slugs: [noteSlug] } })
  assert.deepEqual(f.writes[0].patch, { related_note_slugs: [noteSlug] })
  assert.equal(f.writes[0].filters.updated_at, row.updated_at)
  assert.equal(f.writes[0].filters.related_note_slugs, null)
  assert.equal(f.writes[1].r2, detail(slug))
  assert.equal(f.writes[1].input.IfMatch, '"original"')
  for (const key of ['CacheControl', 'ContentType', 'Metadata']) assert.deepEqual(f.writes[1].input[key], saved[key])
  for (const [key, value] of before) if (key !== detail(slug)) assert.deepEqual(f.objects.get(key), value)
  assert.ok(f.refreshes.some(item => item.english === '/api/admin/spot-content-revalidate/449' && item.slug === slug))
  assert.ok(f.refreshes.some(item => item.tag === `bilingual:spots/${slug}.json`))
  assert.ok(f.refreshes.every(item => Object.values(item)[0].includes('449')))
  const { notesForSpot } = f.load('lib/content-relations.ts')
  const { applyLocalization } = f.load('lib/localization.ts')
  const notes = f.objects.get('public-data/notes.json').value.notes
  for (const spot of [saved.value.spot, applyLocalization(saved.value.spot, undefined).value]) {
    assert.deepEqual(notesForSpot(spot, notes).map(note => note.slug), [noteSlug])
  }
  assert.equal((await f.submit(prepared.receipt)).state, 'already_published')
  const repeat = await f.submit()
  assert.equal((await f.submit(repeat.receipt)).state, 'unchanged')
  assert.equal((await f.submit(undefined, { id: 452 })).state, 'prepared')
  assert.deepEqual(f.writes.map(item => item.db ?? item.r2), [449, detail(slug)])
})

test('existing relationships retain their order and deduplicate during the compare-and-set', async () => {
  const f = fixture()
  f.setRow({ ...f.rows.get(449), related_note_slugs: ['first', 'second', 'first'] })
  const { receipt } = await f.submit()
  assert.equal((await f.submit(receipt)).state, 'published')
  assert.deepEqual(f.writes[0].filters.related_note_slugs, ['first', 'second', 'first'])
  assert.deepEqual(f.writes[0].patch.related_note_slugs, ['first', 'second', noteSlug])
})

test('draft, hidden, redirecting, excluded Spots and unpublished or alias Notes are rejected', async () => {
  const f = fixture()
  for (const publication_status of ['draft', 'hidden']) {
    f.setRow({ ...f.rows.get(449), publication_status })
    assert.equal((await f.submit()).error, 'spot_not_published_or_redirected')
  }
  f.setRow({ ...f.rows.get(449), publication_status: 'published', redirect_url: '/spot/other-1' })
  assert.equal((await f.submit()).error, 'spot_not_published_or_redirected')
  f.setRow({ ...f.rows.get(449), redirect_url: null })
  assert.equal((await f.submit(undefined, { id: 450 })).status, 400)
  assert.equal((await f.submit(undefined, { slug: 'ferry-alias' })).status, 422)
  f.objects.get('public-data/notes.json').value.notes[0].published = false
  assert.equal((await f.submit()).error, 'note_not_published_canonical')
  assert.deepEqual(f.writes, [])
})

test('blocks a relation that would flip quality from noindex to indexable', async () => {
  const f = fixture()
  f.setRow({ ...f.rows.get(449), description: 'a'.repeat(180), experience_zh: null })
  assert.equal((await f.submit()).error, 'seo_noindex_would_change')
  f.setRow({ ...f.rows.get(449), description: 'a'.repeat(179) })
  const result = await f.submit()
  assert.equal(result.quality.snapshot.before.indexable, false)
  assert.equal(result.quality.snapshot.after.indexable, false)
  assert.equal((await f.submit(result.receipt)).state, 'published')
})

test('449 and 452 live-like missing indexed keys and inconsistent bilingual sources are rejected', async () => {
  const f = fixture()
  f.objects.get(index).value.slugs = ['the-bund-449', 'lujiazui-452']
  for (const id of [449, 452]) assert.equal((await f.submit(undefined, { id })).error, 'indexed_spot_snapshot_missing')
  f.objects.get(index).value.slugs = ['the-bund-shanghai-449', 'lu-jia-zui-shanghai-452']
  f.failures.source = 'static-fallback'
  assert.equal((await f.submit()).error, 'public_spot_source_mismatch')
  delete f.failures.source
  f.objects.get('public-data/i18n/en/records.json').value.records.push({ entityId: '449', entityType: 'spot', source: { url: '/spots/the-bund-449.json' } })
  assert.equal((await f.submit()).error, 'english_spot_source_mismatch')
  assert.deepEqual(f.writes, [])
})

test('stale DB version and concurrently replaced R2 snapshot are detected', async () => {
  const f = fixture()
  const { receipt } = await f.submit()
  f.rows.get(449).updated_at = '2026-11-06T00:05:00+00:00'
  assert.equal((await f.submit(receipt)).error, 'spot_version_conflict')
  const prepared = await f.submit()
  f.failures.conflict = true
  assert.equal((await f.submit(prepared.receipt)).error, 'database_saved_publication_conflict')
  assert.deepEqual(f.writes.map(item => item.db), [449])
  assert.deepEqual(f.refreshes, [])
  assert.equal((await f.submit(prepared.receipt)).error, 'snapshot_conflict')
})

test('parallel disjoint requests cannot overwrite the winning association', async () => {
  const f = fixture()
  const second = 'other-published-note'
  f.objects.get('public-data/notes.json').value.notes.push({ slug: second, title: 'Other note', published: true })
  const { receipt } = await f.submit()
  const results = await Promise.all([f.submit(receipt), f.submit(receipt, { slug: second })])
  assert.deepEqual(results.map(item => item.status).sort(), [200, 409])
  assert.equal(f.writes.length, 2)
  assert.equal(f.rows.get(449).related_note_slugs.length, 1)
})

for (const [failure, error, resumed] of [
  ['dbAck', 'database_result_unknown_retry_same_receipt', 'published'],
  ['r2', 'database_saved_snapshot_pending_retry_same_receipt', 'published'],
  ['r2Ack', 'database_saved_snapshot_pending_retry_same_receipt', 'already_published'],
  ['refresh', 'data_verified_cache_pending_retry_same_receipt', 'already_published'],
]) {
  test(`recovers ${failure} with the original receipt and no duplicate writes`, async () => {
    const f = fixture()
    const { receipt } = await f.submit()
    f.failures[failure] = true
    const failed = await f.submit(receipt)
    assert.equal(failed.status, 503)
    assert.equal(failed.error, error)
    f.failures[failure] = false
    assert.equal((await f.submit(receipt)).state, resumed)
    assert.deepEqual(f.writes.map(item => item.db ?? item.r2), [449, detail('the-bund-shanghai-449')])
  })
}
