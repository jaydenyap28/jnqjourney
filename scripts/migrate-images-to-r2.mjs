import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_TABLES = ['locations', 'spots']
const DEFAULT_IMAGE_FIELDS = ['image_url', 'images', 'cover_image', 'gallery_images', 'coverImage', 'galleryImages']
const LEGACY_IMAGE_HOST_PATTERN = /(i\.ibb\.co|imgbb\.com|\.supabase\.co\/storage\/v1\/object\/public\/location-images)/i
const URL_PATTERN = /https?:\/\/[^\s"'<>),\]]+/gi

function loadEnvLocal(envPath) {
  if (!fs.existsSync(envPath)) return

  const raw = fs.readFileSync(envPath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue

    const key = trimmed.slice(0, eqIdx).trim()
    let value = trimmed.slice(eqIdx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

function csvEnv(name, fallback) {
  const raw = process.env[name]
  if (!raw) return fallback
  return raw.split(',').map((item) => item.trim()).filter(Boolean)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizePublicBaseUrl(value) {
  return String(value || '').replace(/\/+$/, '')
}

function stripUrlTail(url) {
  return String(url).replace(/[),.;]+$/, '')
}

function getImageUrlsFromString(value) {
  const matches = String(value || '').match(URL_PATTERN) || []
  return matches
    .map(stripUrlTail)
    .filter((url) => LEGACY_IMAGE_HOST_PATTERN.test(url))
}

function collectImageUrls(value, urls = new Set()) {
  if (!value) return urls

  if (typeof value === 'string') {
    for (const url of getImageUrlsFromString(value)) urls.add(url)
    return urls
  }

  if (Array.isArray(value)) {
    for (const item of value) collectImageUrls(item, urls)
    return urls
  }

  if (typeof value === 'object') {
    for (const item of Object.values(value)) collectImageUrls(item, urls)
  }

  return urls
}

function replaceImageUrls(value, urlMap) {
  if (!value) return value

  if (typeof value === 'string') {
    let next = value
    for (const [oldUrl, newUrl] of urlMap.entries()) {
      next = next.split(oldUrl).join(newUrl)
    }
    return next
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceImageUrls(item, urlMap))
  }

  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceImageUrls(item, urlMap)]))
  }

  return value
}

function inferExtension(url, contentType) {
  const pathname = (() => {
    try {
      return new URL(url).pathname
    } catch {
      return ''
    }
  })()

  const fromUrl = path.extname(pathname).toLowerCase()
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'].includes(fromUrl)) return fromUrl

  const type = String(contentType || '').toLowerCase()
  if (type.includes('webp')) return '.webp'
  if (type.includes('png')) return '.png'
  if (type.includes('gif')) return '.gif'
  if (type.includes('avif')) return '.avif'
  return '.jpg'
}

function buildObjectKey({ table, row, url, contentType }) {
  const ext = inferExtension(url, contentType)
  const date = new Date().toISOString().slice(0, 10)
  const sourceName = (() => {
    try {
      return path.basename(new URL(url).pathname, path.extname(new URL(url).pathname))
    } catch {
      return 'image'
    }
  })()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'image'

  const rowId = String(row.id || 'row').replace(/[^a-zA-Z0-9_-]/g, '-')
  const unique = crypto.randomUUID()
  return `${table}/${date}/${rowId}-${sourceName}-${unique}${ext}`
}

