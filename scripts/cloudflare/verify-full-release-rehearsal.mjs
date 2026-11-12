import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PROJECT, RECOVERY } from './recovery-sources.mjs'
import { loadReleaseSnapshot, publicIdentityDelta, rehearsalTarget } from './full-release-rehearsal.mjs'

const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const json = file => readFile(file, 'utf8').then(JSON.parse)
const { manifest, feeds } = await loadReleaseSnapshot(RECOVERY)
assert.equal(manifest.readMode, 'isolated-rehearsal')
const { id, phase, marker, image, baseRun } = manifest.rehearsal
const changed = phase === 'changed'
const baseDirectory = path.join(path.dirname(RECOVERY), baseRun)
const baseline = await loadReleaseSnapshot(baseDirectory)
const bundle = await json(path.join(RECOVERY, 'package-result.json'))
const baseBundle = await json(path.join(baseDirectory, 'package-result.json'))
const delta = publicIdentityDelta(baseline.feeds, feeds)
assert.ok([...Object.values(delta.added), ...Object.values(delta.removed)].every(rows => !rows.length))
assert.deepEqual(bundle.pages.map(row => row.route), baseBundle.pages.map(row => row.route))
assert.deepEqual(bundle.redirects, baseBundle.redirects)
const changedSeo = bundle.pages.filter((row, index) => row.indexable !== baseBundle.pages[index].indexable)
if (changed) {
  const affectedTranslations = new Set(['/en/notes', '/en' + rehearsalTarget.note.route, '/en' + rehearsalTarget.guide.route])
  assert.ok(changedSeo.every(row => affectedTranslations.has(row.route) && !row.indexable), 'UNRELATED_SEO_ELIGIBILITY_CHANGED')
}
else assert.equal(changedSeo.length, 0, 'SEO_NOT_RESTORED_TO_BASELINE')
assert.equal(bundle.sitemap.kept, baseBundle.sitemap.kept - changedSeo.length)
const local = process.argv[2] === '--local'
assert.deepEqual(process.argv.slice(2), [local ? '--local' : '--online'])
const deployment = local ? null : await json(path.join(RECOVERY, 'deployment.json'))
if (deployment) {
  assert.ok(deployment.success && deployment.environment === 'preview' && deployment.functions === 0)
  assert.equal(deployment.branch, 'full-drill-' + id)
  assert.equal(deployment.revision, manifest.contentRevision)
  assert.match(deployment.url, new RegExp(`^https://[a-f0-9]+\\.${PROJECT}\\.pages\\.dev$`))
}
async function get(route, status = 200) {
  if (deployment) {
    const result = await fetch(deployment.url + route, { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(20000) })
    assert.equal(result.status, status, route)
    assert.match(result.headers.get('x-robots-tag') || '', /noindex/, route)
    return Buffer.from(await result.arrayBuffer())
  }
  const file = path.join(RECOVERY, 'deploy', route.replace(/^\//, ''))
  if (status === 404) {
    await assert.rejects(readFile(file), { code: 'ENOENT' })
    return Buffer.alloc(0)
  }
  return readFile(file)
}
const imageRoute = '/media/static/' + image
const samples = {}
for (const [kind, { route }] of Object.entries(rehearsalTarget)) {
  const html = (await get(local ? route + '.html' : route)).toString()
  assert.match(html, /<main\b/)
  assert.ok(html.includes('<h1'), 'ORIGINAL_TEMPLATE_MISSING_H1')
  assert.equal(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').includes(marker), changed, kind + '_RENDERED_CHANGE')
  samples[kind] = { route, markerVisibleInHtml: changed }
}
for (const [file, key, field, baselineRows] of [
  ['locations', 'locations', 'id', baseline.feeds['database.json'].locations],
  ['notes', 'notes', 'slug', baseline.feeds['notes.json'].notes],
  ['guides', 'guides', 'slug', baseline.feeds['guides.json'].guides],
]) {
  const result = JSON.parse(await get('/public-data/' + file + '.json'))
  assert.deepEqual(result[key].map(row => row[field]).sort(), baselineRows.map(row => row[field]).sort())
}
const imageBytes = await get(imageRoute, changed ? 200 : 404)
if (changed) assert.equal(digest(imageBytes) + '.png', image)
const browser = []
let branchAliasMatches = false
let branchAliasImageStatus
if (deployment) {
  const alias = `https://${deployment.branch}.${PROJECT}.pages.dev`
  const receipt = await fetch(alias + '/_publication.json', { redirect: 'error', signal: AbortSignal.timeout(20000) })
  assert.equal(receipt.status, 200)
  assert.equal(digest(Buffer.from(await receipt.arrayBuffer())), digest(await get('/_publication.json')))
  const aliasImage = await fetch(alias + imageRoute, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000) })
  assert.equal(aliasImage.status, changed ? 200 : 404, 'BRANCH_ALIAS_IMAGE_STATUS')
  if (changed) assert.equal(digest(Buffer.from(await aliasImage.arrayBuffer())) + '.png', image)
  else await aliasImage.body?.cancel()
  branchAliasImageStatus = aliasImage.status
  branchAliasMatches = true
  const { chromium } = await import('../../artifacts/cloudflare-upload-fix/browser-tools/node_modules/playwright-core/index.mjs')
  const chrome = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
  try {
    for (const [kind, { route }] of Object.entries(rehearsalTarget)) {
      const page = await chrome.newPage({ viewport: { width: kind === 'note' ? 390 : 1440, height: 900 } })
      const response = await page.goto(deployment.url + route, { waitUntil: 'domcontentloaded', timeout: 45000 })
      assert.equal(response.status(), 200)
      const title = await page.locator('h1').first().innerText()
      assert.ok(title.trim())
      const text = await page.locator('main').first().innerText()
      assert.equal(text.includes(marker), changed, kind + '_CHROME_VISIBLE_CHANGE')
      let testImageDecoded = false
      if (kind === 'note' && changed) {
        const img = page.getByAltText('全站发布演练生成的测试图', { exact: true }).first()
        await img.scrollIntoViewIfNeeded()
        testImageDecoded = await img.evaluate(async (image, expected) => {
          await image.decode()
          return image.currentSrc === expected && image.naturalWidth === 96 && image.naturalHeight === 64
        }, deployment.url + imageRoute)
        assert.ok(testImageDecoded, 'INCREMENTAL_IMAGE_DID_NOT_DECODE')
      }
      browser.push({ kind, visibleMarker: changed, testImageDecoded })
      await page.close()
    }
  } finally { await chrome.close() }
}
const result = { phase, fullRoutesUnchanged: bundle.pages.length, counts: manifest.counts, revision: manifest.contentRevision,
  deploymentId: deployment?.deploymentId, url: deployment?.url, branchAliasMatches, branchAliasImageStatus, samples, imageStatus: changed ? 200 : 404,
  sitemapEntries: bundle.sitemap.kept, translationReviewRoutes: changedSeo.map(row => row.route), browser }
await writeFile(path.join(RECOVERY, local ? 'drill-local-verification.json' : 'drill-online-verification.json'), JSON.stringify(result, null, 2))
console.log(JSON.stringify(result))
