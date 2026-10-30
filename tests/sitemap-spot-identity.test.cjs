const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function load(file, mocks = {}) {
  const context = {
    exports: {}, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://sitemap.invalid' }, cwd: () => process.cwd() }, console, URL, AbortSignal,
    require(id) {
      if (id in mocks) return mocks[id]
      if (id === '@/lib/location-routing') return load('lib/location-routing.ts')
      if (id === '@/lib/spot-quality') return load('lib/spot-quality.ts')
      if (id === '@/lib/spot-content') return { isSpotPublished: row => row.publication_status == null || row.publication_status === 'published' }
      if (id.startsWith('@/')) throw new Error(`Missing offline dependency: ${id}`)
      return require(id)
    },
  }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, context, { filename: file })
  return context.exports
}

async function spotUrls(locations, aliases = {}) {
  const store = load('lib/server/location-slugs-store.ts')
  const reader = load('lib/server/public-location-data.ts', {
    react: { cache: fn => fn }, 'next/cache': { unstable_cache: fn => fn },
    '@/lib/server/public-data-resolver': { resolvePublicData: async () => ({ locations, regions: [] }) },
    '@/lib/server/public-spot-resolver': {}, '@/lib/region-routing': {},
    './supabase-read-key': { supabaseReadKey: () => 'synthetic-test-key' },
    '@supabase/supabase-js': { createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ abortSignal: async () => ({ data: locations.map(location => ({ ...location, description: 'A'.repeat(300), images: ['a', 'b', 'c', 'd'], visit_date: '2025-01-01', address: 'Fixture' })), error: null }) }) }) }) }) },
  })
  const sitemap = load('app/sitemap.ts', {
    '@/lib/region-routing': {}, '@/lib/site': { absoluteUrl: path => `https://www.jnqjourney.com${path}` },
    '@/lib/server/location-slugs-store': { ...store, readLocationSlugMap: async () => aliases },
    '@/lib/server/public-location-data': reader,
    '@/lib/server/public-content-store': { readPublicGuides: async () => [], readPublicNotes: async () => [] },
    '@/lib/server/travel-packages': { readPublishedPackages: async () => [] },
    '@/lib/server/english-page-data': { readEnglishCollections: async () => ({ localization: { records: [] } }) },
  })
  return (await sitemap.default()).filter(route => route.url.includes('/spot/')).map(route => route.url)
}

test('sitemap preserves the published slug instead of slugifying the bilingual display name', async () => {
  const urls = await spotUrls([
    { id: 221, name: 'Old Cruise Ship Jetty Kijal 旧码头 / Old Cruise Ship Jetty Kijal', slug: 'old-cruise-ship-jetty-kijal-221' },
    { id: 337, name: 'LeTao小樽洋菓子铺 / LeTAO Pathos', slug: 'letao-pathos-337' },
  ])
  assert.deepEqual(Array.from(urls), [
    'https://www.jnqjourney.com/spot/old-cruise-ship-jetty-kijal-221',
    'https://www.jnqjourney.com/spot/letao-pathos-337',
  ])
})

test('editor-managed aliases take precedence over older public snapshot slugs', async () => {
  const urls = await spotUrls([{ id: 375, name: '珈琲 森の時計', slug: 'spot-375' }], { 375: 'mori-no-tokei-cafe' })
  assert.equal(urls[0], 'https://www.jnqjourney.com/spot/mori-no-tokei-cafe-375')
})

test('invalid, mismatched and absent snapshot identities use the existing safe name fallback', async () => {
  const urls = await spotUrls([
    { id: 1, name: 'First Spot', slug: 'wrong-91' },
    { id: 2, name: 'Second Spot', slug: '../outside-2' },
    { id: 3, name: 'Third Spot' },
  ])
  assert.deepEqual(Array.from(urls), [1, 2, 3].map((id, i) => `https://www.jnqjourney.com/spot/${['first', 'second', 'third'][i]}-spot-${id}`))
})

test('sitemap retains all 582 qualifying identities independently of homepage pagination', async () => {
  const locations = Array.from({ length: 582 }, (_, i) => ({ id: i + 1, name: `Display ${i + 1} / Display ${i + 1}`, slug: `published-${i + 1}` }))
  const urls = await spotUrls(locations)
  assert.equal(urls.length, 582)
  assert.equal(new Set(urls).size, 582)
  assert.equal(urls[581], 'https://www.jnqjourney.com/spot/published-582')
})
