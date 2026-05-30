import 'server-only'

import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

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

function safePathSegment(value?: string | null, fallback = 'general') {
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
  const fieldSegment = options.field ? `${safePathSegment(options.field, 'image')}/` : ''

  if (options.country || options.city || options.locationSlug || options.category === 'locations') {
    return [
      'locations',
      safePathSegment(options.country),
      safePathSegment(options.city),
      safePathSegment(options.locationSlug, 'uncategorized'),
      fieldSegment ? fieldSegment.slice(0, -1) : null,
      date,
      `${uuid}-${fileName}`,
    ]
      .filter(Boolean)
      .join('/')
  }

  const category = safePathSegment(options.category, 'uploads')
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
