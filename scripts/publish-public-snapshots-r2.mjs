import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import {
  fetchProductionNoteDetails,
  replaceSingleNote,
  validateNoteSnapshot,
} from './lib/public-note-snapshot.mjs'

const PRODUCTION_BASE = 'https://www.jnqjourney.com'
const TURTLE_NOTE_SLUG = 'malaysia-turtle-night-terengganu'
const TURTLE_NOTE_BLOCKS = 84
const TURTLE_NOTE_CONTENT_SHA256 = '4130a73fb6e5b9da5e9441d8a4bd8521f5fc2baa4011b37891eac703c4044e7d'

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

async function fetchJson(url, label) {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`${label} returned ${response.status}`)
  return response.json()
}

async function currentProductionContent() {
  const guideList = await fetchJson(`${PRODUCTION_BASE}/api/guides`, 'Production Guides')
  const guides = await Promise.all((guideList.guides || []).map(async (guide) => {
    const response = await fetch(`${PRODUCTION_BASE}/api/guides?slug=${encodeURIComponent(guide.slug)}`, { cache: 'no-store' })
    if (!response.ok) throw new Error(`Production Guide ${guide.slug} returned ${response.status}`)
    return (await response.json()).guide
  }))
  const notes = await fetchProductionNoteDetails(PRODUCTION_BASE)
  if (guides.length !== 6) throw new Error(`Expected 6 Production Guides, received ${guides.length}`)
  return { guides, notes }
}

function argument(name) {
  const prefix = `--${name}=`
  const value = process.argv.find((item) => item.startsWith(prefix))
  return value ? value.slice(prefix.length) : ''
}

async function currentPublicNotes() {
  const publicBase = String(process.env.PUBLIC_DATA_CDN_BASE_URL || process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '')
  if (!publicBase) throw new Error('Missing PUBLIC_DATA_CDN_BASE_URL or R2_PUBLIC_BASE_URL')
  const payload = await fetchJson(`${publicBase}/public-data/notes.json?recovery-audit=${Date.now()}`, 'Current public Note snapshot')
  if (payload?.schemaVersion !== 1 || !Array.isArray(payload.notes)) throw new Error('Current public Note snapshot has an invalid schema')
  return payload
}

loadEnvLocal()
const root = process.cwd()
const apply = process.argv.includes('--apply')
const targetSlug = argument('note-slug')
const noteSource = argument('note-source')
const notesOnly = process.argv.includes('--notes-only')
const existingSnapshot = await currentPublicNotes()
let guides = []
let notes = []
let files = []
let noteChanges = []

if (targetSlug) {
  if (!notesOnly) throw new Error('A targeted Note recovery requires --notes-only')
  if (!noteSource) throw new Error('A targeted Note recovery requires --note-source=<complete JSON file>')
  const sourceNotes = JSON.parse(fs.readFileSync(path.resolve(root, noteSource), 'utf8'))
  const replacement = sourceNotes.find((note) => note.slug === targetSlug)
  if (!replacement) throw new Error(`Target Note ${targetSlug} is missing from ${noteSource}`)
  const expectedBySlug = targetSlug === TURTLE_NOTE_SLUG
    ? { [targetSlug]: { blocks: TURTLE_NOTE_BLOCKS, contentSha256: TURTLE_NOTE_CONTENT_SHA256 } }
    : {}
  notes = replaceSingleNote(existingSnapshot.notes, replacement)
  noteChanges = validateNoteSnapshot(notes, existingSnapshot.notes, expectedBySlug)
  const untouchedBefore = existingSnapshot.notes.filter((note) => note.slug !== targetSlug)
  const untouchedAfter = notes.filter((note) => note.slug !== targetSlug)
  if (JSON.stringify(untouchedBefore) !== JSON.stringify(untouchedAfter)) throw new Error('Targeted recovery changed another Note')
  files = [['public-data/notes.json', Buffer.from(JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), notes }))]]
} else {
  const production = await currentProductionContent()
  guides = production.guides
  notes = production.notes
  noteChanges = validateNoteSnapshot(notes, existingSnapshot.notes)
  files = [
    ['public-data/locations.json', fs.readFileSync(path.join(root, 'public-data', 'locations.json'))],
    ['public-data/regions.json', fs.readFileSync(path.join(root, 'public-data', 'regions.json'))],
    ['public-data/guides.json', Buffer.from(JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), guides }))],
    ['public-data/notes.json', Buffer.from(JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), notes }))],
  ]
  const spotDir = path.join(root, 'public-data', 'spots')
  for (const name of fs.readdirSync(spotDir).filter((value) => value.endsWith('.json'))) {
    files.push([`public-data/spots/${name}`, fs.readFileSync(path.join(spotDir, name))])
  }
}

const summary = {
  apply,
  objects: files.length,
  bytes: files.reduce((total, [, body]) => total + body.length, 0),
  guides: guides.length,
  notes: notes.length,
  spots: files.filter(([key]) => key.startsWith('public-data/spots/') && !key.endsWith('/index.json')).length,
  noteChanges,
  objectSha256: Object.fromEntries(files.map(([key, body]) => [key, createHash('sha256').update(body).digest('hex')])),
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
