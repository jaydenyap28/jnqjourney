const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { execFileSync } = require('node:child_process')
const { loader } = require('./helpers/spot-travel-loader.cjs')

function runtimeDependencies(file) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  return source.statements.filter(node => ts.isImportDeclaration(node)
    && !node.importClause?.isTypeOnly
    && (!node.importClause?.namedBindings || !ts.isNamedImports(node.importClause.namedBindings)
      || node.importClause.name || node.importClause.namedBindings.elements.some(item => !item.isTypeOnly)))
    .map(node => node.moduleSpecifier.text)
}

function visitGraph(root, check) {
  const visited = new Set()
  function visit(file) {
    if (visited.has(file)) return
    visited.add(file)
    for (const dependency of runtimeDependencies(file)) {
      check(dependency, file)
      if (!dependency.startsWith('@/') && !dependency.startsWith('.')) continue
      const base = dependency.startsWith('@/') ? path.resolve(dependency.slice(2)) : path.resolve(path.dirname(file), dependency)
      const target = ['', '.ts', '.tsx', '.mjs', '.cjs', '.json'].map(ext => base + ext).find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
      if (target && !target.endsWith('.json')) visit(target)
    }
  }
  visit(path.resolve(root))
  return visited
}

test('English Pages has no eager server reader and its client graph has no Node or private readers', () => {
  const page = 'pages/en/[[...path]].tsx'
  assert.deepEqual(runtimeDependencies(page), ['@/components/EnglishRouteAdapter'])
  const clientFiles = visitGraph('components/EnglishRouteAdapter.tsx', (dependency, file) => {
    assert.doesNotMatch(dependency, /^(?:node:|fs(?:\/|$)|server-only$)/, file)
    if (dependency.includes('lib/server/')) assert.equal(dependency, '@/lib/server/public-content-media', file)
  })
  assert.ok(clientFiles.size > 20)
  const serverFiles = visitGraph('lib/server/english-page-data.ts', (dependency, file) => {
    assert.notEqual(dependency, 'server-only', file)
  })
  assert.ok([...serverFiles].some(file => file.endsWith('public-fallback-reader.ts')))
})

test('the shared fallback implementation preserves every existing rule and the App entry stays marked', () => {
  const normalize = value => value.replace(/\r\n/g, '\n')
  const previous = normalize(execFileSync('git', ['show', 'd0adde4:lib/server/public-fallback-snapshot.ts'], { encoding: 'utf8', windowsHide: true }))
  const current = normalize(fs.readFileSync('lib/server/public-fallback-reader.ts', 'utf8'))
  assert.equal(current.split('\n').slice(1).join('\n'), previous.split('\n').slice(1).join('\n'))
  const wrapper = fs.readFileSync('lib/server/public-fallback-snapshot.ts', 'utf8')
  assert.match(wrapper, /^import 'server-only'/)
  assert.match(wrapper, /export \{ readPublicFallbackSnapshot, readFallbackSpot \} from '.\/public-fallback-reader'/)
})

test('Pages data functions retain Preview isolation, blocking aliases, missing pages and 3600s ISR', async () => {
  let reads = 0, state = 'page'
  const mocks = {
    '@/components/EnglishRouteAdapter': {},
    '@/lib/server/english-page-data': {
      compactEnglishPageData: value => value,
      englishPageData: async parts => {
        reads++
        if (state === 'missing') return null
        return parts[1] === 'old' ? { redirect: '/en/spot/current-1' } : { data: { title: 'Fixture' } }
      },
    },
    '@/public-data/i18n/en/records.json': { records: [{ canonicalPath: '/spot/old' }, { canonicalPath: '/guide/current' }] },
  }
  const preview = loader(mocks, { process: { env: { VERCEL_ENV: 'preview' } } })('pages/en/[[...path]].tsx')
  assert.deepEqual(await preview.getStaticPaths(), { paths: [], fallback: 'blocking' })
  assert.equal(reads, 0)
  const production = loader(mocks)('pages/en/[[...path]].tsx')
  const paths = await production.getStaticPaths()
  assert.ok(paths.paths.includes('/en/guide/current'))
  assert.ok(!paths.paths.includes('/en/spot/old'))
  const context = { params: { path: ['spot', 'old'] }, revalidateReason: 'stale' }
  assert.equal((await production.getStaticProps(context)).redirect.destination, '/en/spot/current-1')
  context.params.path = ['guide', 'current']
  assert.equal((await production.getStaticProps(context)).revalidate, 3600)
  state = 'missing'
  assert.deepEqual(await production.getStaticProps(context), { notFound: true, revalidate: 3600 })
})
