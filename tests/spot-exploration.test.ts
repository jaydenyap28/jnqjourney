import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createSpotSearch, EMPTY_SPOT_FILTERS, normalizeSearch, readSpotFilters } from '../lib/spot-search.ts'
import { gallerySwipeDirection } from '../lib/gallery-gesture.ts'
import { toHomeGuideCard, toHomeNoteCard } from '../lib/home-cards.ts'
import type { PublicLocation } from '../lib/public-data.ts'
import type { TravelGuide } from '../lib/guides.ts'
import type { LongformNote } from '../lib/notes.ts'

// Actual bundled public records, never synthetic browser-performance claims.
const spots: PublicLocation[] = JSON.parse(fs.readFileSync('public-data/locations.json', 'utf8')).locations
const search = createSpotSearch(spots)
const run = (q: string) => search({ ...EMPTY_SPOT_FILTERS, q })

test('Chinese, original Japanese, English, partial and normalized names find the stored place', () => {
  assert.match(run('南湖')[0].name, /南湖/)
  assert.match(run('湯けむり')[0].name, /湯けむり/)
  assert.match(run('珈琲')[0].name, /Cafe Mori/)
  assert.deepEqual(run('  CAFE   MORI  ').map(x => x.id), run('cafe mori').map(x => x.id))
  assert.deepEqual(run('Ｃａｆｅ　Ｍｏｒｉ').map(x => x.id), run('cafe mori').map(x => x.id))
  assert.equal(run('不存在的火星景点zzzzz').length, 0)
})

test('country, city and category filters intersect and clear without truncating results', () => {
  const region = spots.find(spot => spot.region?.name.includes('广州'))!.region!
  const filters = { q: '', country: region.country!, region: String(region.id), category: 'food' }
  assert.deepEqual(search(filters).map(x => x.id), spots.filter(x => x.region?.id === region.id && x.category === 'food').map(x => x.id))
  assert.equal(search(EMPTY_SPOT_FILTERS).length, spots.length)
  assert.ok(search({ ...EMPTY_SPOT_FILTERS, category: 'accommodation' }).length > 0)
  assert.ok(run('住宿').some(x => x.category === 'accommodation'))
})

test('restored URL conditions preserve all filters and do not mutate canonical records', () => {
  const before = JSON.stringify(spots)
  assert.deepEqual(readSpotFilters('?q=CAFE+MORI&country=Japan&region=5&category=food&lang=en'), { q: 'CAFE MORI', country: 'Japan', region: '5', category: 'food' })
  run('Farm'); search({ ...EMPTY_SPOT_FILTERS, country: 'Malaysia' })
  assert.equal(JSON.stringify(spots), before)
  assert.equal(normalizeSearch(' A　 B '), 'a b')
})

test('gallery swipes distinguish horizontal travel, vertical scroll and taps', () => {
  const start = { x: 150, y: 100 }
  assert.equal(gallerySwipeDirection(start, { x: 50, y: 105 }), 1)
  assert.equal(gallerySwipeDirection(start, { x: 250, y: 105 }), -1)
  assert.equal(gallerySwipeDirection(start, { x: 170, y: 102 }), 0)
  assert.equal(gallerySwipeDirection(start, { x: 200, y: 250 }), 0)
})

test('home projections retain authored covers and card text while excluding long content', () => {
  const raw = JSON.parse(fs.readFileSync('data/guides.json', 'utf8'))
  const guides: TravelGuide[] = Array.isArray(raw) ? raw : raw.guides
  const before = JSON.stringify(guides)
  for (const guide of guides) {
    const card = toHomeGuideCard(guide)
    assert.equal(card.slug, guide.slug)
    assert.equal(card.title, guide.title)
    if (guide.coverImage) assert.equal(card.coverImage, guide.coverImage.trim())
    assert.ok(card.route.length <= 6)
    assert.ok(!('days' in card)); assert.ok(!('budgetItems' in card))
  }
  const notes: LongformNote[] = JSON.parse(fs.readFileSync('data/notes.json', 'utf8'))
  for (const note of notes) {
    const card = toHomeNoteCard(note)
    assert.equal(card.coverImage, note.coverImage)
    assert.equal(card.slug, note.slug)
    assert.ok(!('blocks' in card))
  }
  assert.equal(JSON.stringify(guides), before)
})
