import fs from 'node:fs'
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'

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

function isOptimizableKey(key) {
  return /\.(png|jpe?g|avif)$/i.test(key)
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

async function streamToBuffer(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let index = 0
  async function worker() {
    while (index < items.length) {
      const current = index++
      try {
        results[current] = { ok: true, value: await fn(items[current], current) }
      } catch (error) {
        results[current] = { ok: false, error }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

loadEnvLocal()

const bucket = requiredEnv('R2_BUCKET_NAME')
const minSizeBytes = Number(process.env.MIN_SIZE_BYTES || 2 * 1024 * 1024)
const maxObjects = Number(process.env.MAX_OBJECTS || 1000)
const concurrency = Number(process.env.CONCURRENCY || 4)
const maxDimension = Number(process.env.MAX_DIMENSION || 1600)
const quality = Number(process.env.WEBP_QUALITY || 76)
const dryRun = process.argv.includes('--dry-run')

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${requiredEnv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: requiredEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: requiredEnv('R2_SECRET_ACCESS_KEY'),
  },
})

async function listCandidates() {
  const objects = []
  let token
  do {
    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: token,
        MaxKeys: 1000,
      })
    )
    for (const object of response.Contents || []) {
      const size = object.Size || 0
      if (object.Key && size >= minSizeBytes && isOptimizableKey(object.Key)) {
        objects.push({ key: object.Key, size })
      }
    }
    token = response.NextContinuationToken
  } while (token)

  return objects.sort((left, right) => right.size - left.size).slice(0, maxObjects)
}

async function optimizeObject(object) {
  const original = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: object.key }))
  const input = await streamToBuffer(original.Body)
  const output = await sharp(input, { animated: false })
    .rotate()
    .resize({
      width: maxDimension,
      height: maxDimension,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality, effort: 4 })
    .toBuffer()

  if (output.length >= object.size * 0.9) {
    return { key: object.key, originalSize: object.size, outputSize: output.length, skipped: true }
  }

  if (!dryRun) {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: object.key,
        Body: output,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      })
    )
  }

  return { key: object.key, originalSize: object.size, outputSize: output.length, skipped: false }
}

const candidates = await listCandidates()
console.log(
  JSON.stringify(
    {
      mode: dryRun ? 'dry-run' : 'apply',
      candidates: candidates.length,
      candidateBytes: candidates.reduce((sum, object) => sum + object.size, 0),
      candidateSize: formatBytes(candidates.reduce((sum, object) => sum + object.size, 0)),
      minSize: formatBytes(minSizeBytes),
      maxObjects,
      concurrency,
      maxDimension,
      quality,
    },
    null,
    2
  )
)

const stats = { optimized: 0, skipped: 0, failed: 0, originalBytes: 0, outputBytes: 0, failures: [] }
const results = await mapLimit(candidates, concurrency, optimizeObject)

for (const result of results) {
  if (!result.ok) {
    stats.failed += 1
    if (stats.failures.length < 30) stats.failures.push(result.error.message)
    continue
  }

  const item = result.value
  stats.originalBytes += item.originalSize
  stats.outputBytes += item.outputSize
  if (item.skipped) {
    stats.skipped += 1
  } else {
    stats.optimized += 1
    console.log(`[optimized] ${formatBytes(item.originalSize)} -> ${formatBytes(item.outputSize)} ${item.key}`)
  }
}

console.log(
  JSON.stringify(
    {
      ...stats,
      originalSize: formatBytes(stats.originalBytes),
      outputSize: formatBytes(stats.outputBytes),
      savedSize: formatBytes(Math.max(0, stats.originalBytes - stats.outputBytes)),
    },
    null,
    2
  )
)
