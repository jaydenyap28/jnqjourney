import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { FIRST_SPOT_ID, LAST_SPOT_ID, FUNCTION, SUPABASE_ORIGIN } from '../../cloudflare/admin-preview/scope.mjs'
import { buildFullStaticPackage, readVerifiedFullPackage } from './full-static-package.mjs'
import { applyApprovedChanges, loadReleaseSnapshot, publicIdentityDelta, rehearsalTarget } from './full-release-rehearsal.mjs'
import { fingerprint, recoveryContentRevision } from './recovery-sources.mjs'

const baselineRun = 'full-review-20261112-b'
const baselineRevision = '76d6811e4743ffd555192aefdd87ec76c59f480ff5ed90ed35547b6a4ca17a06'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const json = file => readFile(file, 'utf8').then(JSON.parse)

export async function buildQueuedFullDrill({ job, drill, workspace, runnerHeaders }) {
  assert.ok(path.isAbsolute(workspace) && await realpath(workspace) === workspace, 'INVALID_PRIVATE_WORKSPACE')
  assert.equal(drill.jobId, job.id)
  assert.equal(sha(JSON.stringify(job.projection)), job.id, 'APPROVED_PROJECTION_HASH_MISMATCH')
  assert.match(drill.marker, /^JNQ-QUEUE-[A-Z0-9]{6,16}$/)
  assert.match(drill.image, /^[a-f0-9]{64}\.png$/)
  assert.ok(Number.isSafeInteger(drill.spotId) && drill.spotId >= FIRST_SPOT_ID && drill.spotId <= LAST_SPOT_ID)
  assert.equal(typeof drill.withdrawn, 'boolean')

  const runs = path.join(workspace, 'runs')
  const baseline = await loadReleaseSnapshot(path.join(runs, baselineRun))
  assert.equal(baseline.manifest.contentRevision, baselineRevision)
  assert.equal(baseline.manifest.readMode, 'authenticated-server')
  const { records, media } = job.projection
  const expectedKeys = ['guide:' + drill.guide, 'note:' + drill.note, ...(drill.withdrawn ? [] : ['spot:' + drill.spotId])]
  assert.deepEqual(records.map(row => row.kind + ':' + row.key).sort(), expectedKeys)
  assert.ok(records.every(row => row.status === 'published'))
  assert.deepEqual(media, drill.withdrawn ? [] : [drill.image])

  const baselineNote = baseline.feeds['notes.json'].notes.find(row => row.slug === rehearsalTarget.note.id)
  const baselineGuide = baseline.feeds['guides.json'].guides.find(row => row.slug === rehearsalTarget.guide.id)
  const note = structuredClone(baselineNote)
  const guide = structuredClone(baselineGuide)
  const block = note.blocks.find(item => item.type === 'paragraph' && item.content)
  const approvedNote = records.find(row => row.kind === 'note')
  const approvedGuide = records.find(row => row.kind === 'guide')
  const noteText = drill.marker + ' · Note'
  const guideText = drill.marker + ' · Guide'
  assert.ok(approvedNote.blocks.some(item => item.type === 'paragraph' && item.content === noteText))
  assert.equal(approvedGuide.summary, guideText)
  block.content += '\n\n' + noteText
  guide.summary += ' ' + guideText
  const feeds = applyApprovedChanges(baseline.feeds, [
    { kind: 'note', key: note.slug, expected: fingerprint(baselineNote), value: note },
    { kind: 'guide', key: guide.slug, expected: fingerprint(baselineGuide), value: guide },
  ])
  const db = feeds['database.json']
  const spot = records.find(row => row.kind === 'spot')
  const slug = 'full-queue-drill-' + drill.marker.slice('JNQ-QUEUE-'.length).toLowerCase()
  const spotRoute = '/spot/' + slug + '-' + drill.spotId
  assert.ok(!db.inventory.some(row => row.id === drill.spotId))
  if (spot) {
    assert.ok(spot.title.includes(drill.marker) && spot.summary.includes(drill.marker))
    assert.equal(spot.cover, drill.image)
    assert.ok(spot.images.every(name => name === drill.image))
    assert.ok(Number.isFinite(spot.latitude) && Number.isFinite(spot.longitude))
    const draftImage = '/admin-draft-media/' + drill.image
    const state = { id: drill.spotId, status: 'active', publication_status: 'published', updated_at: spot.version }
    db.locations.push({
      ...Object.fromEntries(Object.keys(db.locations[0]).map(key => [key, null])),
      ...state, name: spot.title, name_cn: spot.title, description: spot.summary, category: spot.category,
      latitude: spot.latitude, longitude: spot.longitude, address: spot.address,
      image_url: draftImage, images: [draftImage], tags: [], related_note_slugs: [],
    })
    db.inventory.push(state)
    feeds['location-slugs.json'][drill.spotId] = slug
  }
  const delta = publicIdentityDelta(baseline.feeds, feeds)
  assert.deepEqual(delta, {
    added: { spot: spot ? [drill.spotId] : [], note: [], guide: [] },
    removed: { spot: [], note: [], guide: [] },
  }, 'FULL_SITE_BASELINE_RECORD_LOSS')

  if (drill.resumeRun) assert.ok(!drill.withdrawn && /^queue-drill-[A-Za-z0-9]+$/.test(drill.resumeRun))
  const directory = drill.resumeRun ? path.join(runs, drill.resumeRun) : await mkdtemp(path.join(runs, 'queue-drill-'))
  assert.equal(await realpath(directory), directory)
  const manifest = { ...baseline.manifest, readMode: 'isolated-queue-rehearsal', productionWrites: 0,
    contentRevision: recoveryContentRevision(feeds), files: {},
    counts: { ...baseline.manifest.counts, totalSpots: db.inventory.length, publicSpots: db.locations.length } }
  const sourceFiles = Object.entries(feeds).map(([name, payload]) => [name, Buffer.from(JSON.stringify(payload))])
  for (const [name, bytes] of sourceFiles) {
    manifest.files[name] = { sha256: sha(bytes), bytes: bytes.length }
  }
  if (drill.resumeRun) {
    const staged = await loadReleaseSnapshot(directory)
    assert.deepEqual(staged.manifest, manifest, 'RECOVERY_RELEASE_INPUTS_CHANGED')
  } else {
    const sources = path.join(directory, 'sources')
    await mkdir(sources)
    for (const [name, bytes] of sourceFiles) await writeFile(path.join(sources, name), bytes)
    await writeFile(path.join(directory, 'source-manifest.json'), JSON.stringify(manifest))
  }

  if (spot && !drill.resumeRun) {
    const response = await fetch(`${SUPABASE_ORIGIN}/functions/v1/${FUNCTION}/publication/runner/media/${job.id}/${drill.image}`, {
      headers: runnerHeaders, redirect: 'error', signal: AbortSignal.timeout(25000),
    })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'image/png')
    const bytes = Buffer.from(await response.arrayBuffer())
    assert.ok(bytes.length > 8 && bytes.length <= 1024 ** 2 && sha(bytes) === drill.image.slice(0, 64))
    await mkdir(path.join(directory, 'approved-incremental-media'))
    await writeFile(path.join(directory, 'approved-incremental-media', drill.image), bytes)
    await writeFile(path.join(directory, 'media-additions.json'), JSON.stringify({
      contentRevision: manifest.contentRevision,
      images: [{ name: drill.image, bytes: bytes.length, rightsEvidence: 'Generated image for the isolated rehearsal', approvedBy: 'Rehearsal scope' }],
    }))
  }

  const mediaRoot = path.join(workspace, 'restore-static', 'production-deploy', 'media', 'static')
  const verified = drill.resumeRun ? await readVerifiedFullPackage(directory, manifest) :
    await buildFullStaticPackage({ workspace, directory, manifest, mediaRoot })
  const output = path.join(directory, 'deploy')
  const mediaPath = '/media/static/' + drill.image
  const pages = [rehearsalTarget.note.route, rehearsalTarget.guide.route, ...(spot ? [spotRoute] : [])]
  const mediaEntries = spot ? [{ url: mediaPath, sha256: drill.image.slice(0, 64) }] : []
  const basePackage = await json(path.join(runs, baselineRun, 'package-result.json'))
  const releasePackage = await json(path.join(directory, 'package-result.json'))
  const expectedPages = basePackage.pages.map(row => row.route)
  const englishSpotRoute = '/en' + spotRoute
  if (spot) expectedPages.push(spotRoute, englishSpotRoute)
  assert.deepEqual(releasePackage.pages.map(row => row.route).sort(), expectedPages.sort(), 'FULL_SITE_ROUTE_LOSS')
  const testAliases = ['/spot/spot-' + drill.spotId, '/spot/' + drill.marker.toLowerCase() + '-' + drill.spotId]
  testAliases.push(...testAliases.map(route => '/en' + route))
  const aliasRules = testAliases.map(from => ({ from, to: from.startsWith('/en/') ? englishSpotRoute : spotRoute, status: 301 }))
  const expectedRedirects = [...basePackage.redirects, ...(spot ? aliasRules : [])]
  const redirectKey = row => [row.from, row.to, row.status].join(' ')
  assert.deepEqual(releasePackage.redirects.map(redirectKey).sort(), expectedRedirects.map(redirectKey).sort(), 'FULL_SITE_REDIRECT_CHANGE')
  const detailJson = '/public-data/spots/' + spotRoute.split('/').at(-1) + '.json'
  const routes = ['index.html', ...pages.map(route => route.slice(1) + '.html'),
    ...(spot ? [englishSpotRoute.slice(1) + '.html', detailJson.slice(1)] : []),
    'public-data/locations.json', 'public-data/notes.json', 'public-data/guides.json',
    'public-data/spots/index.json', 'sitemap.xml', '_publication.json', ...mediaEntries.map(item => item.url.slice(1))]
  const files = await Promise.all(routes.map(async route => {
    const bytes = await readFile(path.join(output, route))
    return { path: route, bytes: bytes.length, sha256: sha(bytes) }
  }))
  const receipt = { id: job.id, revision: manifest.contentRevision, baselineRevision, delta, pages, media: mediaEntries, files,
    withdrawnPaths: spot ? [] : [spotRoute, englishSpotRoute, detailJson, mediaPath, ...testAliases],
    publicPages: verified.publicPages, publicSpots: verified.publicSpotDetails, staticMedia: verified.staticMedia, functions: 0 }
  await writeFile(path.join(output, '_admin-publication.json'), JSON.stringify(receipt))
  return { output, receipt, downloaded: spot && !drill.resumeRun ? 1 : 0, reused: verified.staticMedia - mediaEntries.length }
}
