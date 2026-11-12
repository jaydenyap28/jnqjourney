import assert from 'node:assert/strict'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { sha256, revisionPattern } from '../../cloudflare/admin-preview/publication.mjs'
import { MEDIA_NAME, SUPABASE_ORIGIN, FUNCTION } from '../../cloudflare/admin-preview/scope.mjs'
import { staticRecoveryIndexingPolicy } from './recovery-launch-policy.mjs'
import { pageMetadata } from './package-static-recovery.mjs'
import { assertNoLegacyDelivery } from './recovery-media-release-gate.mjs'

const MAX_FILE = 25 * 1024 * 1024
const content = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const href = row => `/${row.kind === 'note' ? 'notes' : row.kind}/${row.slug}`
const imagePath = name => '/media/static/' + name
const photo = (name, label = '') => name
  ? `<img src="${imagePath(name)}" alt="${content(label)}" loading="lazy">` : ''
const photos = names => names.map(name => photo(name)).join('')
const paragraph = text => text ? `<p>${content(text)}</p>` : ''
const stylesheet = 'body{font:1rem/1.65 system-ui,sans-serif;margin:0 auto;padding:1.5rem;max-width:52rem;color:#182430}a{color:#075c52}img{max-width:100%;height:auto;display:block;margin:1rem 0}nav{margin-bottom:2rem}p{white-space:pre-wrap}footer{margin-top:3rem;border-top:1px solid #ddd}'

