import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import { relatedNotesForSpot, packageMatchesSpot } from '../lib/content-relations.ts'

const require = createRequire(import.meta.url)
function load(file: string, mocks: Record<string, any> = {}, globals: Record<string, any> = {}) {
  const context = { exports: {} as any, process: { env: {} }, console, ...globals,
    require: (id: string) => id in mocks ? mocks[id] : require(id) }
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText, context, { filename: file })
  return context.exports
}
test('Spot navigation emits only bounded content identifiers for both existing GA events', () => {
  const events: any[] = []
  const analytics = load('lib/analytics.ts', {}, { window: { gtag: (...args: any[]) => events.push(args) } })
  analytics.trackSpotNavigation(794, 'guide', 'china-jiangnan', 'spot_reading_cue')
  analytics.trackSpotNavigation(794, 'package', 'hainan', 'spot_related_package')
  assert.deepEqual(JSON.parse(JSON.stringify(events)), [
    ['event', 'related_guide_click', { page_type: 'spot', spot_id: 794, destination_type: 'guide', destination_slug: 'china-jiangnan', cta_position: 'spot_reading_cue' }],
    ['event', 'package_cta_click', { page_type: 'spot', spot_id: 794, destination_type: 'package', destination_slug: 'hainan', cta_position: 'spot_related_package' }],
  ])
  for (const [id, slug] of [[0, 'guide'], [NaN, 'guide'], [794, 'x?phone=123'], [794, 'https://other.test'], [794, 'a/b']]) analytics.trackSpotNavigation(id, 'guide', slug, 'spot_reading_cue')
  assert.equal(events.length, 2)
})
test('missing or throwing analytics and preview suppression cannot block navigation', () => {
  for (const window of [undefined, {}, { gtag: () => { throw Error('blocked') } }]) {
    const analytics = load('lib/analytics.ts', {}, { window })
    assert.doesNotThrow(() => analytics.trackSpotNavigation(794, 'guide', 'nanjing', 'spot_related_guide'))
  }
  const preview = load('lib/analytics.ts', {}, { process: { env: { JNQ_PREVIEW_READ_ONLY: '1' } }, window: { gtag: () => assert.fail('preview telemetry') } })
  preview.trackSpotNavigation(794, 'guide', 'nanjing', 'spot_reading_cue')
})
const note = (slug: string, extra: any = {}) => ({ slug, title: slug, published: true, relatedSpotIds: [], relatedRegionIds: [89], tags: ['南京'], blocks: [], ...extra }) as any
test('Spot notes preserve manual order and aliases, then add only explicit published backlinks', () => {
  const notes = [note('reverse', { relatedSpotIds: [794] }), note('manual', { aliases: ['old'] }), note('block', { blocks: [{ spotId: 794 }] }), note('same-region'), note('draft', { relatedSpotIds: [794], published: false })]
  assert.deepEqual(relatedNotesForSpot({ id: 794, related_note_slugs: ['old', 'manual', 'missing'] }, notes).map(n => n.slug), ['manual', 'reverse', 'block'])
  assert.deepEqual(relatedNotesForSpot({ id: 999 }, notes), [])
  const five = Array.from({ length: 5 }, (_, i) => note(`manual-${i}`))
  assert.equal(relatedNotesForSpot({ id: 794, related_note_slugs: five.map(n => n.slug) }, five).length, 5)
  assert.equal(relatedNotesForSpot({ id: 794 }, Array.from({ length: 6 }, (_, i) => note(`n-${i}`, { relatedSpotIds: [794] }))).length, 4)
})

