const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

// Execute the real TS/TSX modules without a build or a browser.
function loader() {
  const cache = new Map()
  function load(file) {
    file = path.resolve(file)
    if (cache.has(file)) return cache.get(file).exports
    const mod = { exports: {} }; cache.set(file, mod)
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText
    const req = name => {
      if (name.endsWith('/PublicLocale')) return {
        PublicCopy: ({ text }) => text,
        PublicLink: ({ children, ...props }) => React.createElement('a', props, children),
      }
      if (name === 'next/link') return ({ children, ...props }) => React.createElement('a', props, children)
      if (name === './FallbackImage') return ({ fill, priority, ...props }) => React.createElement('img', props)
      if (name === '@/components/GuideDayStayCard') return { __esModule: true, default: () => null }
      if (name.startsWith('@/components/')) return new Proxy({ __esModule: true, default: name.slice('@/components/'.length) }, { get: (target, key) => key in target ? target[key] : String(key) })
      if (name === '@/data/guides.json') return []
      if (name === '@/lib/guide-drafts') return { jiangnanGuideDraft: { slug: 'unused' } }
      if (name.startsWith('@/') || name.startsWith('.')) {
        let next = name.startsWith('@/') ? path.resolve(name.slice(2)) : path.resolve(path.dirname(file), name)
        if (!path.extname(next)) next += fs.existsSync(next + '.ts') ? '.ts' : '.tsx'
        return load(next)
      }
      return require(name)
    }
    new Function('require', 'exports', 'module', source)(req, mod.exports, mod)
    return mod.exports
  }
  return load
}
const load = loader()
const { orderedGuideAttractions, orderedGuideDayRoute } = load('lib/guide-attractions.ts')
const { selectGuideRouteNoteCards } = load('lib/content-relations.ts')
const { normalizeGuidePayload } = load('lib/server/guides-store.ts')
const Route = load('components/GuideDayRoute.tsx').default
const spots = [
  { id: 1, name: 'Bund', name_cn: '外滩', latitude: 31.24, longitude: 121.49, category: 'attraction' },
  { id: 2, name: 'Lujiazui', name_cn: '陆家嘴', latitude: 31.23, longitude: 121.50, category: 'attraction' },
]
const routeItems = [
  { type: 'spot', spotId: 1, displayOrder: 99 },
  { type: 'note', noteSlug: 'shanghai-ferry', displayName: '上海2元渡轮体验', latitude: 88, longitude: 99 },
  { type: 'spot', spotId: 2, displayOrder: 0 },
]
const routeNotes = [{ routeItemSlug: 'shanghai-ferry', slug: 'shanghai-ferry', title: '上海2元渡轮体验', summary: '从渡口看两岸城市风景。', coverImage: 'https://example.com/ferry.webp' }]
const day = { dayLabel: 'Day 1', title: 'Shanghai', routeItems }
function normalize(days, extra = {}) { return normalizeGuidePayload({ slug: 'test', title: 'Test', days, ...extra }) }
function hrefs(source) {
  const html = renderToStaticMarkup(React.createElement(Route, { dayNumber: 1, source, spots, notes: routeNotes }))
  return [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1])
}
function findElements(node, type, results = []) {
  if (Array.isArray(node)) node.forEach(child => findElements(child, type, results))
  else if (node && typeof node === 'object') {
    if (node.type === type) results.push(node)
    findElements(node.props?.children, type, results)
  }
  return results
}

test('mixed route survives save/read, reorder and removal in exact array order for daily and segment Guides', () => {
  const first = normalize([day])
  const saved = normalizeGuidePayload(JSON.parse(JSON.stringify(first)))
  assert.deepEqual(orderedGuideDayRoute(saved.days[0]).map(item => item.type), ['spot', 'note', 'spot'])
  assert.deepEqual(hrefs(saved.days[0]), ['/spot/bund-1', '/spot/lujiazui-2', '/notes/shanghai-ferry'])
  const reordered = normalize([{ ...day, routeItems: [routeItems[2], routeItems[1], routeItems[0]] }])
  assert.deepEqual(hrefs(reordered.days[0]), ['/spot/lujiazui-2', '/spot/bund-1', '/notes/shanghai-ferry'])
  const removed = normalize([{ ...day, routeItems: [routeItems[1], routeItems[0]] }])
  assert.deepEqual(hrefs(removed.days[0]), ['/spot/bund-1', '/notes/shanghai-ferry'])
  const segment = { id: 'shanghai', title: 'Shanghai', city: 'Shanghai', dayStart: 1, dayEnd: 1, dateStart: '2026-01-01', dateEnd: '2026-01-01', verifiedRoutes: [{ ...day, dayNumber: 1 }] }
  const segmented = normalize([], { itineraryMode: 'segment', itinerarySegments: [segment] })
  assert.deepEqual(segmented.itinerarySegments[0].verifiedRoutes[0].routeItems, saved.days[0].routeItems)
})

