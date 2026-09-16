import assert from 'node:assert/strict'
import test from 'node:test'

import { convertBlocksToMarkdown, parseMarkdownToBlocks } from '../lib/notes.ts'

test('note Markdown preserves H2 through H4 heading levels', () => {
  const markdown = '## 章节标题\n\n### 小标题\n\n#### 细分标题'
  const blocks = parseMarkdownToBlocks(markdown)

  assert.deepEqual(blocks.map((block) => block.headingLevel), [2, 3, 4])
  assert.equal(convertBlocksToMarkdown(blocks), markdown)
})