async function fetchImageBuffer(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.8',
      'user-agent': 'Mozilla/5.0 image-migration-bot/1.0',
    },
  })

  if (!response.ok) {
    throw new Error(`download failed: HTTP ${response.status}`)
  }

  const contentType = response.headers.get('content-type') || 'application/octet-stream'
  if (!contentType.toLowerCase().startsWith('image/')) {
    throw new Error(`download did not return an image: ${contentType}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType,
  }
}

async function fetchAllRows(supabase, table, pageSize) {
  const rows = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) {
      if (/Could not find the table|does not exist|schema cache/i.test(error.message || '')) {
        console.warn(`[跳过] 表 ${table} 不存在或不可访问: ${error.message}`)
        return []
      }
      throw error
    }

    if (!data?.length) break
    rows.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }

  return rows
}

function getDisplayName(row) {
  return row.name_cn || row.title_cn || row.name || row.title || `#${row.id}`
}

async function main() {
  loadEnvLocal(path.join(process.cwd(), '.env.local'))

  const apply = process.argv.includes('--apply')
  const supabaseUrl = requiredEnv('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  const bucket = requiredEnv('R2_BUCKET_NAME')
  const accountId = requiredEnv('R2_ACCOUNT_ID')
  const publicBaseUrl = normalizePublicBaseUrl(requiredEnv('R2_PUBLIC_BASE_URL'))
  const delayMs = Number(process.env.MIGRATE_IMAGE_DELAY_MS || 500)
  const pageSize = Number(process.env.MIGRATE_IMAGE_PAGE_SIZE || 500)
  const tables = csvEnv('MIGRATE_IMAGE_TABLES', DEFAULT_TABLES)
  const imageFields = csvEnv('MIGRATE_IMAGE_FIELDS', DEFAULT_IMAGE_FIELDS)

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requiredEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnv('R2_SECRET_ACCESS_KEY'),
    },
  })

  const migratedUrlCache = new Map()
  const stats = { scanned: 0, matchedRows: 0, migratedImages: 0, updatedRows: 0, failedImages: 0, failedRows: 0 }

  console.log(apply ? '[模式] APPLY: 会上传 R2 并更新 Supabase' : '[模式] DRY RUN: 只预览，不上传、不改库；确认后加 --apply')
  console.log(`[配置] tables=${tables.join(', ')} fields=${imageFields.join(', ')} delay=${delayMs}ms bucket=${bucket}`)

  for (const table of tables) {
    const rows = await fetchAllRows(supabase, table, pageSize)
    console.log(`[扫描] ${table}: ${rows.length} rows`)

    for (const row of rows) {
      stats.scanned += 1

      const fieldUrls = new Set()
      for (const field of imageFields) {
        if (Object.prototype.hasOwnProperty.call(row, field)) {
          collectImageUrls(row[field], fieldUrls)
        }
      }

      if (fieldUrls.size === 0) continue
      stats.matchedRows += 1

      const rowUrlMap = new Map()
      const displayName = getDisplayName(row)

      for (const oldUrl of fieldUrls) {
        try {
          if (migratedUrlCache.has(oldUrl)) {
            rowUrlMap.set(oldUrl, migratedUrlCache.get(oldUrl))
            continue
          }

          if (!apply) {
            const previewUrl = `${publicBaseUrl}/preview/${crypto.randomUUID()}${inferExtension(oldUrl)}`
            rowUrlMap.set(oldUrl, previewUrl)
            console.log(`[预览] ${table} ${displayName}: ${oldUrl} -> ${previewUrl}`)
            continue
          }

          const { buffer, contentType } = await fetchImageBuffer(oldUrl)
          const key = buildObjectKey({ table, row, url: oldUrl, contentType })

          await s3.send(new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: buffer,
            ContentType: contentType,
            CacheControl: 'public, max-age=31536000, immutable',
          }))

          const newUrl = `${publicBaseUrl}/${key}`
          migratedUrlCache.set(oldUrl, newUrl)
          rowUrlMap.set(oldUrl, newUrl)
          stats.migratedImages += 1
          console.log(`[成功] ${table} ${displayName}: ${oldUrl} -> ${newUrl}`)
        } catch (error) {
          stats.failedImages += 1
          console.error(`[失败] ${table} ${displayName}: ${oldUrl} (${error?.message || error})`)
        } finally {
          await sleep(delayMs)
        }
      }

      if (rowUrlMap.size === 0) continue

      const patch = {}
      for (const field of imageFields) {
        if (!Object.prototype.hasOwnProperty.call(row, field)) continue
        const nextValue = replaceImageUrls(row[field], rowUrlMap)
        if (JSON.stringify(nextValue) !== JSON.stringify(row[field])) {
          patch[field] = nextValue
        }
      }

      if (Object.keys(patch).length === 0 || !apply) continue

      const { error } = await supabase.from(table).update(patch).eq('id', row.id)
      if (error) {
        stats.failedRows += 1
        console.error(`[更新失败] ${table} ${displayName}: ${error.message}`)
      } else {
        stats.updatedRows += 1
        console.log(`[已更新] ${table} ${displayName}: ${Object.keys(patch).join(', ')}`)
      }
    }
  }

  console.log('[完成]', JSON.stringify(stats, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
