const test = require('node:test')
const assert = require('node:assert/strict')
const { loader } = require('./helpers/spot-travel-loader.cjs')
const load = loader()
const { relatedPackagesForSpot, nearbySpots } = load('lib/spot-relations.ts')
const { notesForSpot } = load('lib/content-relations.ts')
const { toHomeGuideCard, toHomeNoteCard, toPackageCard } = load('lib/home-cards.ts')
const { isSerializableProps } = require('next/dist/lib/is-serializable-props')

test('packages require published status and a concrete saved relationship', () => {
  const packages = [{ slug: 'unrelated', status: 'published', region_id: null }, { slug: 'draft', status: 'draft', related_location_ids: [449] }, { slug: 'direct', status: 'published', related_location_ids: [449] }, { slug: 'guide', status: 'published', related_guide_slugs: ['route'] }]
  assert.deepEqual(relatedPackagesForSpot({ id: 449, region_id: null }, packages, ['route']).map(p => p.slug), ['direct', 'guide'])
})
test('notes resolve explicit reverse references, not region-only matches or drafts', () => {
  const notes = [{ slug: 'draft', title: 'Draft', published: false, relatedSpotIds: [449] }, { slug: 'regional', title: 'Regional', published: true, relatedRegionIds: [69] }, { slug: 'direct', title: 'Direct', published: true, relatedSpotIds: [449] }]
  assert.deepEqual(notesForSpot({ id: 449 }, notes).map(n => n.slug), ['direct'])
})
test('curated Shanghai ferry links apply only to 449 and 452 without changing inputs or quality', () => {
  const { evaluateSpotQuality } = load('lib/spot-quality.ts')
  const ferry = Object.freeze({
    slug: 'shanghai-2-yuan-ferry-dongjin-dongfu-taigong', title: 'Shanghai ferry',
    published: true, relatedSpotIds: Object.freeze([]), blocks: Object.freeze([]),
  })
  const notes = Object.freeze([ferry])
  for (const id of [449, 452, 447, 448, 458, 608]) {
    const spot = Object.freeze({ id, related_note_slugs: null, description: 'a'.repeat(180), images: Object.freeze(['a', 'b']) })
    const quality = evaluateSpotQuality(spot)
    assert.deepEqual(notesForSpot(spot, notes).map(note => note.slug), [449, 452].includes(id) ? [ferry.slug] : [])
    assert.deepEqual(evaluateSpotQuality(spot), quality)
    assert.equal(quality.indexable, false)
  }
  assert.deepEqual(ferry.relatedSpotIds, [])
})
test('curated links retain publication filtering, deduplication and saved relation priority', () => {
  const ferry = { slug: 'shanghai-2-yuan-ferry-dongjin-dongfu-taigong', aliases: ['ferry-alias'], published: true, relatedSpotIds: [449] }
  for (const id of [449, 452]) {
    assert.deepEqual(notesForSpot({ id }, []), [])
    assert.deepEqual(notesForSpot({ id }, [{ ...ferry, published: false }]), [])
    assert.deepEqual(notesForSpot({ id, related_note_slugs: ['ferry-alias', ferry.slug] }, [ferry]).map(note => note.slug), [ferry.slug])
    const existing = [
      { slug: 'manual', published: true },
      { slug: 'reverse', published: true, relatedSpotIds: [id] },
      { slug: 'embedded', published: true, blocks: [{ spotId: id }] },
    ]
    assert.deepEqual(notesForSpot({ id, related_note_slugs: ['manual'] }, [...existing, ferry]).map(note => note.slug), ['manual', 'reverse', 'embedded'])
    assert.deepEqual(notesForSpot({ id, related_note_slugs: ['manual'] }, [...existing.slice(0, 2), ferry]).map(note => note.slug), ['manual', 'reverse', ferry.slug])
  }
})
test('nearby places exclude self, distant points and other regions and sort by distance', () => {
  const spot = { id: 449, region_id: 69, latitude: 31.24, longitude: 121.49 }
  const loc = (id, latitude, region = 69) => ({ id, latitude, longitude: 121.49, region: { id: region } })
  assert.deepEqual(nearbySpots(spot, [loc(449, 31.24), loc(1, 31.26), loc(2, 31.25), loc(3, 35), loc(4, 31.241, 42)]).map(l => l.id), [2, 1])
})
test('home cards preserve display text/media while dropping itinerary and note/package bodies', () => {
  const guide = { slug: 'route', title: 'Title', duration: '3 days', coverImage: 'https://example.com/cover.jpg', route: [{ name: 'Shanghai', secretDetail: 'unused' }], days: [{ gallery: [], content: 'long body' }] }
  const card = toHomeGuideCard(guide)
  assert.equal(card.coverImage, guide.coverImage); assert.equal(card.duration, guide.duration); assert.deepEqual(card.route, [{ name: 'Shanghai' }]); assert.equal(card.days, undefined)
  assert.equal(toHomeNoteCard({ slug: 'note', title: 'Note', content: 'unused', blocks: [] }).content, undefined)
  assert.equal(toPackageCard({ id: 1, slug: 'p', title_zh: 'Tour', full_description: 'unused', itinerary_days: [] }).full_description, undefined)
  assert.ok(isSerializableProps('/en', 'getStaticProps', { guides: [card], notes: [toHomeNoteCard({ slug: 'note', title: 'Note' })], packages: [toPackageCard({ id: 1, slug: 'p', title_zh: 'Tour' })] }))
})
