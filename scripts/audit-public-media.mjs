import fs from 'node:fs'
import path from 'node:path'
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'

function loadEnvLocal() {
  const filePath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(filePath)) return
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index < 1) continue
    const key = trimmed.slice(0, index).trim()
    let value = trimmed.slice(index + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (!process.env[key]) process.env[key] = value
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
}

function classify(value) {
  const raw = String(value || '').trim()
  if (!raw) return 'missing'
  try {
    const host = new URL(raw).hostname.toLowerCase()
    if (host.endsWith('.r2.dev') || host.includes('r2.cloudflarestorage.com')) return 'cloudflare-r2'
    if (host.includes('supabase.co')) return 'supabase-storage'
    if (host === 'i.ibb.co' || host.endsWith('.imgbb.com') || host === 'imgbb.com') return 'imgbb'
    if (host.includes('fbcdn.net') || host.endsWith('facebook.com')) return 'facebook'
    return host
  } catch {
    return 'invalid'
  }
}

function imageUrlsFromGuides(guides) {
  return guides.flatMap((guide) => [
    guide.coverImage,
    ...(guide.days || []).flatMap((day) => (day.gallery || []).map((image) => image.url)),
  ])
}

function imageUrlsFromNotes(notes) {
  return notes.flatMap((note) => [
    note.coverImage,
    ...(note.blocks || []).flatMap((block) => [
      block.imageUrl,
      ...(block.images || []).map((image) => image.src),
    ]),
  ])
}

async function listR2Objects() {
  const required = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME']
  if (required.some((key) => !process.env[key])) return []
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  })
  const objects = []
  let continuationToken
  do {
    const result = await client.send(new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET_NAME,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    }))
    objects.push(...(result.Contents || []).map((item) => ({ key: item.Key, size: item.Size, etag: item.ETag })))
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined
  } while (continuationToken)
  return objects
}

async function statusFor(url) {
  const target = String(url || '').split('#', 1)[0]
  if (!target) return 0
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    let response = await fetch(target, { method: 'HEAD', redirect: 'follow', signal: controller.signal })
    if (response.status === 405) response = await fetch(target, { headers: { Range: 'bytes=0-0' }, redirect: 'follow', signal: controller.signal })
    return response.status
  } catch {
    return 0
  } finally {
    clearTimeout(timer)
  }
}

async function statusAudit(urls) {
  const unique = [...new Set(urls.map((url) => String(url || '').trim()).filter(Boolean))]
  const results = []
  let cursor = 0
  await Promise.all(Array.from({ length: 12 }, async () => {
    while (cursor < unique.length) {
      const index = cursor++
      results[index] = { url: unique[index], host: classify(unique[index]), status: await statusFor(unique[index]) }
    }
  }))
  return Object.values(results.reduce((summary, item) => {
    const key = `${item.host}:${item.status}`
    summary[key] ||= { host: item.host, status: item.status, count: 0 }
    summary[key].count += 1
    return summary
  }, {})).sort((left, right) => left.host.localeCompare(right.host) || left.status - right.status)
}

