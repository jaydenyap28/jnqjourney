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
const render = (children: string, address?: string) => renderToStaticMarkup(React.createElement(Component, { children, address }))

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


test('address-only transport section is hidden when the address already appears elsewhere on the Spot page', () => {
  const html = render(
    '## 介绍\n新天地是一处街区。\n\n## 👣 怎么去\n地址位于马当路245号新天地时尚。可按页面地址与地图导航前往。',
    '马当路245号新天地时尚'
  )
  assert.match(html, /介绍/)
  assert.doesNotMatch(html, /交通与到达/)
  assert.doesNotMatch(html, /Getting there/)
})

test('transport section remains when it adds useful arrival guidance beyond the address', () => {
  const html = render(
    '## 介绍\n某景点。\n\n## 交通与到达\n从地铁站2号出口步行约5分钟，带大件行李时建议打车。',
    '某路88号'
  )
  assert.match(html, /交通与到达/)
  assert.match(html, /步行约5分钟/)
  assert.match(html, /建议打车/)
})


test('generic menu caveats are removed without deleting the useful food fact', () => {
  const html = render(
    '## 吃什么\n创意烟花双人套餐是其中一个选择。实际菜单与当天供应以现场为准。'
  )
  assert.match(html, /创意烟花双人套餐/)
  assert.doesNotMatch(html, /实际菜单与当天供应以现场为准/)
})

test('generic menu-only section is omitted', () => {
  const html = render(
    '## 介绍\n餐厅位于市区。\n\n## 吃什么\n可按现场菜单与个人口味选择。'
  )
  assert.match(html, /介绍/)
  assert.doesNotMatch(html, /What to order/)
})
