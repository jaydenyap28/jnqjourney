const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

const regions = [
  { id: 10, name: 'Shanghai', country: 'China' },
  { id: 11, name: 'Huangpu', country: 'China', parentId: 10 },
  { id: 20, name: 'Langkawi', country: 'Malaysia' },
  { id: 30, name: 'Empty', country: 'China' },
]
const locations = [{ id: 1, region: regions[0] }, { id: 2, region: regions[2] }]
const note = (slug, extra = {}) => ({ slug, title: slug, summary: `${slug} summary`, published: true, blocks: [], ...extra })
const notes = [
  note('shanghai', { relatedRegionIds: [10], coverImage: 'https://example.com/shanghai.jpg' }),
  note('spot-reference', { relatedSpotIds: [1] }),
  note('block-reference', { blocks: [{ spotId: 1 }] }),
  note('langkawi', { relatedRegionIds: [20], relatedSpotIds: [1] }),
  note('langkawi-spot', { relatedSpotIds: [2] }),
  note('draft', { relatedRegionIds: [10], published: false }),
  note('unknown'),
]
function loader(region) {
  const mocks = {
    '@/lib/server/public-location-data': { fetchRegionBySlug: async () => region, fetchLocationsByRegion: async () => [] },
    '@/lib/server/public-content-store': { readPublicGuides: async () => [], readPublicNotes: async () => notes },
    '@/lib/server/public-data-resolver': { resolvePublicData: async () => ({ locations, regions }) },
    '@/lib/server/travel-packages': { readPublishedPackages: async () => [] },
    '@/lib/server/localized-seo': {},
    '@/components/SiteFooter': () => null,
    '@/components/TravelPackageCard': () => null,
    '@/components/TiomanPackageComparison': () => null,
    'next/navigation': { notFound: () => { throw Error('not found') } },
    'next/link': ({ children, ...props }) => React.createElement('a', props, children),
    '@/components/FallbackImage': ({ fill, priority, ...props }) => React.createElement('img', props),
  }
  const cache = new Map()
  function load(file) {
    file = path.resolve(file)
    if (cache.has(file)) return cache.get(file).exports
    const mod = { exports: {} }; cache.set(file, mod)
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
    const req = id => {
      if (id in mocks) return mocks[id]
      if (id === './FallbackImage') return mocks['@/components/FallbackImage']
      if (id.startsWith('@/') || id.startsWith('.')) {
        const base = id.startsWith('@/') ? path.resolve(id.slice(2)) : path.resolve(path.dirname(file), id)
        return load(['', '.ts', '.tsx'].map(ext => base + ext).find(fs.existsSync))
      }
      return require(id)
    }
    new Function('require', 'exports', 'module', source)(req, mod.exports, mod)
    return mod.exports
  }
  return load
}
async function render(region) {
  const page = loader(region)('app/region/[slug]/page.tsx').default
  return renderToStaticMarkup(await page({ params: { slug: region.name } }))
}
test('matching published Region Notes render existing cards with summary, cover and links', async () => {
  const html = await render(regions[0])
  assert.match(html, /相关攻略/)
  for (const slug of ['shanghai', 'spot-reference', 'block-reference']) assert.ok(html.includes(`href="/notes/${slug}"`))
  assert.match(html, /shanghai summary/)
  assert.match(html, /https:\/\/example.com\/shanghai.jpg/)
  const child = await render(regions[1])
  assert.ok(child.includes('href="/notes/shanghai"'))
})
test('Shanghai excludes Langkawi, drafts and unknown geography', async () => {
  const html = await render(regions[0])
  for (const slug of ['langkawi', 'langkawi-spot', 'draft', 'unknown']) assert.ok(!html.includes(`href="/notes/${slug}"`))
})
test('Region without matching Notes hides the section', async () => {
  const html = await render(regions[3])
  assert.ok(!html.includes('相关攻略'))
  assert.ok(!html.includes('href="/notes/'))
})
