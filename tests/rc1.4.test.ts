import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import { guideSearchTitle, regionEditorial, spotCardExcerpt } from '../lib/public-editorial.ts'
import { getSpotDescription } from '../lib/content-display.ts'
import { guideContentSpotIds } from '../lib/guide-route-spot-ids.ts'
import { freshNoteSnapshotUrl, verifyNotePublication } from '../lib/note-publication.ts'

const require = createRequire(import.meta.url)
function load(file: string, mocks: Record<string, any>, globals: Record<string, any> = {}) {
  const context = { exports: {} as any, process: { env: {}, cwd: () => process.cwd() }, console, Buffer, URL, Request, Response, Headers, AbortSignal, setTimeout, clearTimeout, ...globals,
    require: (id: string) => { if (id in mocks) return mocks[id]; if (id.startsWith('@/')) throw Error(`Unmocked ${id}`); return require(id) },
  }
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, context, { filename: file })
  return context.exports
}

test('cards, excerpts and detail use the current description before legacy review; markdown stays readable', () => {
  const row = { description: '## 当前介绍\n\n正文 **特色** [详情](/notes/story)', review: '已过时的介绍' }
  assert.equal(getSpotDescription(row), row.description)
  assert.equal(spotCardExcerpt(row), '当前介绍 正文 特色 详情')
  assert.equal(spotCardExcerpt({ description: '', review: '保留的原文' }), '保留的原文')
  assert.equal(spotCardExcerpt({ description: '中'.repeat(200) }).length, 180)
  assert.ok(spotCardExcerpt({ description: '中'.repeat(200) }).endsWith('…'))
})
test('the actual public collection normalizer includes descriptions with matching source precedence', () => {
  const normalized = load('lib/server/public-data-resolver.ts', {
    'server-only': {}, '@supabase/supabase-js': {}, 'next/cache': { unstable_cache: (fn: any) => fn },
    '@/lib/public-data': require('../lib/public-data.ts'), '@/lib/public-spot': {}, '@/lib/public-region-media': {},
    '@/lib/homepage-order': { usableVisitDate: () => null }, '@/lib/spot-content': { isSpotPublished: () => true },
    '@/lib/public-editorial': { spotCardExcerpt },
  })
  const row = { id: 1, name: 'Saved', category: 'food', latitude: 1, longitude: 103, description: '当前正文', review: '旧评论' }
  assert.equal(normalized.normalizeSupabasePublicData([row], []).locations[0].shortSummary, '当前正文')
  assert.ok(normalized.PUBLIC_DATA_SELECTS.locations.split(',').includes('description'))
})
test('regional copy is bilingual and grounded in collected places rather than invented family or visit claims', () => {
  const zh = regionEditorial({ name: '美瑛' }, ['美瑛神社', '美瑛神社', '青池'])
  assert.ok(zh.introduction.includes('美瑛神社、青池'))
  for (const claim of ['亲子', '实地走访', '非常适合', '周末']) assert.ok(!zh.introduction.includes(claim))
  assert.match(zh.title, /旅游地图/)
  assert.ok(!regionEditorial({ name: 'Biei' }, [], 'en').description.includes('地点'))
  assert.equal(regionEditorial({ name: '美瑛', description: '已有高质量的地区原文。' }).introduction, '已有高质量的地区原文。')
})
test('Guangzhou replaces only the confirmed editor summary and adds source-backed authored SEO', () => {
  const guides = JSON.parse(readFileSync('data/guides.json', 'utf8'))
  const before = JSON.parse(require('node:child_process').execFileSync('git', ['show', 'f69d446:data/guides.json']).toString())
  const guide = guides.find((g: any) => g.slug === 'china-guangzhou-8d7n')
  assert.doesNotMatch(guide.summary, /按你|最新的打卡|继续补|预算/)
  assert.match(guide.seoTitle, /广州.*8天7夜/)
  for (const name of ['西华路', '北京路', '东山口', '永庆坊', '宝墨园', '沙湾古镇']) assert.ok(guide.summary.includes(name))
  const strip = (g: any) => { const { summary, seoTitle, seoDescription, ...rest } = g; return rest }
  assert.deepEqual(strip(guide), strip(before.find((g: any) => g.slug === guide.slug)))
  assert.deepEqual(guides.filter((g: any) => g.slug !== guide.slug), before.filter((g: any) => g.slug !== guide.slug))
  assert.equal(guideSearchTitle({ title: '广州', duration: '8 Days / 7 Nights' }), '广州｜8天7夜自由行攻略')
})
test('region associations include unassigned actual visits and accommodation but exclude disabled/reference visits', () => {
  const ids = guideContentSpotIds({ days: [], attractions: [{ spotId: 1, enabled: true }, { spotId: 2, enabled: false }], accommodationStays: [{ accommodationId: 3 }], itinerarySegments: [{ verifiedRoutes: [], referenceRoutes: [{ attractions: [{ spotId: 9 }] }], accommodationStays: [{ accommodationId: 4 }] }] } as any)
  assert.deepEqual([...ids], [1, 3, 4])
})
function contentStore(base: string, fetcher: any) {
  let fallbackReads = 0
  const store = load('lib/server/public-content-store.ts', {
    'server-only': {}, 'next/cache': { unstable_cache: (fn: any) => fn },
    '@/lib/guide-publication': { freshGuideSnapshotUrl: () => `${base}/public-data/guides.json?fresh=fixture` },
    '@/lib/note-publication': { freshNoteSnapshotUrl },
    '@/lib/server/guides-store': { normalizeGuidePayload: (g: any) => g, readGuides: async () => { fallbackReads++; return [{ slug: 'old-guide', title: 'Old guide' }] } },
    '@/lib/server/notes-store': { normalizeNotePayload: (n: any) => n, readPublishedNotes: async () => { fallbackReads++; return [{ slug: 'old-note', title: 'Old note', published: true }] } },
  }, { process: { env: { PUBLIC_DATA_CDN_BASE_URL: base } }, fetch: fetcher })
  return { store, fallbacks: () => fallbackReads }
}
test('configured public origin errors and malformed collections cannot resurrect an older local collection', async () => {
  for (const response of [() => new Response('', { status: 503 }), () => Response.json({ schemaVersion: 1, notes: null }), () => Response.json({ schemaVersion: 2, guides: [] })]) {
    const f = contentStore('https://fixture.invalid', async () => response())
    await assert.rejects(f.store.readPublicNotes()); await assert.rejects(f.store.readPublicGuides())
    assert.equal(f.fallbacks(), 0)
  }
  const offline = contentStore('', () => assert.fail('No configured origin means no fetch'))
  assert.equal((await offline.store.readPublicGuides())[0].slug, 'old-guide')
  assert.equal((await offline.store.readPublicNotes())[0].slug, 'old-note')
})
test('current Note snapshot is read through a fresh URL and explicit empty publications remain empty', async () => {
  const urls: string[] = []
  const f = contentStore('https://fixture.invalid', async (url: string) => { urls.push(url); return Response.json({ schemaVersion: 1, notes: [] }) })
  assert.equal((await f.store.readPublicNotes()).length, 0)
  assert.equal(f.fallbacks(), 0)
  assert.match(urls[0], /notes\.json\?fresh=/)
  assert.notEqual(freshNoteSnapshotUrl('https://fixture.invalid'), freshNoteSnapshotUrl('https://fixture.invalid'))
})
test('Note publication accepts byte-identical read-back and rejects stale bytes or failed responses', async () => {
  const bytes = Buffer.from('{"notes":["new"]}')
  await verifyNotePublication('https://fixture.invalid', bytes, async (_url, init) => { assert.equal(init?.cache, 'no-store'); return new Response(bytes) })
  await assert.rejects(verifyNotePublication('https://fixture.invalid', bytes, async () => new Response('{"notes":["old"]}')), /verification failed/)
  await assert.rejects(verifyNotePublication('https://fixture.invalid', bytes, async () => new Response('', { status: 503 })), /read-back failed/)
})
test('English snapshot reads reject a configured source failure even outside explicit refresh', async () => {
  let fallbackReads = 0
  const { readBilingualSnapshot } = load('lib/server/localization-snapshot.ts', {
    '@/public-data/i18n/en/records.json': {}, '@/lib/note-publication': { freshNoteSnapshotUrl },
  }, { process: { env: { PUBLIC_DATA_CDN_BASE_URL: 'https://fixture.invalid' } }, fetch: async () => new Response('', { status: 503 }) })
  await assert.rejects(readBilingualSnapshot('notes.json', async () => { fallbackReads++; return { notes: ['stale'] } }, () => true))
  assert.equal(fallbackReads, 0)
})
test('five Spot drafts remain non-executable proposals with hashes and explicit partial-source limits', () => {
  const report = JSON.parse(readFileSync('docs/rc1.4/spot-review-drafts.json', 'utf8'))
  assert.equal(report.drafts.length, 5)
  for (const draft of report.drafts) {
    assert.equal(draft.state, 'REVIEW_ONLY_NOT_APPLIED'); assert.equal(draft.source.currentDatabaseVerified, false)
    assert.equal(draft.source.seoPresence, 'UNKNOWN_FIELDS_OMITTED'); assert.equal(draft.source.sha256.length, 64)
    assert.ok(draft.linkedGuides.length); assert.ok(draft.proposed.description.length < 300)
    assert.doesNotMatch(draft.proposed.description, /你可以|草稿|后续|我们|This is|Deep in/)
  }
})

