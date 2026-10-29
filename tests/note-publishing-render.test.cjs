const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const test = require('node:test')
const assert = require('node:assert/strict')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

function loader(mocks) {
  const cache = new Map()
  function load(file) {
    file = path.resolve(file)
    if (cache.has(file)) return cache.get(file).exports
    const mod = { exports: {} }; cache.set(file, mod)
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
    const req = id => {
      if (id in mocks) return mocks[id]
      if (id.startsWith('@/') || id.startsWith('.')) {
        let base = id.startsWith('@/') ? path.resolve(id.slice(2)) : path.resolve(path.dirname(file), id)
        if (!path.extname(base)) base += fs.existsSync(base + '.ts') ? '.ts' : '.tsx'
        return load(base)
      }
      return require(id)
    }
    new Function('require', 'module', 'exports', source)(req, mod, mod.exports)
    return mod.exports
  }
  return load
}

test('real Note SSR renders a complete knowledge article, lazy video, metadata and exact links', async () => {
  const { japanNotes } = await import('./fixtures/japan-notes.mjs')
  assert(japanNotes.every(note => !note.published && note.title.includes('不可发布')))
  const note = { ...japanNotes[0], published: true }
  const guide = { slug: 'existing-guide', title: '关联游记', days: [{ routeItems: [{ type: 'note', noteSlug: note.slug }] }] }
  const noop = () => null
  const load = loader({
    '@/lib/server/public-content-store': { readPublicNoteBySlug: async () => note, readPublicNotes: async () => japanNotes.map(n => ({ ...n, published: true })), readPublicGuides: async () => [guide] },
    '@/lib/server/public-data-resolver': { resolvePublicData: async () => ({ locations: [], regions: [] }) },
    '@/lib/server/travel-packages': { readPublishedPackages: async () => [] },
    '@/lib/server/klook-widgets-store': { readKlookWidgets: async () => [], getActiveKlookWidgetsForTargets: async () => [] },
    '@/lib/server/public-content-media': { resolveNotePublicMedia: n => n, selectPublicSpotCards: () => [] },
    '@/components/FallbackImage': { __esModule: true, default: ({ fill, unoptimized, priority, ...props }) => React.createElement('img', props) },
    '@/components/ZoomableImage': { __esModule: true, default: ({ children }) => React.createElement('div', null, children) },
    '@/components/SiteFooter': noop, '@/components/SupportSidebarCard': noop, '@/components/AuthorTrustBlock': noop, '@/components/TravelPackageCard': noop,
    '@/components/AffiliateCard': noop, '@/components/KlookWidgetEmbed': noop,
    'next/link': { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) },
    'next/navigation': { notFound: () => { throw Error('not found') } },
  })
  const page = load('app/notes/[slug]/page.tsx')
  const metadata = await page.generateMetadata({ params: { slug: note.slug } })
  assert.equal(metadata.title, note.title)
  assert.equal(metadata.description, note.summary)
  assert.equal(metadata.alternates.canonical, `/notes/${note.slug}`)
  const html = renderToStaticMarkup(await page.default({ params: { slug: note.slug } }))
  assert.equal((html.match(/<h1\b/g) || []).length, 1)
  assert.match(html, /<table/)
  assert.match(html, /scope="col"/)
  assert.match(html, /<h2[^>]+>常见问题/)
  assert.match(html, /<h3[^>]+>本文是否为亲身实测/)
  assert.match(html, /<time dateTime="2026-10-29T08:00:00.000Z"/)
  assert.match(html, /"dateModified":"2026-10-29T08:00:00.000Z"/)
  assert.match(html, /href="\/guide\/existing-guide"/)
  assert.match(html, /href="\/notes\/test-japan-train-types"/)
  assert.match(html, /href="https:\/\/www.youtube.com\/watch\?v=JNQTest0001"/)
  assert.doesNotMatch(html, /<iframe/)
  const headingIds = [...html.matchAll(/<h[234][^>]+id="([^"]+)"/g)].map(match => match[1])
  assert.equal(headingIds.length, new Set(headingIds).size)
  for (const target of html.matchAll(/href="#([^"]+)"/g)) assert(headingIds.includes(target[1]))
})
