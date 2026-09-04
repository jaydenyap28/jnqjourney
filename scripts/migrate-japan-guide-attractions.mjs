import { createHash } from 'node:crypto'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'
import envPackage from '@next/env'

import { migrateLegacyGuideAttractionsUnique } from '../lib/guide-legacy-migration.ts'
import { JAPAN_GUIDE_ATTRACTION_CONTRACT, JAPAN_GUIDE_SLUG } from '../lib/japan-guide-attractions.ts'

envPackage.loadEnvConfig(process.cwd())

const STORAGE_PATH = '_system/guides.webp'
const LATEST_POINTER_PATH = '_system/guides-latest.webp'
const VERSIONED_DIR = '_system/guides'

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function semanticGuide(guide) {
  return {
    ...guide,
    days: (guide.days || []).map((day) => {
      const { attractions, linkedSpots, ...rest } = day
      return {
        ...rest,
        spotReferences: Array.isArray(attractions)
          ? attractions.slice().sort((left, right) => left.displayOrder - right.displayOrder).map((item) => item.displayName)
          : linkedSpots || [],
      }
    }),
  }
}

function validateJapanMigration(beforeGuide, afterGuide, locations) {
  if ((beforeGuide.days || []).length !== 10) throw new Error('Japan Guide must contain exactly 10 days')
  const beforeRefs = beforeGuide.days.flatMap((day) => day.linkedSpots || [])
  if (beforeRefs.length !== 32) throw new Error(`Expected 32 legacy refs, received ${beforeRefs.length}`)

  const exactDiff = beforeGuide.days.map((day, dayIndex) => {
    const attractions = migrateLegacyGuideAttractionsUnique(day, locations)
    const expected = JAPAN_GUIDE_ATTRACTION_CONTRACT[dayIndex]
    const actual = attractions.map((item) => [item.displayName, item.spotId, item.spotSlug])
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Japan Day ${dayIndex + 1} canonical attraction contract failed`)
    }
    const ids = attractions.map((item) => item.spotId)
    if (new Set(ids).size !== ids.length) throw new Error(`Japan Day ${dayIndex + 1} contains duplicate Spot IDs`)
    return {
      day: dayIndex + 1,
      before: { linkedSpots: day.linkedSpots || [], attractions: day.attractions ?? null },
      after: { linkedSpots: [], attractions },
    }
  })

  const afterRefs = afterGuide.days.flatMap((day) => day.attractions || [])
  const missingIds = afterRefs.filter((item) => !item.spotId || !item.spotSlug)
  const linkedSpotsRemaining = afterGuide.days.reduce((total, day) => total + (day.linkedSpots || []).length, 0)
  const beforeSemanticHash = sha256(JSON.stringify(semanticGuide(beforeGuide)))
  const afterSemanticHash = sha256(JSON.stringify(semanticGuide(afterGuide)))
  if (missingIds.length) throw new Error(`Japan migration left ${missingIds.length} refs without stable IDs`)
  if (linkedSpotsRemaining) throw new Error(`Japan migration left ${linkedSpotsRemaining} legacy linkedSpots`)
  if (beforeSemanticHash !== afterSemanticHash) throw new Error('Japan migration changed semantic itinerary content')

  return {
    exactDiff,
    validation: {
      days: afterGuide.days.length,
      beforeRefs: beforeRefs.length,
      afterAttractions: afterRefs.length,
      missingIds: missingIds.length,
      duplicateIdsWithinDay: 0,
      ambiguous: 0,
      unresolved: 0,
      linkedSpotsRemaining,
      beforeSemanticHash,
      afterSemanticHash,
      semanticItineraryChanges: 0,
    },
  }
}

const apply = process.argv.includes('--apply')
const supabase = createClient(required('NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})
const bucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'location-images'

const pointerResult = await supabase.storage.from(bucket).download(LATEST_POINTER_PATH)
if (pointerResult.error || !pointerResult.data) throw new Error(pointerResult.error?.message || 'Guide latest pointer is unavailable')
const previousVersionPath = String(await pointerResult.data.text()).trim()
const guideResult = await supabase.storage.from(bucket).download(previousVersionPath)
if (guideResult.error || !guideResult.data) throw new Error(guideResult.error?.message || `Unable to download ${previousVersionPath}`)
const previousBuffer = Buffer.from(await guideResult.data.arrayBuffer())
const guides = JSON.parse(previousBuffer.toString('utf8').replace(/^\uFEFF/, ''))
if (!Array.isArray(guides) || guides.length !== 6) throw new Error(`Expected 6 authoritative Guides, received ${Array.isArray(guides) ? guides.length : 'invalid data'}`)

const locationResult = await supabase
  .from('locations')
  .select('id,name,name_cn,status')
  .eq('status', 'active')
  .order('id')
  .range(0, 999)
if (locationResult.error) throw new Error(locationResult.error.message)
const locations = locationResult.data || []

const guideIndex = guides.findIndex((guide) => guide?.slug === JAPAN_GUIDE_SLUG)
if (guideIndex < 0) throw new Error(`Missing ${JAPAN_GUIDE_SLUG}`)
const beforeGuide = guides[guideIndex]
if (beforeGuide.days.some((day) => Array.isArray(day.attractions))) {
  throw new Error('Japan Guide already contains canonical attraction arrays; refusing to remigrate')
}
const afterGuide = {
  ...beforeGuide,
  days: beforeGuide.days.map((day) => ({
    ...day,
    attractions: migrateLegacyGuideAttractionsUnique(day, locations),
    linkedSpots: [],
  })),
}
const { exactDiff, validation } = validateJapanMigration(beforeGuide, afterGuide, locations)
const nextGuides = guides.map((guide, index) => index === guideIndex ? afterGuide : guide)
const unchangedGuideHashes = guides
  .filter((_, index) => index !== guideIndex)
  .map((guide) => ({
    slug: guide.slug,
    before: sha256(JSON.stringify(guide)),
    after: sha256(JSON.stringify(nextGuides.find((item) => item.slug === guide.slug))),
  }))
if (unchangedGuideHashes.some((item) => item.before !== item.after)) throw new Error('Migration changed another Guide')

const nextAuthoritativeBuffer = Buffer.from(`${JSON.stringify(nextGuides, null, 2)}\n`, 'utf8')
const generatedAt = new Date().toISOString()
const publicSnapshotBuffer = Buffer.from(JSON.stringify({ schemaVersion: 1, generatedAt, guides: nextGuides }), 'utf8')
const summary = {
  apply,
  slug: JAPAN_GUIDE_SLUG,
  backup: {
    authoritativeVersion: previousVersionPath,
    bytes: previousBuffer.length,
    sha256: sha256(previousBuffer),
  },
  validation,
  exactDiff,
  unchangedGuideHashes,
  next: {
    authoritativeBytes: nextAuthoritativeBuffer.length,
    authoritativeSha256: sha256(nextAuthoritativeBuffer),
    r2SnapshotBytes: publicSnapshotBuffer.length,
    r2SnapshotSha256: sha256(publicSnapshotBuffer),
    generatedAt,
  },
}

if (!apply) {
  console.log(JSON.stringify(summary, null, 2))
  process.exit(0)
}

const versionedPath = `${VERSIONED_DIR}/${Date.now()}.webp`
const versionResult = await supabase.storage.from(bucket).upload(versionedPath, nextAuthoritativeBuffer, {
  upsert: false,
  contentType: 'image/webp',
  cacheControl: '0',
})
if (versionResult.error) throw new Error(versionResult.error.message)

const pointerUpload = await supabase.storage.from(bucket).upload(LATEST_POINTER_PATH, Buffer.from(versionedPath, 'utf8'), {
  upsert: true,
  contentType: 'image/webp',
  cacheControl: '0',
})
if (pointerUpload.error) throw new Error(pointerUpload.error.message)

const currentUpload = await supabase.storage.from(bucket).upload(STORAGE_PATH, nextAuthoritativeBuffer, {
  upsert: true,
  contentType: 'image/webp',
  cacheControl: '0',
})
if (currentUpload.error) throw new Error(currentUpload.error.message)

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${required('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: required('R2_ACCESS_KEY_ID'),
    secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
  },
})
await r2.send(new PutObjectCommand({
  Bucket: required('R2_BUCKET_NAME'),
  Key: 'public-data/guides.json',
  Body: publicSnapshotBuffer,
  ContentType: 'application/json; charset=utf-8',
  CacheControl: 'public, max-age=3600, stale-while-revalidate=86400',
}))

console.log(JSON.stringify({ ...summary, written: { versionedPath, latestPointer: LATEST_POINTER_PATH, currentPath: STORAGE_PATH, r2Key: 'public-data/guides.json' } }, null, 2))
