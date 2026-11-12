// Public read-only sources. Keep credentials and unpublished material out of staging.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const RECOVERY_BASE = path.resolve('artifacts/cloudflare-static-recovery')
const workspace = process.env.JNQ_RECOVERY_WORKSPACE ? path.resolve(process.env.JNQ_RECOVERY_WORKSPACE) : RECOVERY_BASE
export const RECOVERY = process.env.JNQ_RECOVERY_OUTPUT ? path.resolve(process.env.JNQ_RECOVERY_OUTPUT) : RECOVERY_BASE
if (RECOVERY !== RECOVERY_BASE) assert.match(path.relative(workspace, RECOVERY).replaceAll('\\','/'), /^runs\/[a-zA-Z0-9_-]+$/, 'RECOVERY_OUTPUT_OUTSIDE_OWN_RUN')
export const SOURCE = path.join(RECOVERY, 'source')
export const PROJECT = 'jnqjourney-static-recovery-candidate'
export const BRANCH = 'codex/cloudflare-static-recovery'
export const SUPABASE = 'https://vrufunuomioczocdsoer.supabase.co'
export const CDN = 'https://pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev'
export const SPOT_COLUMNS = 'id,name,name_cn,category,latitude,longitude,region_id,description,review,address,google_maps_url,opening_hours,price_info,tags,visit_date,image_url,images,image_metadata,video_url,facebook_video_url,related_note_slugs,status,publication_status,seo_title_zh,seo_description_zh,seo_title_en,seo_description_en,experience_zh,experience_en,updated_at,redirect_url,redirect_type'
const sha = value => createHash('sha256').update(value).digest('hex')
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  return value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
}
export const fingerprint = value => sha(JSON.stringify(canonical(value)))
export function recoveryContentRevision(feeds) {
  const { capturedAt, ...database } = feeds['database.json']
  return fingerprint({ ...feeds, 'database.json': database })
}
export function eligibleRecoverySpot(row) {
  return row.id !== 450 && row.status === 'active' && [null, 'published'].includes(row.publication_status)
}
export function projectRecoveryDocuments(notes, guides) {
  return {
    publishedNotes: notes.filter(item => item.published === true && item.slug && item.title),
    publicGuides: guides.filter(item => item.slug && item.title && item.published !== false &&
      (item.publication_status == null || item.publication_status === 'published')),
  }
}
const origins = new Set([SUPABASE, CDN, 'https://api.frankfurter.dev'])

async function boundedRead(url, headers = {}) {
  assert.ok(origins.has(new URL(url).origin), 'PUBLIC_SOURCE_OUTSIDE_ALLOWLIST')
  const response = await fetch(url, { headers, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(20000) })
  assert.ok(response.ok, `PUBLIC_SOURCE_HTTP_${response.status}_${new URL(url).pathname}`)
  const chunks = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.byteLength
    assert.ok(size <= 12 * 1024 * 1024, 'PUBLIC_SOURCE_SIZE_LIMIT')
    chunks.push(chunk)
  }
  const bytes = Buffer.concat(chunks)
  return { bytes, etag: response.headers.get('etag'), sha256: sha(bytes) }
}

