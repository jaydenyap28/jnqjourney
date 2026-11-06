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
