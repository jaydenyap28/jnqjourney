const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { ResolverFactory } = require('enhanced-resolve')
const { JsConfigPathsPlugin } = require('next/dist/build/webpack/plugins/jsconfig-paths-plugin')
const { prepareFontEntry } = require('../scripts/lib/font-entry.cjs')

test('Next 14 paths resolution reproduces the original alias failure', async () => {
  const root = process.cwd()
  const resolve = plugins => new Promise((success, failure) => {
    const resolver = ResolverFactory.createResolver({
      fileSystem: fs, extensions: ['.ts', '.tsx', '.js'], plugins,
      alias: { '@/lib/site-fonts$': path.join(root, 'lib/preview-fonts.ts') },
    })
    resolver.resolve({}, root, '@/lib/site-fonts', {}, (error, result) => error ? failure(error) : success(result))
  })
  assert.equal(await resolve([]), path.join(root, 'lib/preview-fonts.ts'))
  assert.equal(await resolve([new JsConfigPathsPlugin({ '@/*': ['./*'] }, { baseUrl: root, isImplicit: true })]), path.join(root, 'lib/site-fonts.ts'))
})

test('the generated entry selects one implementation before both Router module graphs are compiled', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'jnq-font-entry-'))
  fs.mkdirSync(path.join(temporary, 'lib'))
  const target = path.join(temporary, 'lib/build-fonts.generated.ts')
  try {
    prepareFontEntry(true, temporary)
    assert.match(fs.readFileSync(target, 'utf8'), /from '.\/preview-fonts'/)
    assert.doesNotMatch(fs.readFileSync(target, 'utf8'), /next\/font|from '.\/site-fonts'/)
    const modified = fs.statSync(target).mtimeMs
    prepareFontEntry(true, temporary)
    assert.equal(fs.statSync(target).mtimeMs, modified)
    prepareFontEntry(false, temporary)
    assert.match(fs.readFileSync(target, 'utf8'), /from '.\/site-fonts'/)
    for (const file of ['app/layout.tsx', 'pages/_app.tsx']) {
      assert.match(fs.readFileSync(file, 'utf8'), /from '@\/lib\/build-fonts.generated'/)
      assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /next\/font\/google|from '@\/lib\/site-fonts'/)
    }
  } finally {
    fs.unlinkSync(target)
    fs.rmdirSync(path.join(temporary, 'lib'))
    fs.rmdirSync(temporary)
  }
})

test('Production font declarations are byte-identical and Preview has explicit Chinese system fallbacks', () => {
  assert.equal(fs.readFileSync('lib/site-fonts.ts', 'utf8'), execFileSync('git', ['show', 'd0adde4:lib/site-fonts.ts'], { encoding: 'utf8', windowsHide: true }))
  const preview = fs.readFileSync('lib/preview-fonts.ts', 'utf8')
  assert.doesNotMatch(preview, /next\/font|https?:/)
  const css = fs.readFileSync('app/globals.css', 'utf8').split('.preview-system-fonts')[1]
  for (const font of ['system-ui', 'PingFang SC', 'Microsoft YaHei', 'Songti SC', 'SimSun']) assert.ok(css.includes(font))
})