export async function captureRecoverySources({verifyOnly=false, privateSource=null, verifySourcesFrom=RECOVERY, preserveCapturedRates=false}={}) {
  if (preserveCapturedRates) assert.ok(verifyOnly && privateSource && verifySourcesFrom !== RECOVERY)
  const directory = path.join(verifyOnly ? verifySourcesFrom : RECOVERY, 'sources')
  await mkdir(directory, { recursive: true })
  let source = privateSource
  if (!source) {
    const publicKey = JSON.parse(await readFile(path.join(RECOVERY_BASE, '.public-read-key.json'), 'utf8'))
    assert.equal(publicKey.projectRef, 'vrufunuomioczocdsoer')
    assert.equal(JSON.parse(Buffer.from(publicKey.apiKey.split('.')[1], 'base64url').toString()).role, 'anon', 'ADMIN_CREDENTIAL_REJECTED')
    const headers = { apikey: publicKey.apiKey, Authorization: `Bearer ${publicKey.apiKey}` }
    source = {
      database: resource => boundedRead(SUPABASE + resource, headers),
      storage: key => boundedRead(`${SUPABASE}/storage/v1/object/public/location-images/${key}?static-recovery=${Date.now()}`),
      feed: key => boundedRead(`${CDN}/public-data/${key}?static-recovery=${Date.now()}`),
    }
  }
  const packageModule = await readFile('lib/server/travel-packages.ts', 'utf8')
  const packageColumns = packageModule.match(/const PACKAGE_SELECT = '([^']+)'/)[1]
  const optionColumns = packageModule.match(/const PACKAGE_OPTION_SELECT = '([^']+)'/)[1]
  const requestLog = []
  async function rows(table, select, filters = '') {
    const result = []
    for (let offset = 0; offset < 10000; offset += 200) {
      const resource = `/rest/v1/${table}?select=${select}&order=id&limit=200&offset=${offset}${filters}`
      const response = await source.database(resource)
      const page = JSON.parse(response.bytes)
      assert.ok(Array.isArray(page), 'PUBLIC_ROW_RESPONSE_INVALID')
      requestLog.push({ source: table, offset, count: page.length, sha256: response.sha256 })
      result.push(...page)
      if (page.length < 200) return result
    }
    throw Error('PUBLIC_ROW_PAGE_LIMIT')
  }
  async function database() {
    const [locations, regions, packages, options, inventory, affiliateLinks] = await Promise.all([
      rows('locations', SPOT_COLUMNS, '&status=eq.active&or=(publication_status.is.null,publication_status.eq.published)&id=neq.450'),
      rows('regions', 'id,name,name_cn,code,parent_id,description,image_url,bounds,slug,country,updated_at'),
      rows('travel_packages', packageColumns, '&status=eq.published'),
      rows('travel_package_options', optionColumns, '&status=eq.active'),
      rows('locations', 'id,status,publication_status,updated_at'),
      rows('affiliate_links', 'id,provider,link_type,url,title,description,commission_rate,clicks,location_id,region_id', '&is_active=eq.true'),
    ])
    const packageIds = new Set(packages.map(item => item.id))
    assert.ok(locations.length && new Set(locations.map(item => item.id)).size === locations.length)
    assert.ok(locations.every(eligibleRecoverySpot))
    assert.deepEqual(locations.map(item => item.id), inventory.filter(eligibleRecoverySpot).map(item => item.id),
      'PUBLIC_PROJECTION_DIFFERS_FROM_AUTHORITY')
    return { locations, regions, packages, options: options.filter(item => packageIds.has(item.package_id)), inventory, affiliateLinks }
  }
  const before = await database()
  const storage = source.storage
  async function document(name) {
    const key = `_system/${name}-latest.webp`
    const pointer = await storage(key)
    const target = pointer.bytes.toString().trim()
    assert.match(target, new RegExp(`^_system/${name}/[0-9]+(?:-[a-f0-9-]{36})?\\.webp$`), 'AUTHORITY_POINTER_INVALID')
    const document = await storage(target)
    const parsed = JSON.parse(document.bytes)
    assert.ok(Array.isArray(parsed), 'AUTHORITY_DOCUMENT_INVALID')
    return { key, target, pointer, document, records: parsed }
  }
  const [guides, notes, slugs, english, tripCosts, historicalSlugs] = await Promise.all([
    document('guides'), document('notes'), storage('_system/location-slugs.webp'),
    source.feed('i18n/en/records.json'), source.feed('guide-trip-costs.json'), source.feed('spots/index.json'),
  ])
  const { publishedNotes, publicGuides } = projectRecoveryDocuments(notes.records, guides.records)
  // Guide drafts are a separate store. The existing public Guide reader serves
  // this authoritative guides collection without a per-item publication flag.
  assert.ok(publicGuides.length && publishedNotes.length)
  const slugMap = JSON.parse(slugs.bytes)
  assert.ok(slugMap && typeof slugMap === 'object' && !Array.isArray(slugMap))
  const englishSnapshot = JSON.parse(english.bytes)
  const costs = JSON.parse(tripCosts.bytes)
  assert.ok(englishSnapshot.schemaVersion === 1 && englishSnapshot.locale === 'en' && Array.isArray(englishSnapshot.records))
  assert.ok(costs.schemaVersion === 1 && Array.isArray(costs.tripCosts))
  for (const doc of [guides, notes]) {
    const check = await storage(doc.key)
    assert.equal(check.sha256, doc.pointer.sha256, 'AUTHORITY_CHANGED_DURING_CAPTURE')
    if (privateSource) assert.equal((await storage(doc.target)).sha256, doc.document.sha256, 'AUTHORITY_VERSION_BYTES_CHANGED')
  }
  assert.equal((await storage('_system/location-slugs.webp')).sha256, slugs.sha256)
  for (const [key, captured] of [['i18n/en/records.json', english], ['guide-trip-costs.json', tripCosts]]) {
    assert.equal((await source.feed(key)).sha256, captured.sha256)
  }
  const after = await database()
  assert.equal(fingerprint(after), fingerprint(before), 'DATABASE_CHANGED_DURING_CAPTURE')
  const ids = new Set(before.locations.map(item => item.id))
  const regionIds = new Set(before.regions.map(item => item.id))
  const guideSlugs = new Set(publicGuides.map(item => item.slug))
  const notePaths = new Set(publishedNotes.map(item => '/notes/' + item.slug))
  englishSnapshot.records = englishSnapshot.records.filter(record => {
    if (record.entityType === 'spot') return ids.has(Number(record.entityId))
    if (record.entityType === 'region') return regionIds.has(Number(record.entityId))
    if (record.entityType === 'guide') return guideSlugs.has(String(record.entityId))
    if (record.canonicalPath?.startsWith('/notes/')) return notePaths.has(record.canonicalPath)
    return ['/','/about','/region','/guide','/notes','/search','/contact','/privacy','/editorial-policy','/affiliate-disclosure','/copyright'].includes(record.canonicalPath)
  })
  const fx = preserveCapturedRates ? JSON.parse(await readFile(path.join(directory, 'fx.json'), 'utf8')) :
    (await captureExchangeRates({persist:!verifyOnly})).data
  const feeds = {
    'database.json': { schemaVersion: 1, capturedAt: new Date().toISOString(), projectRef: 'vrufunuomioczocdsoer', ...before },
    'guides.json': { schemaVersion: 1, guides: publicGuides }, 'notes.json': { schemaVersion: 1, notes: publishedNotes },
    'location-slugs.json': slugMap, 'english.json': englishSnapshot, 'guide-trip-costs.json': costs,
    'historical-public-slugs.json': JSON.parse(historicalSlugs.bytes),
    'fx.json': fx,
  }
  if(verifyOnly) {
    for(const [file,value] of Object.entries(feeds)) {
      const captured=JSON.parse(await readFile(path.join(directory,file),'utf8'))
      if(file==='database.json'){delete captured.capturedAt;delete value.capturedAt}
      assert.equal(fingerprint(value),fingerprint(captured),'PUBLIC_SOURCE_CHANGED_REBUILD_REQUIRED_'+file)
    }
    const checked={checkedAt:new Date().toISOString(),matched:true,files:Object.keys(feeds),productionWrites:0,realtimeRevocation:false,
      ...(preserveCapturedRates?{exchangeRatesPinnedForRehearsal:true}:{})}
    await writeFile(path.join(RECOVERY,'source-freshness.json'),JSON.stringify(checked,null,2))
    return checked
  }
  for (const [file, value] of Object.entries(feeds)) await writeFile(path.join(directory, file), JSON.stringify(value))
  const manifest = { capturedAt: new Date().toISOString(), databaseFingerprint: fingerprint(before),
    consistency: 'Bounded REST before/after equality and stable authority pointers; no cross-system atomic transaction.',
    origins: privateSource ? [SUPABASE, 'https://api.cloudflare.com'] : [SUPABASE, CDN],
    readMode: privateSource ? 'authenticated-server' : 'legacy-public',
    contentRevision: recoveryContentRevision(feeds),
    files: Object.fromEntries(Object.entries(feeds).map(([file, value]) => [file, { sha256: sha(JSON.stringify(value)), bytes: Buffer.byteLength(JSON.stringify(value)) }])),
    authority: { guides: { pointer: guides.key, target: guides.target, sha256: guides.document.sha256 }, notes: { pointer: notes.key, target: notes.target, sha256: notes.document.sha256 }, slugs: { sha256: slugs.sha256 }, english: { sha256: english.sha256, version: englishSnapshot.version } },
    counts: { totalSpots: before.inventory.length, publicSpots: before.locations.length, excludedSpots: before.inventory.length - before.locations.length, regions: before.regions.length, guides: publicGuides.length, notes: publishedNotes.length, packages: before.packages.length, options: before.options.length, localizations: englishSnapshot.records.length, affiliates: before.affiliateLinks.length },
    reads: requestLog, productionWrites: 0 }
  await writeFile(path.join(RECOVERY, 'source-manifest.json'), JSON.stringify(manifest, null, 2))
  return manifest
}

async function captureExchangeRates({persist=true}={}) {
  // The same public, key-free currency source used by the existing /api/fx.
  const response = await boundedRead('https://api.frankfurter.dev/v2/rates?base=MYR&quotes=CNY,USD,JPY,SGD')
  const values = JSON.parse(response.bytes)
  assert.ok(Array.isArray(values) && values.length === 4 && values.every(row => row.date && Number.isFinite(row.rate) && row.rate > 0))
  const fx = { date: values[0].date, base: 'MYR', rates: Object.fromEntries([['MYR',1], ...values.map(row=>[row.quote,row.rate])]) }
  if(persist)await writeFile(path.join(RECOVERY,'sources/fx.json'),JSON.stringify(fx))
  return { date: fx.date, sourceSha256: response.sha256, data:fx }
}
if (process.argv[1]?.endsWith('recovery-sources.mjs')) {
  const result=process.argv.includes('--fx-only') ? await captureExchangeRates() : await captureRecoverySources({verifyOnly:process.argv.includes('--verify-capture')})
  console.log(JSON.stringify(result.counts||result))
}
