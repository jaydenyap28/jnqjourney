import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import http from 'node:http'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { spotSeo, spotImageText } from '../lib/spot-content.ts'
import { normalizeSpotRedirect, resolveSpotRouting } from '../lib/spot-redirect.ts'
import { selectRelatedNotes, selectNoteSpotIds, relatedNotesForNote } from '../lib/content-relations.ts'
import { EMPTY_NOTE } from '../lib/notes.ts'
import { publicSpotFromSupabaseRow } from '../lib/public-spot.ts'
import type { PublicLocation, PublicRegion } from '../lib/public-data.ts'

const require = createRequire(import.meta.url)
const cache = new Map<string, any>()
function load(file: string, mocks: Record<string, any> = {}): any {
  if (cache.has(file) && !Object.keys(mocks).length) return cache.get(file)
  const context = { exports: {} as any, process, console, URL, setTimeout, clearTimeout, fetch, Buffer, require: (id: string) => {
    if (id in mocks) return mocks[id]
    if (id === 'next/dynamic') return () => () => null
    if (id === 'next/navigation') return { usePathname: () => '/spot/example-1', useRouter: () => ({}) }
    if (id === 'next/link') return ({ children, href, ...props }: any) => React.createElement('a', { ...props, href }, children)
    if (id === 'next/image') return ({ fill, priority, unoptimized, ...props }: any) => React.createElement('img', props)
    if (id.startsWith('@/') || id.startsWith('.')) {
      const target = id.startsWith('@/') ? id.slice(2) : path.join(path.dirname(file), id)
      const resolved = ['', '.ts', '.tsx', '.json'].map(ext => target + ext).find(existsSync)
      if (!resolved) throw Error(`Cannot resolve ${id} in ${file}`)
      if (resolved.endsWith('.json')) return JSON.parse(readFileSync(resolved, 'utf8'))
      return load(resolved, mocks)
    }
    return require(id)
  }}
  const js = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
  vm.runInNewContext(js, context, { filename: file })
  if (!Object.keys(mocks).length) cache.set(file, context.exports)
  return context.exports
}
const spot = { id: 1, slug: 'old-1', name: 'River Ferry', name_cn: '渡口', description: '沿江欣赏风景。', latitude: 31, longitude: 121 }
const regions: PublicRegion[] = [
  { id: 10, name: 'Shanghai', country: 'China', parentId: null },
  { id: 11, name: 'Huangpu', country: 'China', parentId: 10 },
  { id: 20, name: 'Langkawi', country: 'Malaysia', parentId: null },
].map(r => ({ ...r, slug: r.name, thumbnail: null, shortSummary: null, code: null }))
const locations = [
  { ...spot, id: 1, region: { ...regions[0] } },
  { ...spot, id: 2, region: { ...regions[1] } },
  { ...spot, id: 3, region: { ...regions[2] } },
].map(l => ({ ...l, category: 'attraction', thumbnail: null, shortSummary: null })) as PublicLocation[]
const note = { ...EMPTY_NOTE, slug: 'shanghai', title: 'Shanghai', published: true, relatedRegionIds: [10], tags: ['ferry'] }

