import assert from 'node:assert/strict'
import test from 'node:test'

import { convertBlocksToMarkdown, parseMarkdownToBlocks } from '../lib/notes.ts'

test('note Markdown preserves H2 through H4 heading levels', () => {
  const markdown = '## 章节标题\n\n### 小标题\n\n#### 细分标题'
  const blocks = parseMarkdownToBlocks(markdown)

  assert.deepEqual(blocks.map((block) => block.headingLevel), [2, 3, 4])
  assert.equal(convertBlocksToMarkdown(blocks), markdown)
})

test('note Markdown keeps unmarked pasted text as paragraphs', () => {
  const markdown = '目前上海机场公布的守航夜宵线运营时间为：\n\n**Important note**\n\nAN ISOLATED PARAGRAPH'
  const blocks = parseMarkdownToBlocks(markdown)

  assert.deepEqual(blocks.map((block) => block.type), ['paragraph', 'paragraph', 'paragraph'])
  assert.equal(convertBlocksToMarkdown(blocks), markdown)
})
