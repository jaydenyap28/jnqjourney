import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'

function loadEnvFile(filePath) {
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*([^#=]+)=(.*)$/))
      .filter(Boolean)
      .map((match) => [match[1].trim(), match[2].trim().replace(/^['"]|['"]$/g, '')])
  )
}

const env = { ...loadEnvFile('.env.local'), ...process.env }
const required = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_BASE_URL']
const missing = required.filter((name) => !env[name])
if (missing.length) throw new Error(`Missing configuration: ${missing.join(', ')}`)

const posters = [
  { slug: 'tioman-aman-resort-3d2n', file: 'Pulau Tioman - Aman.png', alt: 'Aman Tioman Resort 2026 3D2N snorkeling package poster', caption: 'Aman Tioman Resort 2026 package poster' },
  { slug: 'tioman-paya-beach-resort-3d2n', file: 'Pulau Tioman - Paya Resort.png', alt: 'Paya Beach Resort 2026 3D2N snorkeling package poster', caption: 'Paya Beach Resort 2026 package poster' },
  { slug: 'tioman-barat-resort-3d2n', file: 'Pulau Tioman - The Barat.png', alt: 'The Barat Tioman 2026 3D2N snorkeling package poster', caption: 'The Barat Tioman 2026 package poster' },
]

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
})
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const publicBaseUrl = env.R2_PUBLIC_BASE_URL.replace(/\/+$/, '')
const date = new Date().toISOString().slice(0, 10)
const output = []

for (const poster of posters) {
  const sourcePath = path.resolve(poster.file)
  const body = fs.readFileSync(sourcePath)
  if (body.length > 10 * 1024 * 1024) throw new Error(`${poster.file} exceeds the 10MB image limit.`)
  if (body.subarray(0, 8).compare(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) !== 0) throw new Error(`${poster.file} is not a PNG file.`)

  const { data: packageRow, error: packageError } = await supabase
    .from('travel_packages')
    .select('id,status,gallery')
    .eq('slug', poster.slug)
    .single()
  if (packageError) throw new Error(`${poster.slug}: ${packageError.message}`)
  if (packageRow.status !== 'draft') throw new Error(`${poster.slug} must remain a draft while uploading its poster.`)

  const fileName = path.basename(poster.file).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9._-]/g, '')
  const key = `packages/malaysia/pulau-tioman/${poster.slug}/gallery/${date}/${randomUUID()}-${fileName}`
  await client.send(new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: 'image/png',
    CacheControl: 'public, max-age=31536000, immutable',
  }))

  const url = `${publicBaseUrl}/${key}`
  const response = await fetch(url, { method: 'HEAD' })
  if (!response.ok) throw new Error(`${poster.slug}: R2 public URL check failed with ${response.status}.`)

  const previousGallery = Array.isArray(packageRow.gallery) ? packageRow.gallery : []
  const gallery = [
    { url, alt: poster.alt, caption: poster.caption, sort_order: 0 },
    ...previousGallery.filter((item) => item && typeof item === 'object' && item.url !== url),
  ]
  const { error: updateError } = await supabase.from('travel_packages').update({ gallery }).eq('id', packageRow.id)
  if (updateError) throw new Error(`${poster.slug}: ${updateError.message}`)

  output.push({ slug: poster.slug, status: packageRow.status, url, galleryCount: gallery.length })
}

console.log(JSON.stringify(output, null, 2))