test('SEO fallback and bilingual overrides never require changed page names', () => {
  assert.deepEqual(spotSeo(spot, 'zh'), { title: '渡口 | JnQ Journey', description: spot.description })
  assert.equal(spotSeo({ ...spot, seo_title_zh: '上海轮渡攻略', seo_description_zh: '亲测轮渡路线' }, 'zh').title, '上海轮渡攻略')
  assert.equal(spotSeo({ ...spot, seo_title_en: 'Shanghai ferry', seo_description_en: 'First-hand ferry guide' }, 'en').description, 'First-hand ferry guide')
  assert.ok(spotSeo({ name: 'Legacy' }, 'en').description.includes('Legacy'))
})
test('image text has no URL/UUID fallback and survives focal-point changes', () => {
  const url = 'https://cdn.test/a5812e6a-253d-47bb-aa4a-551455445533.webp'
  assert.equal(spotImageText(spot, url, 1, 'zh').alt, '渡口 — 照片 2')
  assert.deepEqual(spotImageText({ ...spot, image_metadata: { [url]: { alt_en: 'Ferry at sunset', caption: 'Evening crossing' } } }, `${url}focus=50,60`, 0, 'en').caption, '')
  assert.equal(spotImageText({ ...spot, image_metadata: { [url]: { alt_en: 'Ferry at sunset' } } }, `${url}#focus=50,60`, 0, 'en').alt, 'Ferry at sunset')
})
test('Shanghai geography never recommends Langkawi; missing geography returns nothing', () => {
  assert.deepEqual(selectNoteSpotIds(note, locations, regions), [1, 2])
  assert.deepEqual(selectNoteSpotIds({ ...note, relatedRegionIds: [] }, locations, regions), [])
  assert.deepEqual(selectNoteSpotIds({ ...note, relatedSpotIds: [2, 1] }, locations, regions), [2, 1])
  assert.deepEqual(selectNoteSpotIds({ ...note, relatedSpotIds: [999] }, locations, regions), [999])
})
test('manual Note relations preserve order, aliases, dedupe and publication boundary', () => {
  const other = { ...note, slug: 'two', aliases: ['old-two'] }
  const hidden = { ...note, slug: 'hidden', published: false }
  assert.deepEqual(selectRelatedNotes(['old-two', 'shanghai', 'two', 'hidden'], [note, other, hidden]).map(n => n.slug), ['two', 'shanghai'])
  assert.deepEqual(relatedNotesForNote({ ...note, relatedNoteSlugs: ['hidden'] }, [hidden, other], locations, regions), [])
  assert.deepEqual(relatedNotesForNote(note, [{ ...other, relatedRegionIds: [20] }, other], locations, regions).map(n => n.slug), ['two'])
})
test('snapshot serialization preserves optional content without rewriting legacy data', () => {
  const row = { ...spot, seo_title_en: 'Ferry guide', experience_zh: '亲身体验', image_metadata: { cover: { alt_zh: '渡船' } }, related_note_slugs: ['two', 'shanghai'] }
  const result = publicSpotFromSupabaseRow(row, locations[0])
  assert.equal(result.description, spot.description)
  assert.equal(result.experience_zh, row.experience_zh)
  assert.deepEqual(result.related_note_slugs, row.related_note_slugs)
  assert.deepEqual(result.image_metadata, row.image_metadata)
})
test('redirects validate schemes, self aliases, multi-hop loops, hidden states and chain termination', async () => {
  for (const target of ['https://evil.test', '//evil.test', '/spot/a-1?x=y', '/spot/%2e%2e', '/notes/a#b', '/notes/../a', '/notes/a\\b']) assert.throws(() => normalizeSpotRedirect(target))
  await assert.rejects(resolveSpotRouting(1, async id => ({ id, status: 'active', redirect_url: '/spot/alias-1' })), /loop/)
  await assert.rejects(resolveSpotRouting(1, async id => ({ id, status: 'active', redirect_url: `/spot/alias-${id === 1 ? 2 : 1}` })), /loop/)
  assert.deepEqual(await resolveSpotRouting(1, async id => ({ id, publication_status: 'hidden' })), { visible: false })
  assert.deepEqual(await resolveSpotRouting(1, async id => ({ id, publication_status: 'hidden', redirect_url: '/notes/shanghai-ferry' })), { visible: false, destination: '/notes/shanghai-ferry', status: 301 })
  assert.deepEqual(await resolveSpotRouting(1, async id => ({ id, status: 'closed', publication_status: null })), { visible: true })
  assert.deepEqual(await resolveSpotRouting(1, async id => ({ id, status: 'active', publication_status: 'draft' })), { visible: false })
  assert.equal((await resolveSpotRouting(1, async id => ({ id, status: 'active', redirect_type: 302, redirect_url: id === 1 ? '/spot/new-2' : '/notes/ferry' }))).status, 302)
})
test('real middleware produces HTTP 301 and Location for both locale paths and old aliases', async () => {
  const { NextRequest } = require('next/server')
  const { middleware } = load('middleware.ts', {})
  // Reload with an isolated fetch transport; Node HTTP receives the actual NextResponse.
  const source = ts.transpileModule(readFileSync('middleware.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const context = {exports:{} as any, require, console, URL, fetch: async () => Response.json({ destination:'/notes/shanghai-ferry', status:301 })}
  vm.runInNewContext(source, context)
  const server = http.createServer(async (req, res) => {
    const response = await context.exports.middleware(new NextRequest(`http://localhost${req.url}`))
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text())
  })
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve))
  try {
    const address = server.address() as {port:number}
    for (const route of ['/spot/old-1','/spot/alias-1','/en/spot/alias-1']) {
      const response = await fetch(`http://127.0.0.1:${address.port}${route}`, {redirect:'manual'})
      assert.equal(response.status,301); assert.equal(response.headers.get('location'),'http://localhost/notes/shanghai-ferry')
    }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
  assert.ok(middleware)
})
test('legacy and enriched Spot render with unchanged H1 and conditional experience, cards and alt', () => {
  const { default: SpotContent } = load('components/SpotContent.tsx')
  const render = (location: any) => renderToStaticMarkup(React.createElement(SpotContent, {location,mode:'page',relatedNotes:[note]}))
  const legacy = render(spot)
  assert.match(legacy, /沿江欣赏风景/)
  assert.doesNotMatch(legacy, /JnQ Experience/)
  const rich = render({...spot, seo_title_zh:'CUSTOM SEO ONLY',experience_zh:'我们乘坐渡船看日落。',image_url:'https://cdn.test/uuid.webp'})
  assert.match(rich,/JnQ Experience/); assert.match(rich,/我们乘坐渡船看日落/)
  assert.match(rich,/href="\/notes\/shanghai"/)
  assert.match(rich,/alt="渡口 — 照片 1"/)
  assert.doesNotMatch(rich,/CUSTOM SEO ONLY/)
  assert.equal((rich.match(/<h1\b/g) || []).length,1)
})

