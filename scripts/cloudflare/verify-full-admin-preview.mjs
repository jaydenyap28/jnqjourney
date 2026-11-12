import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PROJECT, RECOVERY } from './recovery-sources.mjs'

const json = file => readFile(path.join(RECOVERY, file), 'utf8').then(JSON.parse)
const deployment = await json('deployment.json')
const source = await json('sources/database.json')
const bundle = await json('package-result.json')
assert.ok(deployment.success && deployment.environment === 'preview' && deployment.functions === 0)
assert.match(deployment.url, new RegExp(`^https://[a-f0-9]+\\.${PROJECT}\\.pages\\.dev$`))
const base = deployment.url
async function get(route, status = 200) {
  const result = await fetch(base + route, { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(25000) })
  assert.equal(result.status, status, route)
  assert.match(result.headers.get('x-robots-tag') || '', /noindex/, route)
  return result
}
const sorted = values => [...values].sort((a, b) => a - b)
const [feed, sitemap, robots] = await Promise.all([
  get('/public-data/locations.json').then(response => response.json()),
  get('/sitemap.xml').then(response => response.text()),
  get('/robots.txt').then(response => response.text()),
])
assert.deepEqual(sorted(feed.locations.map(item => item.id)), sorted(source.locations.map(item => item.id)))
assert.ok(feed.locations.every(item => !Object.hasOwn(item, 'review_jayden') && !Object.hasOwn(item, 'review_qing')))
assert.equal((sitemap.match(/<loc>/g) || []).length, bundle.sitemap.kept)
assert.match(robots, /Disallow: \//)
const sampleRoutes = ['/', '/en', ...['/spot/', '/en/spot/', '/notes/', '/guide/', '/region/', '/packages/'].map(prefix =>
  bundle.pages.find(item => item.route.startsWith(prefix))?.route)]
for (const route of sampleRoutes) {
  assert.ok(route)
  const html = await (await get(route)).text()
  assert.match(html, /<h1\b/)
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.jnqjourney\.com/)
}
for (const alias of bundle.redirects.filter(item => item.status === 301).slice(0, 2)) {
  const response = await get(alias.from, 301)
  assert.equal(new URL(response.headers.get('location'), base).pathname, alias.to)
}
const hidden = source.inventory.filter(row => !source.locations.some(item => item.id === row.id))
for (const row of hidden) {
  await Promise.all([
    get('/spot/spot-' + row.id, 404),
    get('/en/spot/spot-' + row.id, 404),
    get('/public-data/spots/spot-' + row.id + '.json', 404),
  ])
}
await get('/jnq-full-review-missing', 404)

const imageRepair = JSON.parse(await readFile('artifacts/cloudflare-image-emergency-20261111/exact-byte-restorations.json', 'utf8'))
assert.equal(imageRepair.proof.length, 40)
for (let offset = 0; offset < imageRepair.proof.length; offset += 5) {
  await Promise.all(imageRepair.proof.slice(offset, offset + 5).map(async item => {
    assert.match(item.target, /^\/media\/static\/[a-f0-9]{64}\.(?:webp|png|jpe?g|avif|gif)$/)
    const response = await get(item.target)
    assert.match(response.headers.get('content-type') || '', /^image\//)
    const bytes = Buffer.from(await response.arrayBuffer())
    assert.equal(bytes.length, item.bytes)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256)
  }))
}
const result = { verifiedAt: new Date().toISOString(), url: base, deploymentId: deployment.deploymentId,
  htmlSamples: sampleRoutes.length, publicSpotIds: feed.locations.length, hiddenSpots: hidden.length,
  sitemapEntries: bundle.sitemap.kept, repairedImagesVerified: imageRepair.proof.length, functions: 0, noindex: true }
await writeFile(path.join(RECOVERY, 'formal-preview-http.json'), JSON.stringify(result, null, 2))
console.log(JSON.stringify(result))