test('old canonical and legacy Spot-only Guides retain ordering and explicit deletion', () => {
  const canonical = normalize([{ ...day, routeItems: undefined, attractions: [{ spotId: 2, displayOrder: 1 }, { spotId: 1, displayOrder: 0 }] }]).days[0]
  assert.equal(canonical.routeItems, undefined)
  assert.deepEqual(hrefs(canonical), ['/spot/bund-1', '/spot/lujiazui-2'])
  const legacy = normalize([{ ...day, routeItems: undefined, linkedSpots: ['Bund', 'Lujiazui'] }]).days[0]
  assert.deepEqual(hrefs(legacy), ['/spot/bund-1', '/spot/lujiazui-2'])
  assert.deepEqual(orderedGuideDayRoute({ attractions: [], linkedSpots: ['Bund'] }), [])
  assert.deepEqual(orderedGuideAttractions({ routeItems: [], attractions: [{ spotId: 1, displayOrder: 0 }] }), [])
})

test('Note route renders a published preview card below the Spot-only route, including a Note-only day', () => {
  const source = normalize([{ ...day, routeItems: [routeItems[1]] }]).days[0]
  const html = renderToStaticMarkup(React.createElement(Route, { dayNumber: 0, source, spots, notes: routeNotes }))
  assert.match(html, /href="\/notes\/shanghai-ferry"/)
  assert.match(html, /上海2元渡轮体验/)
  assert.match(html, /从渡口看两岸城市风景/)
  assert.match(html, /https:\/\/example.com\/ferry.webp/)
  assert.match(html, /路线攻略 \/ Travel Note/)
  assert.match(html, /查看完整攻略/)
  assert.doesNotMatch(html, /\/spot\//)
  assert.doesNotMatch(html, /今日路线/)
})

test('Note preview has a clean text-only fallback when coverImage is absent', () => {
  const source = normalize([{ ...day, routeItems: [routeItems[1]] }]).days[0]
  const html = renderToStaticMarkup(React.createElement(Route, { dayNumber: 0, source, spots, notes: [{ ...routeNotes[0], coverImage: undefined }] }))
  assert.match(html, /上海2元渡轮体验/)
  assert.doesNotMatch(html, /<img/)
})

test('Guide route Note selection uses published public Notes and resolves existing aliases', () => {
  const selected = selectGuideRouteNoteCards(['ferry-alias', 'draft-note'], [
    { slug: 'shanghai-ferry', aliases: ['ferry-alias'], title: 'Ferry', summary: 'Summary', published: true },
    { slug: 'draft-note', title: 'Draft', summary: 'Hidden', published: false },
  ])
  assert.deepEqual(selected, [{ routeItemSlug: 'ferry-alias', slug: 'shanghai-ferry', title: 'Ferry', summary: 'Summary' }])
})

test('Guide reader loads linked Notes through the cached public Note store', () => {
  const source = fs.readFileSync(path.resolve('app/guide/[slug]/page.tsx'), 'utf8')
  assert.match(source, /readPublicNotes\(\)/)
  assert.match(source, /selectGuideRouteNoteCards\(noteSlugs,notes\)/)
  assert.doesNotMatch(source, /createClient|from\(['"]notes['"]\)/)
})

test('Day 0 survives normalization and JSON round-trip while positive IDs still reject zero', () => {
  const segment = {
    id: 'arrival', title: 'Arrival', city: 'Shanghai', dayStart: 0, dayEnd: 0,
    dateStart: '2026-01-01', dateEnd: '2026-01-01',
    verifiedRoutes: [{ ...day, dayNumber: 0 }],
    referenceRoutes: [{ title: 'Reference', dayNumber: 0 }],
    accommodationStays: [{ dayStart: 0, dayEnd: 0, accommodationId: 7 }],
  }
  const daily = normalize([{ ...day, dayLabel: 'Day 0', stayRangeStart: 0, stayRangeEnd: 0 }])
  const savedDaily = normalizeGuidePayload(JSON.parse(JSON.stringify(daily)))
  assert.equal(savedDaily.days[0].stayRangeStart, 0)
  assert.equal(savedDaily.days[0].stayRangeEnd, 0)
  const normalized = normalize([], { itineraryMode: 'segment', itinerarySegments: [segment] })
  const saved = normalizeGuidePayload(JSON.parse(JSON.stringify(normalized)))
  assert.equal(saved.itinerarySegments[0].dayStart, 0)
  assert.equal(saved.itinerarySegments[0].verifiedRoutes[0].dayNumber, 0)
  assert.equal(saved.itinerarySegments[0].referenceRoutes[0].dayNumber, 0)
  assert.equal(saved.itinerarySegments[0].accommodationStays[0].dayStart, 0)

  const invalidIds = normalize([], { itineraryMode: 'segment', itinerarySegments: [{
    ...segment,
    verifiedRoutes: [{ ...day, dayNumber: 0, routeItems: undefined, attractions: [{ spotId: 0, displayOrder: 0 }] }],
    accommodationStays: [{ dayStart: 0, dayEnd: 0, accommodationId: 0 }],
  }] })
  assert.deepEqual(invalidIds.itinerarySegments[0].verifiedRoutes[0].attractions, [])
  assert.deepEqual(invalidIds.itinerarySegments[0].accommodationStays, [])
  const adminRoute = fs.readFileSync(path.resolve('app/api/admin/guides/route.ts'), 'utf8')
  assert.match(adminRoute, /route\.dayNumber \?\? null/)
})

test('Day 0 segment renders and Day 1+ segment behavior remains unchanged', () => {
  const Segment = load('components/GuideSegmentItinerarySection.tsx').default
  const segments = [0, 1].map(dayNumber => ({
    id: `day-${dayNumber}`, title: `Segment ${dayNumber}`, city: dayNumber === 0 ? 'Arrival' : 'Shanghai',
    dayStart: dayNumber, dayEnd: dayNumber, dateStart: `2026-01-0${dayNumber + 1}`, dateEnd: `2026-01-0${dayNumber + 1}`,
    summary: `Summary ${dayNumber}`, verifiedRoutes: [{ dayNumber, title: `Route ${dayNumber}`, summary: `Route summary ${dayNumber}`, attractions: [] }],
  }))
  const html = renderToStaticMarkup(React.createElement(Segment, { guideSlug: 'test', segments, spotsBySegment: {}, staysByDay: {} }))
  assert.match(html, />Day 0</)
  assert.match(html, /id="day-0"/)
  assert.match(html, />Day 1</)
  assert.match(html, /id="day-1"/)
})

test('map ignores Notes, even with coordinate-like data; attraction references remain Spot-only', () => {
  const guide = normalize([], { itineraryMode: 'segment', itinerarySegments: [{
    id: 'shanghai', title: 'Shanghai', city: 'Shanghai', dayStart: 1, dayEnd: 1,
    dateStart: '2026-01-01', dateEnd: '2026-01-01',
    verifiedRoutes: [{ ...day, dayNumber: 1, routeItems: [routeItems[1], routeItems[0], routeItems[2]] }],
  }] })
  const route = guide.itinerarySegments[0].verifiedRoutes[0]
  assert.equal(route.routeItems[0].latitude, undefined)
  assert.deepEqual(orderedGuideAttractions(route).map(item => item.spotId), [1, 2])
  const View = load('components/GuidePageView.tsx').default
  const render = () => View({ guide, publicData: { locations: spots }, publicTripCost: { source: 'hidden' }, approvedPriceHighlights: [], relatedPackages: [], allGuides: [] })
  const maps = findElements(render(), 'GuideRouteMap')
  assert.equal(maps.length, 1)
  assert.equal(maps[0].props.points.length, 1)
  assert.equal(maps[0].props.points[0].latitude, spots[0].latitude)
  assert.equal(maps[0].props.points[0].longitude, spots[0].longitude)
  route.routeItems = [route.routeItems[0]]
  const noteOnlyMaps = findElements(render(), 'GuideRouteMap')
  assert.ok(noteOnlyMaps.length === 0 || noteOnlyMaps[0].props.points.length === 0)
  assert.deepEqual(orderedGuideAttractions(route), [])
})
