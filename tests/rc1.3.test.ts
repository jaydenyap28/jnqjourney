import test from 'node:test'
import assert from 'node:assert/strict'
import { assessSpotContent, cleanSpotEditorialDraft } from '../lib/spot-content-quality.ts'
import { packageMatchesSpot, selectGuideRouteNoteCards } from '../lib/content-relations.ts'
import { buildWhatsAppMessage } from '../lib/whatsapp.ts'

test('short content is advisory and thresholds distinguish cafes, restaurants, stays and attractions', () => {
  const description = '中'.repeat(90)
  const cafe = assessSpotContent({ category: 'food', name: 'Black Bean Coffee', description })
  assert.equal(cafe.category.label, '咖啡馆'); assert.equal(cafe.grade, 'ready')
  assert.equal(assessSpotContent({ category: 'food', name: 'Restaurant', description }).grade, 'ready')
  assert.equal(assessSpotContent({ category: 'accommodation', description }).grade, 'suggestion')
  assert.equal(assessSpotContent({ category: 'attraction', description }).grade, 'suggestion')
  assert.equal(assessSpotContent({ category: 'food', description: '简短真实记录' }).issues[0].level, 'info')
  assert.equal(assessSpotContent({ description: '' }).grade, 'missing')
})
test('omitted SEO fields stay unknown, explicit empty fields become optional leads', () => {
  assert.equal(assessSpotContent({ description: '中'.repeat(200) }).seoKnown, false)
  assert.ok(!assessSpotContent({ description: '中'.repeat(200) }).issues.some(i => i.code === 'seo'))
  const result = assessSpotContent({ description: '中'.repeat(200), seo_title_zh: '', seo_description_zh: null })
  assert.equal(result.seoKnown, true); assert.equal(result.grade, 'suggestion')
  assert.equal(result.issues.find(i => i.code === 'seo')?.level, 'info')
})
test('static content review finds duplicates, conversation residue, mixed sentences and placeholder links', () => {
  const description = '作为AI，我没有去过。\n\n相同正文\n\n相同正文\n\nThis is a complete English sentence that needs to be reviewed before publishing.\n\n[地图](https://example.com/PLACEHOLDER)'
  const codes = assessSpotContent({ description }).issues.map(i => i.code)
  for (const code of ['ai', 'duplicate', 'language', 'link']) assert.ok(codes.includes(code as any), code)
})
test('brand names, coordinate Maps links and internal links are not classified as invalid', () => {
  const description = '咖啡馆 Black Bean Coffee，附近可找到 JR G1321。\n\n[地图](https://www.google.com/maps?q=1.2,103.4) [攻略](/guide/local)'
  const result = assessSpotContent({ description })
  assert.ok(!result.issues.some(i => i.code === 'language' || i.code === 'link'))
  assert.ok(assessSpotContent({ description: '[链接](javascript:alert)' }).issues.some(i => i.code === 'link'))
})
test('editorial cleanup never manufactures experience and retains distinct personal details, quotes and code', () => {
  const description = '好的，以下是为你整理的景点介绍：\n\n独有事实\n\n独有事实\n\n我们当天下雨，没有继续步行。\n\n> 原始引文\n\n```\nraw source\n```'
  const cleaned = cleanSpotEditorialDraft(description)
  assert.equal((cleaned.match(/独有事实/g) || []).length, 1)
  for (const text of ['我们当天下雨，没有继续步行。', '> 原始引文', 'raw source']) assert.ok(cleaned.includes(text))
})
test('package recommendations require an explicit location relation or an actual matching region in both languages', () => {
  assert.equal(packageMatchesSpot({ region_id: null }, { id: 1, region_id: null }), false)
  assert.equal(packageMatchesSpot({}, { id: 1 }), false)
  assert.equal(packageMatchesSpot({ region_id: 92 }, { id: 1, region_id: 92 }), true)
  assert.equal(packageMatchesSpot({ region_id: 22, related_location_ids: [1] }, { id: 1, region_id: 92 }), true)
  assert.equal(packageMatchesSpot({ region_id: 22 }, { id: 1, region_id: 92 }), false)
})
test('a canonical Note and its alias produce one route recommendation', () => {
  const note = { slug: 'real-note', aliases: ['old-note'], published: true, title: 'Saved title', summary: 'Saved summary' } as any
  assert.deepEqual(selectGuideRouteNoteCards(['old-note', 'real-note'], [note]).map(n => n.slug), ['real-note'])
})
test('custom WhatsApp text retains parent identity, option and source without duplication', () => {
  const options = { pageType: 'package' as const, packageName: '海南主配套', optionName: '4D3N', source: 'HAINAN-4D', message: '请查询房况' }
  const message = buildWhatsAppMessage(options)
  for (const text of ['海南主配套', '4D3N', 'HAINAN-4D']) assert.ok(message.includes(text))
  assert.equal(buildWhatsAppMessage({ ...options, message }), message)
})
