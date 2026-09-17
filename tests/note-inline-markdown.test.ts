import assert from 'node:assert/strict'
import test from 'node:test'

import { parseInlineMarkdown } from '../lib/notes.ts'

test('parses supported pasted Markdown inline syntax without changing surrounding text', () => {
  const text = '**南京路步行街 → 九江路 → 外滩 → 金陵东路渡口**，*步行*到 [东昌路渡口](https://example.com/ferry) 使用 `code`。'

  assert.deepEqual(parseInlineMarkdown(text), [
    { type: 'bold', value: '南京路步行街 → 九江路 → 外滩 → 金陵东路渡口' },
    { type: 'text', value: '，' },
    { type: 'italic', value: '步行' },
    { type: 'text', value: '到 ' },
    { type: 'link', value: '东昌路渡口', href: 'https://example.com/ferry' },
    { type: 'text', value: ' 使用 ' },
    { type: 'code', value: 'code' },
    { type: 'text', value: '。' },
  ])
})

test('keeps plain text and unsafe link markup as text', () => {
  assert.deepEqual(parseInlineMarkdown('普通文字 **未闭合'), [{ type: 'text', value: '普通文字 **未闭合' }])
  assert.deepEqual(parseInlineMarkdown('[unsafe](javascript:alert)'), [{ type: 'text', value: '[unsafe](javascript:alert)' }])
})
