import assert from 'node:assert/strict'
import test from 'node:test'

import { getNoteTableOfContentsItems, parseMarkdownToBlocks } from '../lib/notes.ts'

test('note TOC includes H2 and indented H3 items but excludes H4', () => {
  const blocks = parseMarkdownToBlocks('正文\n\n## 章节\n\n### 小节\n\n#### 细节')

  assert.deepEqual(getNoteTableOfContentsItems(blocks), [
    { id: '章节', content: '章节', level: 2 },
    { id: '小节', content: '小节', level: 3 },
  ])
})
