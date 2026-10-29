import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { getNoteHeadingIds, getNoteTableOfContentsItems, parseMarkdownToBlocks, convertBlocksToMarkdown, noteUpdatedDate, type LongformNote } from '../lib/notes.ts'
import { parseNoteVideo } from '../lib/note-video.ts'
import { parseNoteTable } from '../lib/note-table.ts'
import { regionCardDescription } from '../lib/region-card-copy.ts'
import { guidesForNote, selectRelatedNotes } from '../lib/content-relations.ts'
import type { TravelGuide } from '../lib/guides.ts'

test('tables survive editor roundtrip, preserve links and escaped pipes, reject malformed rows', () => {
  const markdown = '| 项目 | 来源 |\n| --- | :---: |\n| A \\| B | [官方](https://example.com) |'
  const blocks = parseMarkdownToBlocks(markdown)
  assert.equal(blocks[0].type, 'table')
  assert.equal(convertBlocksToMarkdown(blocks), markdown)
  assert.deepEqual(parseNoteTable(markdown)?.rows, [['A | B', '[官方](https://example.com)']])
  for (const malformed of ['| A | B |\n| - | - |', '| A | B |\n| --- | --- |\n| missing |', 'ordinary prose']) assert.equal(parseNoteTable(malformed), null)
})

test('repeated headings have unique IDs matching every H2/H3 TOC target', () => {
  const blocks = parseMarkdownToBlocks('## FAQ\n\n### 使用\n\n### 使用\n\n#### 使用\n\n## 使用-2')
  const ids = getNoteHeadingIds(blocks)
  assert.equal(new Set(ids).size, ids.length)
  assert.deepEqual(getNoteTableOfContentsItems(blocks).map(item => item.id), [ids[0], ids[1], ids[2], ids[4]])
})

test('optional video accepts watch parameters, shorts, short links, live and privacy host only', () => {
  for (const url of ['https://www.youtube.com/watch?si=share&v=JNQTest0001', 'https://youtu.be/JNQTest0001?t=20', 'https://m.youtube.com/shorts/JNQTest0001', 'https://www.youtube.com/live/JNQTest0001', 'https://www.youtube-nocookie.com/embed/JNQTest0001']) {
    assert.equal(parseNoteVideo(url)?.watchUrl, 'https://www.youtube.com/watch?v=JNQTest0001')
    assert.equal(parseMarkdownToBlocks(url)[0].type, 'video')
  }
  for (const url of ['', 'javascript:alert(1)', 'https://youtube.com.evil.test/watch?v=JNQTest0001', 'https://evil.test/youtube.com/watch?v=JNQTest0001', 'https://www.youtube.com/watch?v=short']) assert.equal(parseNoteVideo(url), null)
})

test('updated date has explicit Singapore display timezone and never fabricates an absent date', () => {
  assert.equal(noteUpdatedDate(undefined), null)
  assert.equal(noteUpdatedDate('invalid'), null)
  assert.equal(noteUpdatedDate('2026-10-28T18:00:00Z')?.label, '2026年10月29日')
})

test('Guide backlinks require an exact existing canonical or alias route reference', () => {
  const note = { slug: 'japan-jr-pass', aliases: ['jr-pass-old'] } as LongformNote
  const guide = (slug: string, noteSlug: string) => ({ slug, days: [{ routeItems: [{ type: 'note', noteSlug }] }] }) as TravelGuide
  assert.deepEqual(guidesForNote(note, [guide('match', 'jr-pass-old'), guide('unrelated', 'tokyo')]).map(g => g.slug), ['match'])
  assert.equal(guidesForNote(note, [{ slug: 'segment', days: [], itinerarySegments: [{ verifiedRoutes: [{ routeItems: [{ type: 'note', noteSlug: note.slug }] }] }] } as unknown as TravelGuide]).length, 1)
})

test('Japanese series uses existing ordered Note relations and hides missing or unpublished members', () => {
  const slugs = ['jr-pass', 'train-types', 'tokyo-subway-ticket', 'tax-free']
  const notes = slugs.map(slug => ({ slug, published: true })) as LongformNote[]
  notes[3].published = false
  assert.deepEqual(selectRelatedNotes(['train-types', 'jr-pass', 'missing', 'tax-free', 'train-types'], notes, 'jr-pass').map(n => n.slug), ['train-types'])
})

test('actual bundled region summaries select Chinese prose without duplicated English tails', () => {
  const { regions } = JSON.parse(fs.readFileSync('public-data/regions.json', 'utf8'))
  const tokyo = regions.find((r: { id: number }) => r.id === 45)
  const chinese = regionCardDescription(tokyo, tokyo.shortSummary, 'zh')
  assert.match(chinese, /东京是日本的首都/)
  assert.doesNotMatch(chinese, /Tokyo is/)
  assert.doesNotMatch(regionCardDescription(tokyo, tokyo.shortSummary, 'en'), /[\u3400-\u9fff]/)
  assert.equal(regionCardDescription({ name: '金马伦 / Cameron Highland' }, '参观 BOH Tea 茶园，适合轻松旅行 Cameron Highlands is a famous hill resort.', 'zh'), '参观 BOH Tea 茶园，适合轻松旅行')
  assert.equal(regionCardDescription({ name: '东京 / Tokyo' }, '东京的资料。', 'zh'), '东京的资料。')
})
