import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import { publicationVersion } from '../lib/publication-version.ts'

const require = createRequire(import.meta.url)
function load(file: string, mocks: Record<string, unknown>) {
  const context = { exports: {} as any, process: { env: {} }, Buffer, console, URL, Request, Response,
    require: (id: string) => {
      if (id in mocks) return mocks[id]
      if (id.startsWith('@/') || id.startsWith('./')) throw Error(`Unexpected dependency ${id}`)
      return require(id)
    },
  }
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context, { filename: file })
  return context.exports
}
function englishNotes(notes: any[]) {
  const stubs = Object.fromEntries(['@/lib/server/guide-price-highlights-store', '@/lib/content-relations', '@/lib/server/travel-packages', '@/lib/guide-price-highlights', '@/lib/guide-budget', '@/lib/localization', '@/lib/entity-display-name', '@/lib/public-region-media', '@/lib/server/public-content-media', '@/lib/homepage-localization'].map(id => [id, {}]))
  return load('lib/server/english-page-data.ts', {
    ...stubs,
    '@/lib/publication-version': { publicationVersion },
    './localization-snapshot': { readBilingualSnapshot: async (key: string) => { assert.equal(key, 'notes.json'); return { notes } } },
  }).englishPageData
}
const collection = { locations: [], regions: [], guides: [], localization: { records: [] }, snapshotSlugs: {} }
test('English Note canonical and alias retain the same published source version', async () => {
  const note = { slug: 'published-note', title: 'Published article', aliases: ['old-note', '旧网址'], published: true }
  const read = englishNotes([note])
  for (const slug of ['published-note', 'old-note', '旧网址']) {
    const result = await read(['notes', slug], false, { collection, includePackages: false })
    assert.equal(result.data.sourceVersion, publicationVersion(note))
    assert.equal(result.data.kind, 'fallback'); assert.equal(result.data.status, 'missing')
  }
})
test('a draft alias cannot supply the version of an independently matched published Note', async () => {
  const draft = { slug: 'draft', aliases: ['published-note'], title: 'Draft', published: false }
  const note = { slug: 'published-note', aliases: ['old-note'], title: 'Published', published: true }
  const result = await englishNotes([draft, note])(['notes', 'published-note'], false, { collection })
  assert.equal(result.data.sourceVersion, publicationVersion(note))
  assert.notEqual(result.data.sourceVersion, publicationVersion(draft))
})
test('a published canonical slug takes precedence over another published Note alias', async () => {
  const alias = { slug: 'other', aliases: ['current'], title: 'Other', published: true }
  const canonical = { slug: 'current', aliases: [], title: 'Current', published: true }
  const result = await englishNotes([alias, canonical])(['notes', 'current'], false, { collection })
  assert.equal(result.data.sourceVersion, publicationVersion(canonical))
})
test('unpublished and missing Notes stay absent; titles are not guessed as slugs', async () => {
  const read = englishNotes([{ slug: 'draft', aliases: ['old-draft'], title: 'Draft title', published: false }, { slug: 'current', title: 'Published title', published: true }])
  for (const slug of ['draft', 'old-draft', 'missing', 'Published title']) assert.equal(await read(['notes', slug], false, { collection }), null)
})

function publisher(failSource = false) {
  const uploads: string[] = [], tags: string[] = []
  const ids = [31, 676, 754, 762]
  const publish = load('lib/server/publish-location-batch.ts', {
    'next/cache': { revalidatePath() {}, revalidateTag: (tag: string) => tags.push(tag) },
    '@/lib/server/public-data-resolver': {
      resolvePublicData: async () => ({ locations: ids.map(id => ({ id, slug: `old-${id}` })) }),
      resolvePublicSnapshotBundleUncached: async () => { if (failSource) throw Error('Synthetic authoritative source unavailable'); return { data: { locations: [] }, spots: [] } },
    },
    '@/lib/server/location-slugs-store': { readLocationSlugMap: async () => ({}), buildCanonicalLocationPath: () => assert.fail('Inactive spots must not have a new detail path') },
    '@/lib/server/r2': {
      uploadPublicSpotSnapshot: () => assert.fail('Excluded inactive spot must not upload a detail'),
      uploadPublicDataSnapshot: async (_key: string, bytes: Buffer) => { assert.equal(JSON.parse(bytes.toString()).locations.length, 0); uploads.push('locations'); return 'fixture' },
      uploadPublicSpotIndex: async (bytes: Buffer) => { assert.equal(JSON.parse(bytes.toString()).slugs.length, 0); uploads.push('index'); return 'fixture' },
    },
    '@/lib/server/public-content-store': { readPublicGuides: async () => [], readPublicNotes: async () => [] },
    '@/lib/publication-plan': { planPublication: () => ({ paths: [], englishPaths: [] }) },
  }).publishLocationBatch
  return { publish, uploads, tags, ids }
}
test('publisher completes collection/index removal when authoritative source excludes inactive spots', async () => {
  const f = publisher()
  const result = await f.publish(f.ids)
  assert.equal(result.spots.length, 0)
  assert.deepEqual(f.uploads, ['locations', 'index'])
  for (const id of f.ids) assert.ok(f.tags.includes(`public-spot:spot-${id}`))
})
test('authoritative source outages stay failures and are never classified as an intentional skip', async () => {
  const f = publisher(true)
  await assert.rejects(f.publish(f.ids), (error: any) => error.stage === 'snapshot' && error.message.includes('unavailable'))
  assert.equal(f.uploads.length, 0)
})

test('canonical Spot gate handles both locales before streaming and retains hidden/outage decisions', async () => {
  let routing: any = { visible: true }, fail = false, canonicalReads = 0
  const api = load('app/api/spot-routing/[slug]/route.ts', {
    '@/lib/location-routing': { extractLocationIdFromSlug: () => 1 },
    '@/lib/server/spot-routing': { readSpotRouting: async () => { if (fail) throw Error('Synthetic outage'); return routing } },
    '@/lib/server/public-spot-resolver': { getPublicSpotBySlug: async () => ({ spot: { id: 1, name: 'Current' }, source: 'cdn-cache' }) },
    '@/lib/server/location-slugs-store': { buildCanonicalLocationPath: async () => { canonicalReads++; return '/spot/current-1' } },
    '@/lib/server/localization-snapshot': { readLocalizationSnapshot: async () => ({}) },
    '@/lib/localization': { applyLocalization: () => ({ status: 'complete' }), localizationRecord: () => null },
  })
  for (const locale of ['', '?locale=en']) {
    const response = await api.GET(new Request(`http://localhost/api/spot-routing/old-1${locale}`), { params: { slug: 'old-1' } })
    const result = await response.json()
    assert.equal(result.destination, `${locale ? '/en' : ''}/spot/current-1`)
    assert.equal(result.status, 301)
  }
  const current = await api.GET(new Request('http://localhost/api/spot-routing/current-1'), { params: { slug: 'current-1' } })
  assert.equal((await current.json()).visible, true)
  assert.equal(current.headers.get('X-JNQ-SEO-Indexable'), 'true')
  routing = { visible: false }
  const hidden = await api.GET(new Request('http://localhost/api/spot-routing/old-1'), { params: { slug: 'old-1' } })
  assert.equal((await hidden.json()).visible, false); assert.equal(canonicalReads, 3)
  fail = true
  assert.equal((await api.GET(new Request('http://localhost/api/spot-routing/old-1'), { params: { slug: 'old-1' } })).status, 503)
  assert.equal(canonicalReads, 3)
})