loadEnvLocal()
const root = process.cwd()
const spotDir = path.join(root, 'public-data', 'spots')
const spotFiles = fs.readdirSync(spotDir).filter((name) => name.endsWith('.json') && name !== 'index.json')
const spots = spotFiles.map((name) => readJson(path.join(spotDir, name)).spot)
let guides = readJson(path.join(root, 'data', 'guides.json'))
let notes = readJson(path.join(root, 'data', 'notes.json'))
if (process.argv.includes('--production')) {
  const base = 'https://www.jnqjourney.com'
  const guideList = await (await fetch(`${base}/api/guides`)).json()
  guides = await Promise.all((guideList.guides || []).map(async (guide) => {
    const payload = await (await fetch(`${base}/api/guides?slug=${encodeURIComponent(guide.slug)}`)).json()
    return payload.guide || guide
  }))
  const notePayload = await (await fetch(`${base}/api/notes`)).json()
  notes = notePayload.notes || []
}
const spotUrls = spots.flatMap((spot) => [spot.image_url, ...(Array.isArray(spot.images) ? spot.images : [])])
const guideUrls = imageUrlsFromGuides(guides)
const noteUrls = imageUrlsFromNotes(notes)
const allUrls = [...new Set([...spotUrls, ...guideUrls, ...noteUrls].map((url) => String(url || '').trim()).filter(Boolean))]
const r2Objects = await listR2Objects()
const spotSlugBaseToId = new Map(spots.map((spot) => [String(spot.slug || '').replace(/-\d+$/, '').toLowerCase(), Number(spot.id)]))
const historicalObjectIdentities = new Map()
for (const item of r2Objects) {
  const key = String(item.key || '')
  if (!/^locations\//i.test(key) || !/\.(?:avif|gif|jpe?g|png|webp)$/i.test(key)) continue
  const legacyId = Number(key.match(/^locations\/\d{4}-\d{2}-\d{2}\/(\d+)-/i)?.[1] || 0)
  const segments = key.toLowerCase().split('/')
  const structuredId = [...spotSlugBaseToId.entries()].find(([slug]) => segments.includes(slug))?.[1] || 0
  const id = legacyId || structuredId
  if (id) {
    if (!historicalObjectIdentities.has(id)) historicalObjectIdentities.set(id, new Set())
    historicalObjectIdentities.get(id).add(String(item.etag || item.key))
  }
}
const historicalLengths = spots.map((spot) => historicalObjectIdentities.get(Number(spot.id))?.size || 0)
const r2Base = String(process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '')
const legacyUrls = allUrls.filter((url) => classify(url) !== 'cloudflare-r2')
const r2Matches = legacyUrls.map((url) => {
  const decoded = decodeURIComponent(String(url).split(/[?#]/, 1)[0]).toLowerCase()
  const tokens = [
    ...(decoded.match(/[0-9a-f]{8}-[0-9a-f-]{27,}/g) || []),
    ...(decoded.match(/\d{9,}/g) || []),
  ]
  const matches = r2Objects.filter((item) => tokens.some((token) => item.key?.toLowerCase().includes(token))).slice(0, 5)
  return matches.length ? { source: url, matches: matches.map((item) => `${r2Base}/${item.key}`) } : null
}).filter(Boolean)
const hostCounts = allUrls.reduce((counts, url) => {
  const host = classify(url)
  counts[host] = (counts[host] || 0) + 1
  return counts
}, {})
const imageLengths = spots.map((spot) => new Set([spot.image_url, ...(Array.isArray(spot.images) ? spot.images : [])].filter(Boolean)).size)

const report = {
  generatedAt: new Date().toISOString(),
  spots: {
    total: spots.length,
    noImage: imageLengths.filter((length) => length === 0).length,
    oneImage: imageLengths.filter((length) => length === 1).length,
    multipleImages: imageLengths.filter((length) => length >= 2).length,
  },
  guides: { total: guides.length, noCover: guides.filter((guide) => !guide.coverImage).length },
  notes: { total: notes.length, noCover: notes.filter((note) => !note.coverImage).length },
  uniqueUrls: allUrls.length,
  hostCounts,
  r2: {
    objects: r2Objects.length,
    publicDataObjects: r2Objects.filter((item) => item.key?.startsWith('public-data/')).length,
    historicalSpotObjects: {
      noAssociatedObject: historicalLengths.filter((length) => length === 0).length,
      oneAssociatedObject: historicalLengths.filter((length) => length === 1).length,
      multipleAssociatedObjects: historicalLengths.filter((length) => length >= 2).length,
    },
    legacyUrlMatches: r2Matches,
  },
}
const findR2 = process.argv.find((value) => value.startsWith('--find-r2='))?.split('=', 2)[1]?.toLowerCase()
if (findR2) {
  report.r2.matches = r2Objects
    .filter((item) => item.key?.toLowerCase().includes(findR2))
    .map((item) => ({ key: item.key, size: item.size }))
}

if (process.argv.includes('--supabase')) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    report.authoritativeSpotMedia = { ok: false, error: 'missing-env' }
  } else {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error, status } = await client
      .from('locations')
      .select('id,image_url,images')
      .eq('status', 'active')
      .order('id', { ascending: true })
    if (error || !data) {
      report.authoritativeSpotMedia = { ok: false, status, error: error?.code || error?.message || 'unavailable' }
    } else {
      const lengths = data.map((spot) => new Set([spot.image_url, ...(Array.isArray(spot.images) ? spot.images : [])].filter(Boolean)).size)
      report.authoritativeSpotMedia = {
        ok: true,
        total: data.length,
        noImage: lengths.filter((length) => length === 0).length,
        oneImage: lengths.filter((length) => length === 1).length,
        multipleImages: lengths.filter((length) => length >= 2).length,
      }
    }
  }
}

if (process.argv.includes('--http')) report.httpStatus = await statusAudit(allUrls)
console.log(JSON.stringify(report, null, 2))