test('actual Spot metadata includes canonical, custom SEO, OG and Twitter cover', async () => {
  const custom = { ...spot, seo_title_zh: '上海两元轮渡', seo_description_zh: '上海轮渡亲身体验。', image_url: 'https://cdn.test/cover.webp' }
  const { generateMetadata } = load('app/spot/[slug]/page.tsx', {
    '@/lib/server/localized-seo': { chineseLocalizedAlternates: async (path: string) => ({ canonical: `https://www.jnqjourney.com${path}` }) },
    '@/lib/server/location-slugs-store': { buildCanonicalLocationPath: async () => '/spot/river-ferry-1' },
    '@/lib/server/public-location-data': {},
    '@/lib/server/public-spot-resolver': { getPublicSpotBySlug: async () => ({ spot: custom }) },
    '@/lib/server/public-content-store': {},
    '@/lib/server/travel-packages': {},
  })
  const metadata = await generateMetadata({params:{slug:'old-1'}})
  assert.equal(metadata.title.absolute, custom.seo_title_zh)
  assert.equal(metadata.description, custom.seo_description_zh)
  assert.equal(metadata.alternates.canonical, 'https://www.jnqjourney.com/spot/river-ferry-1')
  assert.equal(metadata.openGraph.title, custom.seo_title_zh)
  assert.equal(metadata.openGraph.images[0].url, custom.image_url)
  assert.equal(metadata.twitter.card, 'summary_large_image')
  assert.equal(metadata.twitter.description, custom.seo_description_zh)
})

test('Note payload normalization round-trips related lists and retains body, affiliate blocks and aliases', () => {
  const { normalizeNotePayload } = load('lib/server/notes-store.ts')
  const input = {...note,aliases:['old-note'],relatedSpotIds:[2,1],relatedNoteSlugs:['second','first'],blocks:[{id:'a',type:'affiliate',affiliateIds:[9]},{id:'p',type:'paragraph',content:'Original text'}]}
  const output = normalizeNotePayload(input)
  assert.deepEqual(Array.from(output.relatedSpotIds),[2,1])
  assert.deepEqual(Array.from(output.relatedNoteSlugs),['second','first'])
  assert.equal(output.blocks[0].affiliateIds[0],9)
  assert.equal(output.blocks[1].content,'Original text')
  assert.equal(output.aliases[0],'old-note')
})
