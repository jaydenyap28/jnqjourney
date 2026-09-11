import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import ts from 'typescript'

const read = (path: string) => fs.readFileSync(path, 'utf8')
test('homepages share the existing package reader and public note source', () => {
  const english = read('lib/server/english-page-data.ts')
  const chinese = read('app/page.tsx')
  assert.match(chinese, /readPublishedPackages\(\)/)
  assert.match(english, /data\.packages=await readPublishedPackagesUncached\(\)/)
  assert.match(read('lib/server/travel-packages.ts'), /unstable_cache\(readPublishedPackagesUncached, \['published-travel-packages'\]/)
  assert.match(read('components/EnglishRouteAdapter.tsx'), /initialPackages=\{packages\.slice\(0,3\)\}/)
  assert.match(read('components/EnglishRouteAdapter.tsx'), /const packages=data\.packages \|\| \[\]/)
  assert.doesNotMatch(read('components/EnglishRouteAdapter.tsx'), /usePublicPackages|\/api\/packages/)
  assert.equal(fs.existsSync('lib/client/public-packages.ts'), false)
  assert.equal(fs.existsSync('app/api/packages/route.ts'), false)
  assert.doesNotMatch(english, /homeSupplements|home-supplements|unstable_cache/)
  assert.equal(fs.existsSync('public-data/home-supplements.json'), false)
  assert.match(english, /readBilingualSnapshot[^\n]*'notes.json'/)
  assert.match(read('lib/server/public-content-store.ts'), /readCdnCollection\('notes.json'/)
})
test('booking requests do not branch by locale', () => {
  const card = read('components/AffiliateCard.tsx')
  assert.match(card, /fetch\(`\/api\/affiliate-links\?/)
  assert.doesNotMatch(card, /usePublicLocale|locale\s*===\s*['"]en['"]/)
  const guide = read('components/GuidePageView.tsx')
  assert.match(guide, /guide\.sidebarAffiliateLinkIds \|\| guide\.featuredAffiliateLinkIds \|\| \[\]/)
  assert.match(guide, /linkIds=\{selectedSidebarAffiliateIds\}/)
  for (const file of ['components/EnglishRouteAdapter.tsx', 'app/guide/[slug]/page.tsx']) {
    assert.doesNotMatch(read(file), /selectedSidebarLinks|fetchGuideAffiliateLinks/)
  }
})
test('English homepage routes directly to the same map homepage as Chinese', () => {
  const english = read('components/EnglishRouteAdapter.tsx')
  const ast = ts.createSourceFile('adapter.tsx', english, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let home: ts.CaseClause | undefined
  function visit(node: ts.Node) {
    if (ts.isCaseClause(node) && ts.isStringLiteral(node.expression) && node.expression.text === 'home') home = node
    ts.forEachChild(node, visit)
  }
  visit(ast)
  assert.ok(home, 'English route adapter must explicitly render the homepage')
  assert.match(home.getText(ast), /body\s*=\s*<HomePageClient\s/)
  assert.doesNotMatch(home.getText(ast), /<(main|section|article|div)\b/)
  assert.match(read('pages/en/[[...path]].tsx'), /export default EnglishRouteAdapter/)
  assert.match(read('app/page.tsx'), /AppHomePageClient/)
  assert.match(read('components/AppHomePageClient.tsx'), /<HomePageClient/)
  const shared = read('components/HomePageClient.tsx')
  for (const component of ['MapView', 'TopFloatingIsland', 'BottomFloatingDock']) {
    assert.match(shared, new RegExp(`<${component}\\b`))
  }
  assert.equal(fs.existsSync('components/EnglishSite.tsx'), false)
})

test('all core public routes share production views across locales', () => {
  const english = read('components/EnglishRouteAdapter.tsx')
  for (const [route, component] of Object.entries({
    'region': 'RegionIndexView', 'region/[slug]': 'RegionPageView',
    'guide': 'GuideIndexView', 'guide/[slug]': 'GuidePageView',
    'spot/[slug]': 'SpotPageView', search: 'SearchPageView', about: 'AboutPageView',
  })) {
    assert.match(english, new RegExp(`<${component}\\b`))
    assert.match(read(`app/${route}/page.tsx`), new RegExp(`(?:<|export default )${component}\\b`))
  }
})
