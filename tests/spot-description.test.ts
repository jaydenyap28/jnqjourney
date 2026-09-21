import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
function load(file: string): any {
  const filename = path.resolve(file)
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText
  const context = { exports: {}, URL, require: (name: string) => {
    if (!name.startsWith('.') && !name.startsWith('@/')) return require(name)
    const base = name.startsWith('@/') ? path.resolve(name.slice(2)) : path.resolve(path.dirname(filename), name)
    return load(['.ts', '.tsx'].map((ext) => base + ext).find((candidate) => fs.existsSync(candidate))!)
  } }
  vm.runInNewContext(compiled, context)
  return context.exports
}
const Component = load('components/SpotDescription.tsx').default
const { spotSeo } = load('lib/spot-content.ts')
const render = (children: string) => renderToStaticMarkup(React.createElement(Component, { children }))

test('legacy paragraphs preserve line breaks without inferred headings or H1', () => {
  const html = render('普通标题\n旧介绍 English.\n\n第二段\n# Literal H1')
  assert.match(html, /普通标题\n旧介绍 English\./)
  assert.equal((html.match(/<p /g) || []).length, 2)
  assert.doesNotMatch(html, /<h[1-6]/)
  assert.match(html, /# Literal H1/)
})
test('explicit H2 H3 H4 and grouped quote', () => {
  const html = render('## 二级\n### Third\n#### Fourth\n> 引用\n> continued')
  for (const level of [2, 3, 4]) assert.match(html, new RegExp(`<h${level} `))
  assert.match(html, /<blockquote[^>]*>引用\ncontinued<\/blockquote>/)
})
test('inline formatting, safe links, escaped HTML and inert shortcodes', () => {
  const html = render('**粗体** *italic* [link](https://example.com) `code`\n[x](javascript:alert) <script>alert(1)</script>\n[image: photo] [video: clip] [affiliate: 1] [klook: 1]')
  assert.match(html, /<strong[^>]*>粗体<\/strong>/)
  assert.match(html, /<em>italic<\/em>/)
  assert.match(html, /href="https:\/\/example.com"/)
  assert.match(html, /<code[^>]*>code<\/code>/)
  assert.doesNotMatch(html, /href="javascript:|<script|<img|<iframe|<video/)
  assert.match(html, /\[affiliate: 1\]/)
})
test('description-derived meta excerpts omit Markdown while explicit SEO stays unchanged', () => {
  const spot = { name: 'Spot', description: '## Heading\n> **bold** *italic* [link](https://example.com) `code`' }
  for (const locale of ['zh', 'en']) {
    assert.equal(spotSeo(spot, locale).description, 'Heading bold italic link code')
    assert.equal(spotSeo({ ...spot, [`seo_description_${locale}`]: 'Custom excerpt' }, locale).description, 'Custom excerpt')
  }
})