// Exercise real component output/handlers without pretending to run a browser.
const jsx = (type: any, props: any) => ({ type, props })
function nodes(tree: any): any[] {
  if (!tree || typeof tree !== 'object') return []
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  return [tree, ...nodes(tree.props?.children)]
}
const react = { ...require('react'), useState: (v: any) => [v, () => {}], useEffect: () => {}, useCallback: (fn: any) => fn, useMemo: (fn: any) => fn() }
test('all affiliate layouts use native sponsored links with 44px targets, independent of pending tracking', async () => {
  let requests = 0
  const tracked: any[] = []
  const component = load('components/AffiliateCard.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/components/PublicLocale': { PublicCopy: 'copy' },
    '@/components/ui/badge': { Badge: 'badge' }, '@/components/ui/button': { Button: 'button' },
    '@/components/ui/card': new Proxy({}, { get: (_, key) => String(key) }),
    '@/lib/analytics': { trackEvent: (...args: any[]) => tracked.push(args), getDeviceType: () => 'mobile' },
  }, { window: { location: { pathname: '/spot/sample-794' }, localStorage: { getItem: () => 'existing' }, open: () => assert.fail('No scripted popup') },
    document: { title: 'Spot', referrer: '' }, navigator: { userAgent: 'test' },
    fetch: () => { requests++; return new Promise(() => {}) } }).default
  for (const variant of [{}, { compact: true }, { minimal: true }]) {
    const tree = component({ initialLinks: [{ id: 1, provider: 'trip', link_type: 'ticket', url: 'https://trip.test/product' }], locationId: 794, ...variant })
    const all = nodes(tree), link = all.find(n => n.type === 'a')
    assert.equal(link.props.href, 'https://trip.test/product')
    assert.equal(link.props.target, '_blank')
    assert.equal(link.props.rel, 'sponsored noopener noreferrer')
    assert.equal(link.props.onClick(), undefined)
    assert.ok(all.some(n => n.props?.asChild && n.props.className.includes('min-h-11')))
  }
  assert.equal(requests, 3)
  assert.ok(tracked.every(event => event[1].affiliate_link_id === 1))
})
test('Spot package card click uses the exact source Spot and leaves ordinary package cards untracked', () => {
  const events: any[] = []
  const component = load('components/TravelPackageCard.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx }, '@/components/PublicLocale': { PublicLink: 'link' },
    './PublicLocale': { usePublicLocale: () => 'zh', PublicCopy: 'copy' },
    '@/components/FallbackImage': 'image', '@/components/WhatsAppButton': 'whatsapp',
    '@/lib/analytics': { trackSpotNavigation: (...args: any[]) => events.push(args) },
  }).default
  const item = { id: 1, slug: 'hainan', title_zh: '海南', destination: '海南' }
  for (const sourceSpotId of [794, undefined]) {
    const link = nodes(component({ item, showWhatsApp: false, sourceSpotId })).find(n => n.type === 'link')
    assert.equal(link.props.href, '/packages/hainan'); link.props.onClick()
  }
  assert.deepEqual(events, [[794, 'package', 'hainan', 'spot_related_package']])
  const whatsapp = nodes(component({ item })).find(n => n.type === 'whatsapp')
  assert.equal(whatsapp.props.packageId, item.id)
  assert.equal(whatsapp.props.position, 'package_card')
  assert.equal(packageMatchesSpot({ region_id: 89 }, { id: 794, region_id: 89 }), true)
  assert.equal(packageMatchesSpot({ region_id: 90 }, { id: 794, region_id: 89 }), false)
})

test('review bundle has 18 distinct new Spots, authentic local originals, field-scoped proposals and no apply payload', () => {
  const bundle = JSON.parse(readFileSync('docs/rc1.5/spot-review-drafts.json', 'utf8'))
  assert.equal(bundle.drafts.length, 18)
  assert.equal(new Set(bundle.drafts.map((d: any) => d.id)).size, 18)
  const titles = new Set(), descriptions = new Set()
  for (const d of bundle.drafts) {
    assert.ok(![379, 377, 341, 364, 375].includes(d.id))
    assert.ok(d.proposal.seo_title_zh && d.proposal.seo_description_zh)
    assert.ok(!titles.has(d.proposal.seo_title_zh)); titles.add(d.proposal.seo_title_zh)
    assert.ok(!descriptions.has(d.proposal.seo_description_zh)); descriptions.add(d.proposal.seo_description_zh)
    assert.equal(d.original.seo_state, 'unknown_in_lightweight_snapshot')
    assert.equal(d.original.personal_experience_state, 'not_exported_do_not_replace')
    const raw = readFileSync(d.original.file)
    assert.equal(createHash('sha256').update(raw).digest('hex'), d.original.sha256)
    assert.equal(JSON.parse(raw.toString()).spot.description, d.original.description)
    assert.ok(d.review_checks.length > 0 && d.reason)
    assert.ok(!('user_experience' in d.proposal) && !('price_info' in d.proposal) && !('opening_hours' in d.proposal))
  }
  assert.equal(readdirSync('public-data/spots').filter(f => f.endsWith('.json') && JSON.parse(readFileSync(`public-data/spots/${f}`, 'utf8')).spot).length, 547)
})
