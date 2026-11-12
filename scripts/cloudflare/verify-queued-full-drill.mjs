import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { rehearsalTarget } from './full-release-rehearsal.mjs'

const [origin, phase] = process.argv.slice(2)
assert.match(origin, /^https:\/\/[a-f0-9]+\.jnqjourney-static-recovery-candidate\.pages\.dev$/)
assert.ok(['--added', '--withdrawn'].includes(phase))
const folder = 'artifacts/cloudflare-admin-isolated/publisher/'
const plan = JSON.parse(await readFile(folder + 'full-site-drill.json'))
const withdrawn = phase === '--withdrawn'
assert.equal(plan.withdrawn, withdrawn)
const slug = 'full-queue-drill-' + plan.marker.slice('JNQ-QUEUE-'.length).toLowerCase() + '-' + plan.spotId
const spotPath = '/spot/' + slug
const detailPath = '/public-data/spots/' + slug + '.json'
const imagePath = '/media/static/' + plan.image
const statuses = {}
async function get(route, status = 200) {
  const response = await fetch(origin + route, { redirect: 'error', signal: AbortSignal.timeout(20000), cache: 'no-store' })
  assert.equal(response.status, status, route)
  assert.match(response.headers.get('x-robots-tag') ?? '', /noindex/, route)
  statuses[route] = response.status
  return response
}
const release = await (await get('/_admin-publication.json')).json()
assert.equal(release.id, plan.jobId)
assert.equal(release.functions, 0)
assert.equal(release.publicPages, withdrawn ? 1349 : 1351)
assert.equal(release.publicSpots, withdrawn ? 582 : 583)
assert.equal(release.staticMedia, withdrawn ? 4515 : 4516)
const [locations, notes, guides, sitemap] = await Promise.all([
  get('/public-data/locations.json').then(res => res.json()),
  get('/public-data/notes.json').then(res => res.json()),
  get('/public-data/guides.json').then(res => res.json()),
  get('/sitemap.xml').then(res => res.text()),
])
assert.equal(locations.locations.length, release.publicSpots)
assert.equal(locations.locations.some(row => row.id === plan.spotId), !withdrawn)
assert.equal(notes.notes.length, 6)
assert.equal(guides.guides.length, 7)
assert.ok(notes.notes.find(row => row.slug === rehearsalTarget.note.id).blocks.some(block => block.content?.includes(plan.marker)))
assert.ok(guides.guides.find(row => row.slug === rehearsalTarget.guide.id).summary.includes(plan.marker))
const image = await get(imagePath, withdrawn ? 404 : 200)
if (!withdrawn) {
  assert.match(image.headers.get('content-type') ?? '', /^image\/png\b/)
  assert.equal(createHash('sha256').update(Buffer.from(await image.arrayBuffer())).digest('hex') + '.png', plan.image)
} else {
  await image.body?.cancel()
  assert.ok(!sitemap.includes(spotPath))
}
for (const route of ['/en' + spotPath, detailPath, '/api/spots/' + slug, ...(withdrawn ? [spotPath] : [])]) {
  const res = await get(route, withdrawn ? 404 : 200)
  if (!withdrawn && route.endsWith('.json')) assert.equal((await res.json()).spot.id, plan.spotId)
  else await res.body?.cancel()
}

const browserResults = {}
if (!withdrawn) {
  const { chromium } = await import('../../artifacts/cloudflare-upload-fix/browser-tools/node_modules/playwright-core/index.mjs')
  const chrome = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
  try {
    for (const [kind, route] of [['spot', spotPath], ['note', rehearsalTarget.note.route], ['guide', rehearsalTarget.guide.route]]) {
      const page = await chrome.newPage({ viewport: { width: kind === 'note' ? 390 : 1440, height: 900 } })
      const response = await page.goto(origin + route, { waitUntil: 'domcontentloaded', timeout: 45000 })
      assert.equal(response.status(), 200)
      const main = page.locator('main').first()
      assert.ok((await page.locator('h1').first().innerText()).trim())
      assert.ok((await main.innerText()).includes(plan.marker), kind + ' browser marker')
      if (kind === 'spot') {
        const photo = page.locator('main img[src$="' + imagePath + '"]').first()
        await photo.scrollIntoViewIfNeeded()
        assert.ok(await photo.evaluate(async (img, expected) => {
          await img.decode()
          return img.currentSrc === expected && img.naturalWidth === 71 && img.naturalHeight === 49
        }, origin + imagePath))
      }
      browserResults[kind] = { renderedChange: true, imageDecoded: kind === 'spot' }
      await page.close()
    }
  } finally { await chrome.close() }
}
const result = { origin, phase, jobId: plan.jobId, revision: release.revision, statuses, browserResults,
  publicPages: release.publicPages, publicSpots: release.publicSpots, notes: notes.notes.length,
  guides: guides.guides.length, staticMedia: release.staticMedia, functions: 0 }
await writeFile(folder + 'full-site-drill-' + phase.slice(2) + '-verification.json', JSON.stringify(result, null, 2))
console.log(JSON.stringify(result))
