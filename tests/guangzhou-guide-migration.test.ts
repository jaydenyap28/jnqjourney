import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { planGuangzhouMigration, validateGuangzhouCanonical, GUANGZHOU_SEMANTIC_HASH } from '../lib/guangzhou-guide-migration.ts'
import { guideSemanticHash } from '../lib/east-coast-guide-migration.ts'
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/guangzhou-authoritative-before.json', import.meta.url), 'utf8'))
const locations = [{"id":303,"name":"西华路美食街"},{"id":304,"name":"流花湖公园"},{"id":305,"name":"农讲所"},{"id":306,"name":"北京路步行街"},{"id":307,"name":"大佛古寺"},{"id":308,"name":"东山口"},{"id":311,"name":"太古仓码头"},{"id":313,"name":"广州市文化馆新馆"},{"id":314,"name":"永庆坊"},{"id":315,"name":"上下九步行街"},{"id":316,"name":"西坊大院"},{"id":317,"name":"宝墨园"},{"id":318,"name":"沙湾古镇"},{"id":319,"name":"云台花园"},{"id":320,"name":"时尚天河"},{"id":322,"name":"广州塔"},{"id":323,"name":"黄埔古港"},{"id":325,"name":"海心沙"},{"id":326,"name":"太古汇"},{"id":327,"name":"正佳广场"},{"id":328,"name":"天环广场"},{"id":330,"name":"佳兆业广场"}]
test('Guangzhou 22 canonical refs preserve names, order, protected fields and semantic hash', () => {
  const original = JSON.stringify(fixture)
  const { after } = planGuangzhouMigration(fixture, locations)
  assert.equal(JSON.stringify(fixture), original)
  assert.deepEqual(after.days.map((d: any) => d.attractions.length), [5,2,2,2,2,2,3,4])
  assert.equal(after.days.flatMap((d: any) => d.attractions).length, 22)
  assert.equal(after.days.flatMap((d: any) => d.linkedSpots).length, 0)
  assert.equal(guideSemanticHash(after), GUANGZHOU_SEMANTIC_HASH)
  for (const [i, day] of after.days.entries()) {
    assert.deepEqual(day.attractions.map((a: any) => a.displayName), fixture.days[i].linkedSpots)
    assert.deepEqual(day.attractions.map((a: any) => a.displayOrder), day.attractions.map((_: any, n: number) => n))
    const { attractions, linkedSpots, ...rest } = day
    const { linkedSpots: legacy, ...beforeRest } = fixture.days[i]
    assert.deepEqual(rest, beforeRest)
  }
})
test('Route summary church never creates an attraction, even when a matching Spot exists', () => {
  assert.match(fixture.route[0].summary, /教堂/)
  const { after } = planGuangzhouMigration(fixture, [...locations, {id:99999,name:'教堂'}])
  assert.equal(after.days.flatMap((d: any) => d.attractions).length, 22)
  assert.equal(after.days.flatMap((d: any) => d.attractions).some((a: any) => a.spotId === 99999), false)
  assert.deepEqual(after.route, fixture.route)
})
test('Missing and ambiguous identities fail closed; rerun and semantic/binding mutations fail', () => {
  assert.throws(() => planGuangzhouMigration(fixture, locations.slice(1)), /no matching Spot/)
  assert.throws(() => planGuangzhouMigration(fixture, [...locations, {...locations[0],id:99999}]), /2 matching Spots/)
  const {after}=planGuangzhouMigration(fixture,locations)
  assert.throws(() => planGuangzhouMigration(after,locations), /22 legacy refs/)
  for(const mutate of [
    (g:any)=>g.days[0].attractions.reverse(),
    (g:any)=>{g.days[0].attractions[0].displayName='changed'},
    (g:any)=>{g.days[0].linkedSpots=['legacy']},
    (g:any)=>{g.days[0].attractions[0].spotSlug='wrong'},
    (g:any)=>{g.budget='100'},
  ]){const g=structuredClone(after);mutate(g);assert.throws(()=>validateGuangzhouCanonical(g))}
})
