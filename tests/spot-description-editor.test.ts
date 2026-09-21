import test from 'node:test'
import assert from 'node:assert/strict'
import { formatDescription, type DescriptionFormat } from '../lib/spot-description-editor.ts'

const expected: Record<DescriptionFormat, string> = {
  H2: '## 内容', H3: '### 内容', H4: '#### 内容', Bold: '**内容**', Italic: '*内容*', Link: '[内容](https://example.com)', Quote: '> 内容',
}
for (const format of Object.keys(expected) as DescriptionFormat[]) {
  test(`${format} formats selection and selects editable text`, () => {
    const result = formatDescription('内容', 0, 2, format)
    assert.equal(result.value, expected[format])
    assert.equal(result.value.slice(result.selectionStart, result.selectionEnd), format === 'Link' ? 'https://example.com' : '内容')
  })
  test(`${format} inserts a selected placeholder at the cursor`, () => {
    const result = formatDescription('', 0, 0, format)
    const placeholder = format === 'Link' ? '链接文字' : format === 'Quote' ? '引用内容' : format.startsWith('H') ? '标题' : '文字'
    assert.equal(result.value, expected[format].replace('内容', placeholder))
    assert.equal(result.value.slice(result.selectionStart, result.selectionEnd), placeholder)
  })
}
test('block formatting creates explicit lines and preserves surrounding text', () => {
  assert.equal(formatDescription('before内容after', 6, 8, 'H2').value, 'before\n## 内容\nafter')
  assert.equal(formatDescription('beforeafter', 6, 6, 'Quote').value, 'before\n> 引用内容\nafter')
  assert.equal(formatDescription('一\n二', 0, 3, 'Quote').value, '> 一\n> 二')
  assert.equal(formatDescription('一\n二', 0, 3, 'H3').value, '### 一\n### 二')
})
test('inline formatting preserves surrounding text', () => {
  assert.equal(formatDescription('before内容after', 6, 8, 'Bold').value, 'before**内容**after')
  assert.equal(formatDescription('beforeafter', 6, 6, 'Italic').value, 'before*文字*after')
})
