import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { resolveEntityDisplayName as resolve, ORIGINAL_ONLY_NAMES } from '../lib/entity-display-name.ts'

test('legacy region pairs render Chinese first and original second, including future English locale', () => {
  for (const [zh, en] of [['云顶高原', 'Genting Highlands'], ['仙本那', 'Semporna'], ['亚庇', 'Kota Kinabalu'], ['吉隆坡', 'Kuala Lumpur'], ['哥打巴鲁', 'Kota Bharu'], ['柔佛', 'Johor']]) {
    assert.deepEqual(resolve({ name: `${zh} / ${en}` }), { primary: zh, secondary: en })
    assert.deepEqual(resolve({ name: en, name_cn: zh }, 'en'), { primary: en, secondary: zh })
  }
})

test('normalizes whitespace and duplicates without guessing ambiguous slash names', () => {
  assert.deepEqual(resolve({ name: '  Villa\n  Paddy ', name_cn: 'villa paddy' }), { primary: 'Villa Paddy', secondary: null })
  assert.deepEqual(resolve({ name: ' Place  Name ', name_cn: 'place name' }), { primary: 'place name', secondary: null })
  for (const name of ['AC/DC Cafe', 'Cafe / Bar', '甲 / 乙', '甲 / Place / Branch', '中文English', 'Name / ']) {
    assert.deepEqual(resolve({ name }), { primary: name.trim(), secondary: null })
  }
  assert.deepEqual(resolve({}), { primary: '', secondary: null })
})

test('curated original-only names remain original in raw and lightweight representations', () => {
  for (const name of ORIGINAL_ONLY_NAMES) {
    assert.deepEqual(resolve({ name, name_cn: '不应使用的描述翻译' }), { primary: name, secondary: null })
    assert.deepEqual(resolve({ name: `不应使用的描述翻译 / ${name}` }), { primary: name, secondary: null })
  }
  // Unknown existing localized data is preserved for manual review, never mass deleted.
  assert.deepEqual(resolve({ name: 'Unknown Cafe', name_cn: '已有名称' }), { primary: '已有名称', secondary: 'Unknown Cafe' })
})

test('Guide override keeps priority and identity fields unchanged', () => {
  const entity = Object.freeze({ name: 'Dataran Lang', name_cn: '老鹰广场', displayName: ' 自定义标题 ', spotId: 819, spotSlug: 'dataran-lang-819', displayOrder: 3, enabled: true })
  assert.deepEqual(resolve(entity), { primary: '自定义标题', secondary: null })
  assert.deepEqual(resolve({ ...entity, displayName: '老鹰广场 / Dataran Lang' }), { primary: '老鹰广场', secondary: 'Dataran Lang' })
  assert.deepEqual(resolve({ ...entity, displayName: 'Dataran Lang' }), { primary: 'Dataran Lang', secondary: null })
  assert.equal(entity.displayName, ' 自定义标题 ')
  assert.equal(entity.spotId, 819)
})

test('saved Langkawi natural names and cleaned Guide business overrides', () => {
  const build = JSON.parse(fs.readFileSync(new URL('../data/langkawi-content-build.json', import.meta.url), 'utf8'))
  const rows = Object.values(build).find(value => Array.isArray(value) && value.some(row => row.name === 'Dataran Lang')) as Array<{ name: string; name_cn: string }>
  assert.ok(rows)
  for (const name of ['Langkawi Sky Bridge', 'Dataran Lang', 'Pantai Cenang', 'Tanjung Rhu Beach', 'Underwater World Langkawi']) {
    const row = rows.find(row => row.name === name)
    assert.ok(row, name)
    assert.deepEqual(resolve(row), { primary: row.name_cn, secondary: name })
  }
  const patch = JSON.parse(fs.readFileSync(new URL('../data/langkawi-targeted-patch.json', import.meta.url), 'utf8'))
  for (const name of Object.values({ ...patch.displayNames, ...patch.stayDisplayNames }) as string[]) {
    assert.deepEqual(resolve({ name, displayName: name }), { primary: name, secondary: null })
  }
})
