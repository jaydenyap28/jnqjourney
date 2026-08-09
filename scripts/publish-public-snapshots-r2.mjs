import fs from 'node:fs'
import path from 'node:path'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

function loadEnvLocal() {
  const filePath = path.join(process.cwd(), '.env.local')
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

function required(name) {
  if (!process.env[name]) throw new Error(`Missing ${name}`)
  return process.env[name]
}

async function currentProductionContent() {
  const base = 'https://www.jnqjourney.com'
  const guideList = await (await fetch(`${base}/api/guides`)).json()
  const guides = await Promise.all((guideList.guides || []).map(async (guide) => {
    const response = await fetch(`${base}/api/guides?slug=${encodeURIComponent(guide.slug)}`)
    if (!response.ok) throw new Error(`Production Guide ${guide.slug} returned ${response.status}`)
    return (await response.json()).guide
  }))
  const notesResponse = await fetch(`${base}/api/notes`)
  if (!notesResponse.ok) throw new Error(`Production notes returned ${notesResponse.status}`)
  const notes = (await notesResponse.json()).notes || []
  if (guides.length !== 6) throw new Error(`Expected 6 Production Guides, received ${guides.length}`)
  return { guides, notes }
}

loadEnvLocal()
const root = process.cwd()
const apply = process.argv.includes('--apply')
const { guides, notes } = await currentProductionContent()
const files = [
  ['public-data/locations.json', fs.readFileSync(path.join(root, 'public-data', 'locations.json'))],
  ['public-data/regions.json', fs.readFileSync(path.join(root, 'public-data', 'regions.json'))],
  ['public-data/guides.json', Buffer.from(JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), guides }))],
  ['public-data/notes.json', Buffer.from(JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), notes }))],
]
const spotDir = path.join(root, 'public-data', 'spots')
for (const name of fs.readdirSync(spotDir).filter((value) => value.endsWith('.json'))) {
  files.push([`public-data/spots/${name}`, fs.readFileSync(path.join(spotDir, name))])
}

const summary = {
  apply,
  objects: files.length,
  bytes: files.reduce((total, [, body]) => total + body.length, 0),
  guides: guides.length,
  notes: notes.length,
  spots: files.filter(([key]) => key.startsWith('public-data/spots/') && !key.endsWith('/index.json')).length,
}
if (!apply) {
  console.log(JSON.stringify(summary, null, 2))
  process.exit(0)
}

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${required('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: required('R2_ACCESS_KEY_ID'), secretAccessKey: required('R2_SECRET_ACCESS_KEY') },
})
let cursor = 0
await Promise.all(Array.from({ length: 10 }, async () => {
  while (cursor < files.length) {
    const index = cursor++
    const [key, body] = files[index]
    await client.send(new PutObjectCommand({
      Bucket: required('R2_BUCKET_NAME'),
      Key: key,
      Body: body,
      ContentType: 'application/json; charset=utf-8',
      CacheControl: 'public, max-age=3600, stale-while-revalidate=86400',
    }))
  }
}))
console.log(JSON.stringify({ ...summary, uploaded: files.length }, null, 2))
