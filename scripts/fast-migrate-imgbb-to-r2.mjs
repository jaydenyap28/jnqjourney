import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

function loadEnvLocal() {
  if (!fs.existsSync('.env.local')) return
  for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#][^=]+)=(.*)$/)
    if (!match) continue
    const key = match[1].trim()
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    process.env[key] ||= value
  }
}

function requiredEnv(name) {
  if (!process.env[name]) throw new Error(`Missing ${name}`)
  return process.env[name]
}

function isImgBB(url) {
  return /(^https?:\/\/)?([^/]+\.)?(i\.ibb\.co|imgbb\.com)/i.test(url) || /\/\/i\.ibb\.co\//i.test(url)
}

function collectImgBBUrls(value, out = []) {
  if (!value) return out
  if (typeof value === 'string') {
    if (isImgBB(value)) out.push(value)
    return out
  }
  if (Array.isArray(value)) {
    for (const item of value) collectImgBBUrls(item, out)
  }
  return out
}

function replaceUrls(value, replacements) {
  if (!value) return value
  if (typeof value === 'string') {
    let next = value
    for (const [oldUrl, newUrl] of replacements) next = next.split(oldUrl).join(newUrl)
    return next
  }
  if (Array.isArray(value)) return value.map((item) => replaceUrls(item, replacements))
  return value
}

function extensionFor(url, contentType) {
  const clean = String(url).split('#')[0]
  let ext = ''
  try {
    ext = path.extname(new URL(clean).pathname).toLowerCase()
  } catch {}
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'].includes(ext)) return ext

  const type = String(contentType || '').toLowerCase()
  if (type.includes('webp')) return '.webp'
  if (type.includes('png')) return '.png'
  if (type.includes('gif')) return '.gif'
  if (type.includes('avif')) return '.avif'
  return '.jpg'
}

function safeName(url) {
  try {
    const parsed = new URL(String(url).split('#')[0])
    return (
      path
        .basename(parsed.pathname, path.extname(parsed.pathname))
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'image'
    )
  } catch {
    return 'image'
  }
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let index = 0
  async function worker() {
    while (index < items.length) {
      const current = index++
      try {
        results[current] = { ok: true, value: await fn(items[current]) }
      } catch (error) {
        results[current] = { ok: false, error }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

loadEnvLocal()

const supabase = createClient(requiredEnv('NEXT_PUBLIC_SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
})
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${requiredEnv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: requiredEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: requiredEnv('R2_SECRET_ACCESS_KEY'),
  },
})

const publicBase = requiredEnv('R2_PUBLIC_BASE_URL').replace(/\/+$/, '')
const maxUrls = Number(process.env.MAX_URLS || 300)
const concurrency = Number(process.env.CONCURRENCY || 8)
const fetchTimeoutMs = Number(process.env.FETCH_TIMEOUT_MS || 8000)
const minId = Number(process.env.MIN_ID || 0)
const cache = new Map()

async function migrateOne(oldUrl, row) {
  if (cache.has(oldUrl)) return cache.get(oldUrl)

  const hash = oldUrl.includes('#') ? oldUrl.slice(oldUrl.indexOf('#')) : ''
  const fetchUrl = oldUrl.split('#')[0]
  const response = await fetch(fetchUrl, {
    headers: {
      accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.8',
      'user-agent': 'Mozilla/5.0 image-migration-bot/1.0',
    },
    signal: AbortSignal.timeout(fetchTimeoutMs),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const contentType = response.headers.get('content-type') || 'application/octet-stream'
  if (!contentType.toLowerCase().startsWith('image/')) throw new Error(`not image: ${contentType}`)

  const buffer = Buffer.from(await response.arrayBuffer())
  const key = `locations/legacy-imgbb/${new Date().toISOString().slice(0, 10)}/${row.id}-${safeName(oldUrl)}-${crypto.randomUUID()}${extensionFor(oldUrl, contentType)}`
  await s3.send(
    new PutObjectCommand({
      Bucket: requiredEnv('R2_BUCKET_NAME'),
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    })
  )

  const newUrl = `${publicBase}/${key}${hash}`
  cache.set(oldUrl, newUrl)
  return newUrl
}

const stats = { minId, rowsScanned: 0, rowsMatched: 0, urlsSelected: 0, migrated: 0, updatedRows: 0, failed: 0, failures: [] }
const { data, error } = await supabase
  .from('locations')
  .select('id,name,image_url,images')
  .gte('id', minId)
  .order('id', { ascending: true })

if (error) throw error

let selectedTotal = 0
for (const row of data) {
  stats.rowsScanned++
  const urls = Array.from(new Set([...collectImgBBUrls(row.image_url), ...collectImgBBUrls(row.images)]))
  if (!urls.length) continue

  stats.rowsMatched++
  const selected = urls.slice(0, Math.max(0, maxUrls - selectedTotal))
  if (!selected.length) break

  selectedTotal += selected.length
  stats.urlsSelected += selected.length
  const results = await mapLimit(selected, concurrency, (url) => migrateOne(url, row))
  const replacements = new Map()

  selected.forEach((oldUrl, index) => {
    const result = results[index]
    if (result.ok) {
      replacements.set(oldUrl, result.value)
      stats.migrated++
    } else {
      stats.failed++
      if (stats.failures.length < 50) {
        stats.failures.push({ id: row.id, name: row.name, url: oldUrl, error: result.error.message })
      }
    }
  })

  if (replacements.size) {
    const patch = {
      image_url: replaceUrls(row.image_url, replacements),
      images: replaceUrls(row.images, replacements),
    }
    const { error: updateError } = await supabase.from('locations').update(patch).eq('id', row.id)
    if (updateError) throw updateError
    stats.updatedRows++
    console.log(`[imgbb->r2] updated ${row.id} ${row.name}: ${replacements.size}/${selected.length}`)
  } else {
    console.log(`[imgbb->r2] no reachable images ${row.id} ${row.name}: 0/${selected.length}`)
  }

  if (selectedTotal >= maxUrls) break
}

console.log(JSON.stringify(stats, null, 2))
