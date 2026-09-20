const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function loader(mocks = {}, globals = {}) {
  const cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports
    const mod = { exports: {} }; cache.set(file, mod)
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
    const req = name => {
      if (name in mocks) return mocks[name]
      if (name === 'server-only') return {}
      if (name.startsWith('@/') || name.startsWith('.')) {
        let next = name.startsWith('@/') ? path.resolve(name.slice(2)) : path.resolve(path.dirname(file), name)
        if (next.endsWith('.json')) return JSON.parse(fs.readFileSync(next, 'utf8'))
        if (!path.extname(next)) next += '.ts'
        return load(next)
      }
      return require(name)
    }
    new Function('require', 'exports', 'module', ...Object.keys(globals), source)(req, mod.exports, mod, ...Object.values(globals))
    return mod.exports
  }
  return file => load(path.resolve(file))
}

test('Guide Admin save publishes exact ordered attractions, invalidates readers, preserves aliases, and reports failed publish', async () => {
  const objects = new Map(); const tags = []; const paths = []; let fail = false
  const ids = [446, 447, 448, 613, 449, 452]
  const old = { slug: 'old-guide', aliases: ['older-guide'], title: 'Jiangnan', days: [] }
  const storage = {
    download: async key => ({ data: objects.has(key) ? new Blob([objects.get(key)]) : null }),
    list: async () => ({ data: [] }),
    upload: async (key, bytes) => { objects.set(key, bytes); return {} },
  }
  objects.set('_system/guides.webp', Buffer.from(JSON.stringify([old])))
  let published
  const fakeFetch = async url => new Response(String(url).includes('?fresh=') ? published : JSON.stringify({ guides: [old] }))
  const load = loader({
    'fs/promises': { readFile: async () => '[]', writeFile: async () => {} },
    '@/data/guides.json': [], '@/lib/guide-drafts': { jiangnanGuideDraft: old },
    '@supabase/supabase-js': { createClient: () => ({ storage: { from: () => storage } }) },
    '@aws-sdk/client-s3': { PutObjectCommand: class { constructor(input) { this.input = input } }, S3Client: class { async send(command) { if (fail) throw Error('publish unavailable'); assert.equal(command.input.Key, 'public-data/guides.json'); assert.equal(command.input.CacheControl, 'no-store, max-age=0'); published = command.input.Body } } },
    '@/lib/server/admin-auth': { requireAdminRequest: async () => ({ ok: true }) },
    '@/lib/server/public-guide-trip-cost': { publishManualGuideTripCost: async () => {} },
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    'next/cache': { revalidateTag: tag => tags.push(tag), revalidatePath: p => paths.push(p), unstable_cache: fn => fn },
  }, { fetch: fakeFetch })
  for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME']) process.env[key] = 'test'
  process.env.R2_PUBLIC_BASE_URL = 'https://cdn.test'
  const route = load('app/api/admin/guides/route.ts')
  const guide = { slug: 'jiangnan', previousSlug: 'old-guide', title: 'Jiangnan', days: [{ dayLabel: 'Day 2', title: 'Shanghai', attractions: ids.map((spotId, displayOrder) => ({ spotId, displayOrder, enabled: true })) }] }
  const request = () => new Request('https://test/api/admin/guides', { method: 'POST', body: JSON.stringify(guide) })
  const result = await route.POST(request()); assert.equal(result.status, 200)
  const saved = (await result.json()).guide
  assert.deepEqual(saved.aliases, ['older-guide', 'old-guide'])
  assert.deepEqual(JSON.parse(published).guides[0].days[0].attractions.map(x => x.spotId), ids)
  const publicStore = load('lib/server/public-content-store.ts')
  assert.deepEqual((await publicStore.readPublicGuideBySlug('old-guide')).days[0].attractions.map(x => x.spotId), ids)
  for (const tag of ['guides', 'guide:jiangnan']) assert.ok(tags.includes(tag))
  for (const p of ['/guide', '/guide/jiangnan', '/api/guides']) assert.ok(paths.includes(p))
  fail = true
  const failed = await route.POST(request()); assert.equal(failed.status, 500)
  assert.match((await failed.json()).error, /publish unavailable/)
})

test('Guide publication rejects stale CDN bytes', async () => {
  const { verifyGuidePublication, freshGuideSnapshotUrl } = loader()('lib/guide-publication.ts')
  assert.notEqual(freshGuideSnapshotUrl('https://cdn.test'), freshGuideSnapshotUrl('https://cdn.test'))
  await assert.rejects(verifyGuidePublication('https://cdn.test', Buffer.from('fresh'), async () => new Response('stale')), /verification failed/)
})

test('Note affiliate API uses explicit IDs only; unbound Notes query nothing; Spot and Guide filters remain supported', async () => {
  let blocks = []; const calls = []
  const query = {}
  for (const method of ['select', 'eq', 'order', 'in', 'or']) query[method] = (...args) => { calls.push([method, ...args]); assert.ok(!JSON.stringify(args).includes('note_slug')); return query }
  query.limit = async () => ({ data: [], error: null })
  const load = loader({
    '@/lib/server/public-content-store': { readPublicNoteBySlug: async () => ({ blocks }) },
    '@/lib/notes': { getRenderableNoteBlocks: note => note.blocks },
    '@supabase/supabase-js': { createClient: () => ({ from: () => { calls.push(['from']); return query } }) },
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
  })
  const { GET } = load('app/api/affiliate-links/route.ts')
  await GET(new Request('https://test/api/affiliate-links?noteSlug=unbound&regionId=2')); assert.equal(calls.length, 0)
  blocks = [{ type: 'affiliate', affiliateIds: [8, 3, 8] }]
  await GET(new Request('https://test/api/affiliate-links?noteSlug=bound'))
  assert.ok(calls.some(x => x[0] === 'in' && JSON.stringify(x[2]) === '[8,3]'))
  calls.length = 0
  await GET(new Request('https://test/api/affiliate-links?locationId=9&regionId=2'))
  assert.ok(calls.some(x => x[0] === 'or' && x[1] === 'location_id.eq.9,region_id.eq.2'))
  calls.length = 0
  await GET(new Request('https://test/api/affiliate-links?ids=7,4'))
  assert.ok(calls.some(x => x[0] === 'in' && JSON.stringify(x[2]) === '[7,4]'))
  for (const file of ['app/notes/[slug]/page.tsx', 'app/api/affiliate-links/route.ts', 'app/admin/affiliate/page.tsx', 'components/AffiliateCard.tsx']) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /\bnote_slug\b/)
})
