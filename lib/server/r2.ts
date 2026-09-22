import 'server-only'

import { verifyGuidePublication } from '@/lib/guide-publication'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const REQUIRED_R2_ENV = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_PUBLIC_BASE_URL',
] as const

export const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024

let r2Client: S3Client | null = null

export interface R2UploadResult {
  url: string
  publicUrl: string
  key: string
  fileName: string
  provider: 'cloudflare-r2'
}

export interface BuildR2ObjectKeyOptions {
  category?: string | null
  country?: string | null
  city?: string | null
  locationSlug?: string | null
  field?: string | null
  fileName: string
  contentType?: string | null
}

export interface UploadR2ImageOptions extends BuildR2ObjectKeyOptions {
  body: Buffer | Uint8Array
}

export function getMissingR2EnvVars() {
  return REQUIRED_R2_ENV.filter((name) => !process.env[name])
}

export function assertR2Env() {
  const missing = getMissingR2EnvVars()
  if (missing.length) {
    throw new Error(`Missing Cloudflare R2 environment variables: ${missing.join(', ')}`)
  }
}

function getR2Client() {
  assertR2Env()

  if (!r2Client) {
    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    })
  }

  return r2Client
}

export function getR2PublicBaseUrl() {
  assertR2Env()
  return process.env.R2_PUBLIC_BASE_URL!.replace(/\/+$/, '')
}

export function extensionForImage(contentType?: string | null, fileName?: string | null) {
  const ext = path.extname(String(fileName || '')).toLowerCase()
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) return ext

  if (contentType === 'image/jpeg') return '.jpg'
  if (contentType === 'image/png') return '.png'
  if (contentType === 'image/webp') return '.webp'
  if (contentType === 'image/gif') return '.gif'
  return '.jpg'
}

export function normalizeImageContentType(contentType?: string | null) {
  const normalized = String(contentType || 'image/jpeg').split(';')[0].trim().toLowerCase()
  return normalized === 'image/jpg' ? 'image/jpeg' : normalized
}

export function safeFileName(fileName: string, contentType?: string | null) {
  const ext = extensionForImage(contentType, fileName)
  const baseName = path
    .basename(fileName || 'image', path.extname(fileName || ''))
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `${baseName || 'image'}${ext}`
}

export function safeR2PathSegment(value?: string | null, fallback = 'general') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || fallback
}

export function buildR2ObjectKey(options: BuildR2ObjectKeyOptions) {
  const date = new Date().toISOString().slice(0, 10)
  const fileName = safeFileName(options.fileName, options.contentType)
  const uuid = randomUUID()
  const fieldSegment = options.field ? `${safeR2PathSegment(options.field, 'image')}/` : ''

  if (options.category === 'notes') {
    return [
      'notes',
      safeR2PathSegment(options.locationSlug, 'longform-note'),
      fieldSegment ? fieldSegment.slice(0, -1) : null,
      date,
      `${uuid}-${fileName}`,
    ]
      .filter(Boolean)
      .join('/')
  }

  if (options.country || options.city || options.locationSlug || options.category === 'locations') {
    return [
      'locations',
      safeR2PathSegment(options.country),
      safeR2PathSegment(options.city),
      safeR2PathSegment(options.locationSlug, 'uncategorized'),
      fieldSegment ? fieldSegment.slice(0, -1) : null,
      date,
      `${uuid}-${fileName}`,
    ]
      .filter(Boolean)
      .join('/')
  }

  const category = safeR2PathSegment(options.category, 'uploads')
  return `${category}/${fieldSegment}${date}/${uuid}-${fileName}`
}

export async function uploadImageToR2(options: UploadR2ImageOptions): Promise<R2UploadResult> {
  assertR2Env()

  const contentType = normalizeImageContentType(options.contentType)
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new Error(`Unsupported image type: ${contentType}`)
  }

  const bodyLength = options.body.byteLength
  if (bodyLength > MAX_IMAGE_SIZE_BYTES) {
    throw new Error('Image size exceeds 10MB limit.')
  }

  const key = buildR2ObjectKey(options)
  const fileName = key.split('/').pop() || safeFileName(options.fileName, contentType)

  await getR2Client().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      Body: options.body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    })
  )

  const url = `${getR2PublicBaseUrl()}/${key}`

  if (!url.startsWith(`${getR2PublicBaseUrl()}/`)) {
    throw new Error('R2 upload produced an invalid public URL.')
  }

  if (url.includes('supabase.co') || url.includes('/storage/v1/object/public/') || url.includes('location-images')) {
    throw new Error(`R2 upload produced a forbidden Supabase Storage URL: ${url}`)
  }

  return {
    url,
    publicUrl: url,
    key,
    fileName,
    provider: 'cloudflare-r2',
  }
}

