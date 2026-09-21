import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assertCurrentSpotContentGenerationSource, parseSpotContentEnglishGeneration, spotContentEnglishGenerationSchema } from '../lib/spot-localization-generation.ts'
import { spotSeo } from '../lib/spot-content.ts'

const source = { experience_zh: '我们在渡口看日落。', seo_title_zh: '上海轮渡', seo_description_zh: '' }

test('Spot content English generation schema has exactly the three requested fields', () => {
  assert.deepEqual(spotContentEnglishGenerationSchema.required, ['experience_en', 'seo_title_en', 'seo_description_en'])
  assert.deepEqual(Object.keys(spotContentEnglishGenerationSchema.properties), ['experience_en', 'seo_title_en', 'seo_description_en'])
})

test('Spot content English drafts preserve empty sources and reject malformed output', () => {
  assert.deepEqual(parseSpotContentEnglishGeneration({ experience_en: 'We watched the sunset from the ferry pier.', seo_title_en: 'Shanghai Ferry', seo_description_en: '' }, source), { experience_en: 'We watched the sunset from the ferry pier.', seo_title_en: 'Shanghai Ferry', seo_description_en: '' })
  assert.throws(() => parseSpotContentEnglishGeneration({ experience_en: 'ok', seo_title_en: 'ok', seo_description_en: 'Invented' }, source), /empty seo_description_en/)
  assert.throws(() => parseSpotContentEnglishGeneration({ experience_en: 'ok', seo_title_en: 1, seo_description_en: '' }, source), /invalid translation result/)
})

test('Spot content generation rejects stale Chinese source before or after AI and never persists automatically', () => {
  assert.doesNotThrow(() => assertCurrentSpotContentGenerationSource({ source }, source))
  assert.throws(() => assertCurrentSpotContentGenerationSource({ source: { ...source, experience_zh: '已修改' } }, source), /Source conflict/)
  assert.throws(() => assertCurrentSpotContentGenerationSource({ source }, { ...source, seo_title_zh: '新标题' }), /Source conflict/)
  const api = fs.readFileSync('pages/api/admin/spot-content/[id]/generate-english.ts', 'utf8')
  assert.match(api, /requireAdminRequest/)
  assert.match(api, /latestRow/)
  assert.doesNotMatch(api, /\.update\(|\.insert\(|\.upsert\(|saveAndPublish/)
})

test('empty English SEO values retain existing spotSeo fallback behavior', () => {
  const seo = spotSeo({ name: 'River Ferry', description: 'Scenic river crossing.', seo_title_en: '', seo_description_en: '' }, 'en')
  assert.deepEqual(seo, { title: 'River Ferry | JnQ Journey', description: 'Scenic river crossing.' })
})
