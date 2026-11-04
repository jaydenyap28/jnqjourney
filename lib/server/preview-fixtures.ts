const image = '/preview-fixture.svg'
const region = {
  id: 91000, slug: 'fixture-harbor-91000', name: 'Fixture Harbor', country: 'Malaysia',
  thumbnail: image, shortSummary: 'Synthetic destination for Preview.', parentId: null, code: null,
}
const spot = {
  id: 91001, slug: 'fixture-lookout-91001', name: 'Fixture Lookout', name_cn: '测试观景台',
  category: 'attraction', latitude: 3.12, longitude: 101.65, region_id: region.id,
  image_url: image, images: [image, '/globe.svg'],
  description: '用于 Preview 验收的合成景点资料。', visit_date: '2026-01-01', publication_status: 'published',
  experience_zh: '这是用于验证公开页面、关联游记和行程渲染的合成样例。'.repeat(6),
  related_note_slugs: ['fixture-note'],
}

export const previewGuide = {
  slug: 'fixture-guide', title: '测试攻略', shortTitle: '测试攻略', duration: '1 天',
  summary: '用于验收公开 Guide 的合成行程。', coverImage: image, sortDate: '2026-01-01',
  route: [{ name: spot.name, latitude: spot.latitude, longitude: spot.longitude, summary: '测试路线' }],
  days: [{ dayLabel: 'Day 1', title: '测试路线', summary: '测试景点关联。', linkedSpots: [spot.name] }],
  highlightTags: [], heroBullets: [], budgetItems: [], coverAccent: '',
}
export const previewNote = {
  slug: 'fixture-note', title: '测试游记', shortTitle: '测试游记', summary: '用于验收公开 Note 的合成文章。',
  published: true, coverImage: image, relatedSpotIds: [spot.id], relatedRegionIds: [region.id],
  blocks: [{ id: 'preview-paragraph', type: 'paragraph', content: '这篇游记只用于 Preview 验收。' }],
}

const snapshots: Record<string, unknown> = {
  'locations.json': { schemaVersion: 1, locations: [{
    id: spot.id, slug: spot.slug, name: spot.name, category: spot.category,
    latitude: spot.latitude, longitude: spot.longitude, thumbnail: image,
    shortSummary: spot.description, visitDate: spot.visit_date,
    region: { id: region.id, slug: region.slug, name: region.name, country: region.country, code: region.code },
  }] },
  'regions.json': { schemaVersion: 1, regions: [region] },
  'guides.json': { schemaVersion: 1, guides: [previewGuide] },
  'notes.json': { schemaVersion: 1, notes: [previewNote] },
  'guide-trip-costs.json': { schemaVersion: 1, tripCosts: [] },
  'i18n/en/records.json': { schemaVersion: 1, locale: 'en', version: 'preview-fixtures', records: [] },
  [`spots/${spot.slug}.json`]: { schemaVersion: 1, spot },
}

export function readPreviewSnapshot(key: string): unknown {
  if (!Object.hasOwn(snapshots, key)) throw new Error('Unknown Preview fixture snapshot.')
  return snapshots[key]
}