function html(title, body, description = '') {
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${content(title)}</title><meta name="description" content="${content(description.slice(0, 400))}"><link rel="stylesheet" href="/site.css"></head><body><nav><a href="/">JnQ Journey · 隔离公开预览</a></nav><main><h1>${content(title)}</h1>${body}</main></body></html>`
}

function render(row, spots) {
  const linkSpot = id => {
    const spot = spots.get(String(id))
    return spot ? `<a href="${href(spot)}">${content(spot.title)}</a>` : ''
  }
  let details = ''
  if (row.kind === 'spot') details = paragraph(row.category) + paragraph(row.address)
  if (row.kind === 'note') details = row.blocks.map(block => {
    const text = block.type === 'heading' ? `<h2>${content(block.content || block.title)}</h2>`
      : block.type === 'quote' ? `<blockquote>${content(block.content)}</blockquote>` : paragraph(block.content)
    return text + photo(block.image, block.title) + photos(block.images) + linkSpot(block.spotId)
  }).join('')
  if (row.kind === 'guide') details = paragraph(row.duration) + paragraph(row.budget) + row.days.map(day =>
    `<section><h2>${content(day.title || '行程')}</h2>${paragraph(day.summary)}${photos(day.images)}<ul>${day.spotIds.map(id => `<li>${linkSpot(id)}</li>`).join('')}</ul></section>`).join('')
  return html(row.title, photo(row.cover, row.title) + paragraph(row.summary) + details + photos(row.images), row.seoDescription || row.summary)
}

export async function buildAdminRelease({ job, output, cache, runnerHeaders }) {
  assert.match(job.id, revisionPattern)
  assert.equal(await sha256(JSON.stringify(job.projection)), job.id, 'APPROVED_PROJECTION_HASH_MISMATCH')
  const { records, media } = job.projection
  assert.ok(Array.isArray(records) && records.length <= 100 && Array.isArray(media) && media.length <= 60)
  assert.equal(new Set(media).size, media.length)
  const paths = new Set(records.map(href))
  assert.equal(paths.size, records.length)
  await mkdir(output, { recursive: true })
  assert.equal((await readdir(output)).length, 0, 'RELEASE_OUTPUT_NOT_EMPTY')
  await mkdir(cache, { recursive: true })
  const manifest = []
  async function write(relative, value) {
    assert.ok(!relative.split('/').includes('..'))
    const file = path.join(output, relative)
    await mkdir(path.dirname(file), { recursive: true })
    if (typeof value === 'string') {
      assertNoLegacyDelivery(value)
      assert.doesNotMatch(value, /\/admin-draft-media\/|\/storage\/v1\/object\/(?:sign|authenticated)\/|X-Amz-(?:Signature|Credential)=|sb_secret_[a-zA-Z0-9_-]{16,}|BEGIN (?:RSA |EC )?PRIVATE KEY/, 'PRIVATE_REFERENCE_IN_PUBLIC_OUTPUT')
      for (const token of value.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || []) {
        let claims
        try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) } catch {}
        assert.notEqual(claims?.role, 'service_role', 'PRIVILEGED_TOKEN_IN_PUBLIC_OUTPUT')
      }
    }
    const bytes = typeof value === 'string' ? Buffer.from(value) : value
    assert.ok(bytes.length <= MAX_FILE)
    await writeFile(file, bytes, { flag: 'wx' })
    manifest.push({ path: relative, sha256: await sha256(bytes), bytes: bytes.length })
  }
  let downloaded = 0, reused = 0
  for (const name of media) {
    assert.match(name, MEDIA_NAME)
    const cached = path.join(cache, name)
    let bytes = await readFile(cached).catch(error => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (!bytes) {
      const response = await fetch(`${SUPABASE_ORIGIN}/functions/v1/${FUNCTION}/publication/runner/media/${job.id}/${name}`, {
        headers: runnerHeaders, redirect: 'error', signal: AbortSignal.timeout(25000),
      })
      assert.ok(response.ok && /^image\/(png|jpeg|webp|gif)$/.test(response.headers.get('content-type') || ''), 'APPROVED_MEDIA_FETCH_FAILED')
      bytes = Buffer.from(await response.arrayBuffer())
      assert.ok(bytes.length > 0 && bytes.length <= 10 * 1024 * 1024)
      assert.equal(await sha256(bytes), name.slice(0, 64), 'APPROVED_MEDIA_DIGEST_MISMATCH')
      await writeFile(cached, bytes, { flag: 'wx' })
      downloaded++
    } else {
      assert.equal(await sha256(bytes), name.slice(0, 64), 'APPROVED_MEDIA_CACHE_DIGEST_MISMATCH')
      reused++
    }
    await write(imagePath(name).slice(1), bytes)
  }
  const spots = new Map(records.filter(row => row.kind === 'spot').map(row => [row.key, row]))
  for (const row of records) {
    assert.ok(['spot', 'note', 'guide'].includes(row.kind) && row.status === 'published' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug))
    await write(href(row).slice(1) + '.html', render(row, spots))
  }
  const links = records.map(row => `<li><a href="${href(row)}">${content(row.title)}</a></li>`).join('')
  await write('index.html', html('JnQ Journey 发布预览', `<ul>${links}</ul>`))
  await write('404.html', html('找不到此页面', paragraph('内容未发布或已撤下。')))
  await write('site.css', stylesheet)
  const published = records.map(row => ({
    ...row, url: href(row), cover: row.cover ? imagePath(row.cover) : null,
    images: row.images.map(imagePath),
    ...(row.blocks ? { blocks: row.blocks.map(block => ({
      ...block, image: block.image ? imagePath(block.image) : null, images: block.images.map(imagePath),
    })) } : {}),
    ...(row.days ? { days: row.days.map(day => ({ ...day, images: day.images.map(imagePath) })) } : {}),
  }))
  await write('public-data/locations.json', JSON.stringify({ locations: published.filter(row => row.kind === 'spot') }))
  await write('public-data/notes.json', JSON.stringify({ notes: published.filter(row => row.kind === 'note') }))
  await write('public-data/guides.json', JSON.stringify({ guides: published.filter(row => row.kind === 'guide') }))
  const policy = staticRecoveryIndexingPolicy('preview')
  await write('_headers', policy.headers)
  await write('robots.txt', policy.robots)
  const receipt = {
    schemaVersion: 1, revision: job.id, functions: 0, pages: [...paths].sort(),
    media: media.map(name => ({ url: imagePath(name), sha256: name.slice(0, 64) })),
    files: manifest.filter(file => file.path !== '_headers').sort((a, b) => a.path.localeCompare(b.path)),
  }
  assert.ok(receipt.files.length < 20000)
  for (const file of manifest) {
    const bytes = await readFile(path.join(output, file.path))
    assert.equal(await sha256(bytes), file.sha256, 'STATIC_OUTPUT_DIGEST_MISMATCH')
    if (file.path.endsWith('.html')) {
      const meta = pageMetadata(bytes.toString())
      assert.ok(meta.title && meta.h1 === 1 && !meta.indexable)
    }
  }
  await write('_publication.json', JSON.stringify(receipt))
  return { receipt, downloaded, reused }
}
