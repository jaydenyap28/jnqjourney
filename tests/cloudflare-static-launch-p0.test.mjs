import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import path from 'node:path'
import {isConfirmedUnavailablePublicImage} from '../lib/unavailable-public-media.ts'
import {normalizeRecoveryCanonical,staticRecoveryIndexingPolicy} from '../scripts/cloudflare/recovery-launch-policy.mjs'
const bad='https://i.ibb.co/r2FHQynR/Chat-GPT-Image-Apr-8-2026-04-05-23-PM.png'

test('missing source uses exact identity, never a filename/region guess',()=>{
  assert.equal(isConfirmedUnavailablePublicImage(bad),true)
  assert.equal(isConfirmedUnavailablePublicImage(bad+'#focus=50,50'),true)
  assert.equal(isConfirmedUnavailablePublicImage(bad.replace('i.ibb.co','example.com')),false)
  assert.equal(isConfirmedUnavailablePublicImage('https://i.ibb.co/mp0JnPH/Timba-Timba2.png'),false)
  assert.equal(isConfirmedUnavailablePublicImage('not-a-url'),false)
})
test('same-site canonical converges to existing www policy without changing paths',()=>{
  assert.equal(normalizeRecoveryCanonical('https://jnqjourney.com/packages/batam-3d2n'),'https://www.jnqjourney.com/packages/batam-3d2n')
  assert.equal(normalizeRecoveryCanonical('/packages/hainan'),'/packages/hainan')
  assert.equal(normalizeRecoveryCanonical('https://outside.example/story'),'https://outside.example/story')
  assert.equal(normalizeRecoveryCanonical(null),null)
})
test('Preview indexing policy stays byte-equivalent; Production is review-only',()=>{
  const preview=staticRecoveryIndexingPolicy()
  assert.equal(preview.deployable,true)
  assert.match(preview.headers,/X-Robots-Tag: noindex, nofollow/)
  assert.equal(preview.robots,'User-agent: *\nDisallow: /\n')
  const draft=staticRecoveryIndexingPolicy('production-review')
  assert.equal(draft.deployable,false)
  assert.equal(draft.functions,0)
  assert.ok(!draft.headers.startsWith('/*\n  X-Robots-Tag: noindex'))
  assert.match(draft.headers,/\/public-data\/\*\n  X-Robots-Tag: noindex/)
  assert.match(draft.robots,/Sitemap: https:\/\/www.jnqjourney.com\/sitemap.xml/)
  assert.equal(draft.adsEnabled,false)
  assert.throws(()=>staticRecoveryIndexingPolicy('production'),/NOT_ENABLED/)
})
test('real price-image component SSR: missing source is text, healthy source keeps link/image', {skip:!process.env.JNQ_ESBUILD_LIB},async()=>{
  // Reuse an installed bundler; never download packages for this focused check.
  const require=createRequire(import.meta.url),{build}=require(process.env.JNQ_ESBUILD_LIB)
  const result=await build({stdin:{contents:"export {default as PriceInfoImage} from './components/PriceInfoImage'; export {PublicLocaleProvider} from './components/PublicLocale'",resolveDir:process.cwd(),loader:'tsx'},tsconfig:path.resolve('tsconfig.json'),bundle:true,platform:'node',format:'cjs',jsx:'automatic',write:false,external:['react','react/*','react-dom','react-dom/*','next/*'],logLevel:'silent'})
  const module={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(require,module,module.exports)
  const {PriceInfoImage,PublicLocaleProvider}=module.exports
  const React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
  const {ImageConfigContext}=require('next/dist/shared/lib/image-config-context.shared-runtime')
  const {imageConfigDefault}=require('next/dist/shared/lib/image-config')
  const render=(url,locale)=>renderToStaticMarkup(React.createElement(ImageConfigContext.Provider,{value:{...imageConfigDefault,unoptimized:true}},React.createElement(PublicLocaleProvider,{locale},React.createElement(PriceInfoImage,{url,index:0}))))
  const zh=render(bad,'zh'),en=render(bad,'en')
  assert.match(zh,/参考图片暂不可用/);assert.match(en,/Reference image unavailable/)
  assert.ok(!zh.includes('<img')&&!zh.includes('<a '));assert.ok(!en.includes(bad))
  const healthy='https://i.ibb.co/mp0JnPH/Timba-Timba2.png',html=render(healthy,'en')
  assert.ok(html.includes('href="'+healthy+'"')&&html.includes('<img'))
})
