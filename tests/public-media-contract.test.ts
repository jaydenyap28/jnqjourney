import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { resolvePublicImage, uniquePublicImages } from '../lib/public-media.ts'
import { resolveGuidePublicMedia, resolveNotePublicMedia, selectPublicSpotCards } from '../lib/server/public-content-media.ts'
import type { TravelGuide } from '../lib/guides.ts'
import type { LongformNote } from '../lib/notes.ts'
import type { PublicLocation } from '../lib/public-data.ts'

const r2 = (name: string) => `https://jnq-test.r2.dev/locations/${name}.webp`
const locations: PublicLocation[] = [
  { id: 232, slug: 'pulau-kapas-232', name: '棉花岛 / Pulau Kapas', region: null, category: 'attraction', latitude: 1, longitude: 1, thumbnail: r2('pulau-kapas'), shortSummary: null },
  { id: 317, slug: 'bao-mo-garden-317', name: '宝墨园 / Baomo Garden', region: null, category: 'attraction', latitude: 1, longitude: 1, thumbnail: r2('baomo'), shortSummary: null },
  { id: 374, slug: 'ningle-terrace-374', name: '精灵露台 / Ningle Terrace', region: null, category: 'attraction', latitude: 1, longitude: 1, thumbnail: r2('ningle'), shortSummary: null },
  { id: 511, slug: 'ice-world-511', name: '冰雪大世界 / Ice and Snow World', region: null, category: 'attraction', latitude: 1, longitude: 1, thumbnail: r2('ice-world'), shortSummary: null },
  { id: 516, slug: 'blue-moon-valley-516', name: '蓝月谷 / Blue Moon Valley', region: null, category: 'attraction', latitude: 1, longitude: 1, thumbnail: r2('blue-moon-valley'), shortSummary: null },
  { id: 217, slug: 'monica-bay-217', name: 'Pantai Teluk Mak Nik (Monica Bay)', region: null, category: 'attraction', latitude: 1, longitude: 1, thumbnail: r2('monica-bay'), shortSummary: null },
]

function guide(value: Partial<TravelGuide>): TravelGuide {
  return {
    slug: 'fixture', title: 'Fixture', shortTitle: 'Fixture', tagline: '', summary: '', duration: '', budget: '', budgetScope: 'unspecified', travelStyle: '', route: [], coverAccent: '', highlightTags: [], heroBullets: [], budgetItems: [], days: [], bestFor: [], notes: [], featuredSpotNames: [], featuredAffiliateLinkIds: [],
    ...value,
  }
}

test('shared resolver keeps explicit priority and de-duplicates transformed URLs', () => {
  const cover = 'https://cdn.example.com/a.webp#focus=50,50'
  assert.equal(resolvePublicImage({ cover, images: ['https://cdn.example.com/a.webp?width=900'] }), cover)
  assert.deepEqual(uniquePublicImages([cover, 'https://cdn.example.com/a.webp?width=900']), [cover])
})

test('all six public Guide cover paths resolve to R2 without mutating stored media', () => {
  const fixtures = [
    guide({ slug: 'china-jiangnan-autumn-15d14n' }),
    guide({ slug: 'malaysia-east-coast-route3-10d9n', coverImage: 'https://i.ibb.co/x/Pulau-Kapas.webp', days: [{ dayLabel: 'Day 1', title: '', summary: '', highlights: [], linkedSpots: ['Pulau Kapas'] }] }),
    guide({ slug: 'china-harbin-xuegu-changbai-beijing-11d10n', coverImage: 'https://facebook.example/597774876_photo.jpg' }),
    guide({ slug: 'china-dali-shangri-la-lijiang-11d10n', coverImage: 'https://supabase.example/93069da3-8e1d-4e34-92ca-e9e8a4ab5709.webp' }),
    guide({ slug: 'japan-hokkaido-yamagata-tokyo-10d9n', coverImage: 'https://i.ibb.co/x/E.webp', featuredSpotNames: ['Ningle Terrace'] }),
    guide({ slug: 'china-guangzhou-8d7n', coverImage: 'https://supabase.example/a82f3fac-b11b-4de9-abca-31017e7d0935.webp' }),
  ]
  const storedCovers = fixtures.map((item) => item.coverImage)
  const resolved = fixtures.map((item) => resolveGuidePublicMedia(item, locations))
  assert.ok(resolved.every((item) => item.coverImage?.includes('.r2.dev/')))
  assert.deepEqual(fixtures.map((item) => item.coverImage), storedCovers)
})

test('Guide and Longform Spot cards select the shared lightweight snapshot by stable ID or exact name', () => {
  assert.deepEqual(selectPublicSpotCards(locations, { ids: [217] }).map((spot) => spot.id), [217])
  assert.deepEqual(selectPublicSpotCards(locations, { names: ['Pulau Kapas'] }).map((spot) => spot.id), [232])
})

test('Longform cover and spot-media blocks fall back to the referenced R2 Spot media', () => {
  const note = {
    slug: 'note', title: 'Note', shortTitle: 'Note', kicker: '', tagline: '', summary: '', coverImage: 'https://supabase.example/cover.webp', coverAccent: '', published: true, tags: [], relatedRegionIds: [], relatedSpotIds: [217],
    blocks: [{ id: 'media', type: 'spotImages', spotId: 217, images: [{ src: 'https://supabase.example/one.webp', alt: 'Photo one' }, { src: 'https://i.ibb.co/x/two.webp', alt: 'Photo two' }] }],
  } as LongformNote
  const resolved = resolveNotePublicMedia(note, locations)
  assert.equal(resolved.coverImage, r2('monica-bay'))
  assert.deepEqual(resolved.blocks[0].images?.map((item) => item.src), [r2('monica-bay')])
  assert.equal(note.blocks[0].images?.length, 2)
})

test('Guide and Longform public pages do not query the locations table directly', async () => {
  const sources = await Promise.all([
    readFile('app/guide/[slug]/page.tsx', 'utf8'),
    readFile('app/notes/[slug]/page.tsx', 'utf8'),
  ])
  for (const source of sources) assert.doesNotMatch(source, /\.from\(['"]locations['"]\)/)
})

test('lightweight snapshot builder preserves existing Spot detail files by default', async () => {
  const source = await readFile('scripts/build-public-spot-fallbacks.mjs', 'utf8')
  assert.match(source, /preserved \+= 1/)
  assert.match(source, /--replace-lightweight/)
  assert.doesNotMatch(source, /select\(['"]\*['"]\)/)
})

test('public list APIs keep cache headers and exclude full media collections', async () => {
  const [guidesRoute, notesRoute] = await Promise.all([
    readFile('app/api/guides/route.ts', 'utf8'),
    readFile('app/api/notes/route.ts', 'utf8'),
  ])
  assert.match(guidesRoute, /PUBLIC_CACHE_CONTROL/)
  assert.match(notesRoute, /PUBLIC_CACHE_CONTROL/)
  assert.doesNotMatch(guidesRoute, /gallery:\s*guide/)
  assert.doesNotMatch(notesRoute, /blocks:\s*note/)
})
