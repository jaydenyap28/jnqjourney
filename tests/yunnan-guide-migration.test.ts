import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { planYunnanMigration, validateYunnanCanonical, YUNNAN_SEMANTIC_HASH } from '../lib/yunnan-guide-migration.ts'
import { guideSemanticHash } from '../lib/east-coast-guide-migration.ts'
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/yunnan-authoritative-before.json', import.meta.url), 'utf8'))
const locations = [{"id":548,"name":"凤阳茶室","name_cn":""},{"id":547,"name":"凤阳邑","name_cn":""},{"id":542,"name":"大理古城","name_cn":""},{"id":541,"name":"南诏十二时辰","name_cn":""},{"id":534,"name":"龙龛码头","name_cn":""},{"id":535,"name":"才村","name_cn":""},{"id":537,"name":"磻溪村S湾","name_cn":""},{"id":538,"name":"望田咖啡","name_cn":""},{"id":539,"name":"喜洲古镇","name_cn":""},{"id":543,"name":"双廊古镇","name_cn":""},{"id":544,"name":"杨丽萍太阳宫","name_cn":""},{"id":574,"name":"海地拍照","name_cn":""},{"id":567,"name":"独克宗古城","name_cn":""},{"id":569,"name":"龟山公园","name_cn":""},{"id":570,"name":"月光广场","name_cn":""},{"id":565,"name":"普达措国家公园","name_cn":""},{"id":558,"name":"香巴拉佛塔","name_cn":""},{"id":559,"name":"回音壁","name_cn":""},{"id":561,"name":"白水台","name_cn":""},{"id":563,"name":"虎跳峡","name_cn":""},{"id":529,"name":"束河古镇","name_cn":""},{"id":528,"name":"汤佳米云味土鸡米线","name_cn":""},{"id":525,"name":"听花谷","name_cn":""},{"id":526,"name":"荒野之国","name_cn":""},{"id":523,"name":"玉湖村","name_cn":""},{"id":521,"name":"玉柱擎天","name_cn":""},{"id":522,"name":"龙女湖","name_cn":""},{"id":524,"name":"白沙古镇","name_cn":""},{"id":532,"name":"丽江古城","name_cn":""},{"id":683,"name":"沙溪古镇","name_cn":""},{"id":551,"name":"玉津桥","name_cn":""},{"id":552,"name":"先锋书院","name_cn":""},{"id":554,"name":"半山咖啡","name_cn":""},{"id":515,"name":"牦牛坪","name_cn":""},{"id":516,"name":"蓝月谷","name_cn":""}]
test('Yunnan 37 canonical attractions: names, order, linkedSpots zero, protected fields and semantic hash', () => {
  const original = JSON.stringify(fixture)
  const { after } = planYunnanMigration(fixture, locations)
  assert.equal(JSON.stringify(fixture), original)
  assert.deepEqual(after.days.map((d: any) => d.attractions.length), [4,5,3,3,1,2,4,4,5,4,2])
  assert.equal(after.days.flatMap((d: any) => d.attractions).length, 37)
  assert.equal(after.days.flatMap((d: any) => d.linkedSpots).length, 0)
  assert.equal(guideSemanticHash(after), YUNNAN_SEMANTIC_HASH)
  for (const [i, day] of after.days.entries()) {
    assert.deepEqual(day.attractions.map((a: any) => a.displayName), fixture.days[i].linkedSpots)
    assert.deepEqual(day.attractions.map((a: any) => a.displayOrder), day.attractions.map((_: any, n: number) => n))
    const { attractions, linkedSpots, ...rest } = day
    const { linkedSpots: legacy, ...beforeRest } = fixture.days[i]
    assert.deepEqual(rest, beforeRest)
  }
  for (const id of [528, 529]) assert.deepEqual(after.days.flatMap((d: any, i: number) => d.attractions.some((a: any) => a.spotId === id) ? [i + 1] : []), [7, 8])
})
test('Yunnan fails closed for missing or ambiguous matches', () => {
  assert.throws(() => planYunnanMigration(fixture, locations.slice(1)), /no matching Spot/)
  assert.throws(() => planYunnanMigration(fixture, [...locations, { ...locations[0], id: 99999 }]), /2 matching Spots/)
})
test('Yunnan rejects changed names/order/binding/protected data, removed repeats and rerun', () => {
  const { after } = planYunnanMigration(fixture, locations)
  for (const mutate of [
    (g: any) => g.days[7].attractions.pop(),
    (g: any) => g.days[0].attractions.reverse(),
    (g: any) => { g.days[0].attractions[0].displayName = 'changed' },
    (g: any) => { g.days[0].attractions[0].spotSlug = 'wrong' },
    (g: any) => { g.days[0].stay = 'changed' },
    (g: any) => { g.days[0].linkedSpots = ['legacy'] },
  ]) { const g = structuredClone(after); mutate(g); assert.throws(() => validateYunnanCanonical(g)) }
  assert.throws(() => planYunnanMigration(after, locations), /37 legacy refs/)
})