export async function uploadPublicDataSnapshot(fileName: 'locations.json' | 'regions.json', body: Buffer | Uint8Array) {
  assertR2Env()
  const key = `public-data/${fileName}`
  await getR2Client().send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
    Body: body,
    ContentType: 'application/json; charset=utf-8',
    CacheControl: 'public, max-age=3600, stale-while-revalidate=86400',
  }))
  return `${getR2PublicBaseUrl()}/${key}`
}

async function uploadPublicJsonObject(key: string, body: Buffer | Uint8Array, cacheControl = 'public, max-age=3600, stale-while-revalidate=86400') {
  assertR2Env()
  await getR2Client().send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
    Body: body,
    ContentType: 'application/json; charset=utf-8',
    CacheControl: cacheControl,
  }))
  return `${getR2PublicBaseUrl()}/${key}`
}

export function uploadPublicSpotSnapshot(slug: string, body: Buffer | Uint8Array) {
  const safeSlug = String(slug || '').trim()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*-\d+$/.test(safeSlug)) throw new Error(`Invalid public spot slug: ${slug}`)
  return uploadPublicJsonObject(`public-data/spots/${safeSlug}.json`, body)
}

export function uploadPublicSpotIndex(body: Buffer | Uint8Array) {
  return uploadPublicJsonObject('public-data/spots/index.json', body)
}

export async function uploadPublicGuidesSnapshot(body: Buffer | Uint8Array) {
  const url = await uploadPublicJsonObject('public-data/guides.json', body, 'no-store, max-age=0')
  await verifyGuidePublication(getR2PublicBaseUrl(), body)
  return url
}

export function uploadPublicGuideTripCostsSnapshot(body: Buffer | Uint8Array) {
  return uploadPublicJsonObject('public-data/guide-trip-costs.json', body)
}

export function uploadPublicNotesSnapshot(body: Buffer | Uint8Array) {
  return uploadPublicJsonObject('public-data/notes.json', body)
}


export interface R2ObjectInfo {
  key: string
  size: number
  lastModified?: string
}

export function r2ObjectKeyFromPublicUrl(value?: string | null) {
  const url = String(value || '').trim()
  if (!url) return null
  const base = getR2PublicBaseUrl()
  if (!url.startsWith(`${base}/`)) return null
  const encodedKey = url.slice(base.length + 1).split('#')[0].split('?')[0]
  if (!encodedKey) return null
  try {
    return decodeURIComponent(encodedKey)
  } catch {
    return encodedKey
  }
}

export function modernNoteR2Prefix(slug: string) {
  return `notes/${safeR2PathSegment(slug, 'longform-note')}/`
}

export function legacyNoteR2Prefix(slug: string) {
  return `locations/general/general/${safeR2PathSegment(slug, 'longform-note')}/`
}

export async function listR2Objects(prefix: string): Promise<R2ObjectInfo[]> {
  assertR2Env()
  const items: R2ObjectInfo[] = []
  let continuationToken: string | undefined

  do {
    const response = await getR2Client().send(new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET_NAME!,
      Prefix: prefix,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    }))
    for (const item of response.Contents || []) {
      if (!item.Key) continue
      items.push({
        key: item.Key,
        size: Number(item.Size || 0),
        lastModified: item.LastModified?.toISOString(),
      })
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
  } while (continuationToken)

  return items
}

export async function deleteR2Objects(keys: string[]) {
  assertR2Env()
  const uniqueKeys = Array.from(new Set(keys.map((key) => String(key || '').trim()).filter(Boolean)))
  let deleted = 0

  for (let index = 0; index < uniqueKeys.length; index += 1000) {
    const batch = uniqueKeys.slice(index, index + 1000)
    if (!batch.length) continue
    const response = await getR2Client().send(new DeleteObjectsCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Delete: {
        Objects: batch.map((Key) => ({ Key })),
        Quiet: true,
      },
    }))
    if (response.Errors?.length) {
      throw new Error(`Cloudflare R2 refused to delete ${response.Errors.length} object(s).`)
    }
    deleted += batch.length
  }

  return deleted
}