test('Note uploader uses no-store, performs one independent verification and never replays a committed upload', async () => {
  const events: string[] = [], env = { R2_ACCOUNT_ID: 'fixture', R2_ACCESS_KEY_ID: 'fixture', R2_SECRET_ACCESS_KEY: 'fixture', R2_BUCKET_NAME: 'fixture', R2_PUBLIC_BASE_URL: 'https://fixture.invalid' }
  const r2 = load('lib/server/r2.ts', {
    'server-only': {}, '@/lib/guide-publication': {}, '@/lib/note-publication': { verifyNotePublication: async () => { events.push('verify'); throw Error('Stale public snapshot') } },
    '@aws-sdk/client-s3': { PutObjectCommand: class { input: any; constructor(input: any) { this.input = input } }, S3Client: class { async send(command: any) { assert.equal(command.input.CacheControl, 'no-store, max-age=0'); assert.equal(command.input.Key, 'public-data/notes.json'); events.push('upload') } } },
  }, { process: { env } })
  await assert.rejects(r2.uploadPublicNotesSnapshot(Buffer.from('{"notes":[]}')), /Stale public snapshot/)
  assert.deepEqual(events, ['upload', 'verify'])
})

test('Guangzhou local region fallback drops only its incomplete English translation tail', () => {
  const current = JSON.parse(readFileSync('public-data/regions.json', 'utf8'))
  const prior = JSON.parse(require('node:child_process').execFileSync('git', ['show', 'f69d446:public-data/regions.json']).toString())
  const before = prior.regions.find((r: any) => r.id === 42)
  const after = current.regions.find((r: any) => r.id === 42)
  assert.equal(after.shortSummary, before.shortSummary.split(' Guangzhou is a major city')[0].trim())
  assert.deepEqual(current.regions.filter((r: any) => r.id !== 42), prior.regions.filter((r: any) => r.id !== 42))
  assert.deepEqual({ ...after, shortSummary: null }, { ...before, shortSummary: null })
})

test('existing Guide normalization preserves optional authored search copy through save/read cycles', () => {
  const normalize = load('lib/server/guides-store.ts', {
    '@/lib/guide-attractions': {}, '@supabase/supabase-js': {}, '@/lib/guide-budget': require('../lib/guide-budget.ts'),
    '@/lib/guide-drafts': {}, '@/data/guides.json': [], '@/lib/guide-collection': {}, '@/lib/guide-unassigned': {},
  }).normalizeGuidePayload
  const data = { slug: 'guangzhou', title: '广州', seoTitle: '广州番禺路线', seoDescription: '独立的搜索描述' }
  const value = normalize(data)
  assert.equal(value.seoTitle, data.seoTitle); assert.equal(value.seoDescription, data.seoDescription)
  assert.equal(normalize(value).seoTitle, data.seoTitle)
})
