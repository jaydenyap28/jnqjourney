const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
function compile(source) {
  return ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
}
const moduleOutput = { exports: {} }
new Function('exports', compile(fs.readFileSync('lib/guide-route-spot-ids.ts', 'utf8')))(moduleOutput.exports)
const { guideRouteSpotIds } = moduleOutput.exports
// Execute the actual selection expressions from both public surfaces.
function selection(file) {
  const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let expression, normalize
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'relatedGuides') expression = node.initializer.getText(ast)
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'normalizeGuideMatch') normalize = node.getText(ast)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  assert.ok(expression && normalize)
  return new Function('allGuides', 'guideRouteSpotIds', 'location', 'region', 'locationNames', 'relatedGuideSpotIds', compile(`${normalize}\nreturn ${expression}`))
}
const selectors = [selection('app/spot/[slug]/page.tsx'), selection('components/RegionPageView.tsx')]
const base = { slug: 'guide', title: 'Unrelated title', route: [], days: [] }
const spot = { spotId: 42, displayOrder: 0 }
function matches(guide, ids = [42]) {
  return selectors.map(select => select([guide], guideRouteSpotIds, { id: 42 }, { name: 'Shanghai' }, new Set(['ferry']), ids).length)
}
for (const field of ['attractions', 'routeItems']) {
  const route = { [field]: [field === 'routeItems' ? { ...spot, type: 'spot' } : spot] }
  test(`canonical daily ${field} matches both Spot and Region`, () => {
    assert.deepEqual(matches({ ...base, days: [route] }), [1, 1])
  })
  test(`canonical segment ${field} matches both Spot and Region`, () => {
    assert.deepEqual(matches({ ...base, itinerarySegments: [{ verifiedRoutes: [route] }] }), [1, 1])
  })
}
test('legacy linkedSpots and existing route/featured names still match', () => {
  for (const extra of [{ days: [{ linkedSpots: ['Ferry'] }] }, { route: [{ name: 'Ferry' }] }, { featuredSpotNames: ['Ferry'] }]) {
    assert.deepEqual(matches({ ...base, ...extra }), [1, 1])
  }
})
test('unrelated, disabled, Note-only and unverified routes are excluded', () => {
  for (const extra of [
    { days: [{ attractions: [{ ...spot, spotId: 99 }] }] },
    { days: [{ routeItems: [{ ...spot, type: 'note', noteSlug: 'ferry' }] }] },
    { days: [{ attractions: [{ ...spot, enabled: false }] }] },
    { itinerarySegments: [{ referenceRoutes: [{ attractions: [spot] }], verifiedRoutes: [] }] },
  ]) assert.deepEqual(matches({ ...base, ...extra }), [0, 0])
})
test('Region uses all supplied Region Spot IDs, including those beyond display limit', () => {
  const guide = { ...base, days: [{ attractions: [{ ...spot, spotId: 142 }] }] }
  assert.deepEqual(matches(guide, Array.from({ length: 142 }, (_, i) => i + 1)), [0, 1])
})
