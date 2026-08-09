import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const sourcePath = path.join(root, 'public-data', 'locations.json')
const outputDir = path.join(root, 'public-data', 'spots')

function splitDisplayName(value) {
  const display = String(value || '').trim()
  const parts = display.split(' / ').map((part) => part.trim()).filter(Boolean)
  if (parts.length < 2) return { name: display, name_cn: null }
  return /[\u3400-\u9fff]/u.test(parts[0])
    ? { name: parts.slice(1).join(' / '), name_cn: parts[0] }
    : { name: parts[0], name_cn: parts.slice(1).join(' / ') }
}

function spotFromLocation(location) {
  const names = splitDisplayName(location.name)
  const regionNames = splitDisplayName(location.region?.name)
  return {
    id: Number(location.id),
    slug: String(location.slug),
    name: names.name,
    name_cn: names.name_cn,
    category: location.category ?? null,
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
    image_url: location.thumbnail ?? null,
    images: location.thumbnail ? [location.thumbnail] : [],
    description: location.shortSummary ?? null,
    review: null,
    tags: [],
    video_url: null,
    facebook_video_url: null,
    visit_date: null,
    opening_hours: null,
    price_info: null,
    address: null,
    region_id: location.region?.id ?? null,
    regions: location.region ? {
      id: Number(location.region.id),
      name: regionNames.name,
      name_cn: regionNames.name_cn,
      country: location.region.country ?? null,
      code: location.region.code ?? null,
    } : null,
  }
}

async function writeAtomic(filePath, value) {
  const tempPath = `${filePath}.${process.pid}.tmp`
  await writeFile(tempPath, `${JSON.stringify(value)}\n`, 'utf8')
  await rename(tempPath, filePath)
}

const payload = JSON.parse((await readFile(sourcePath, 'utf8')).replace(/^\uFEFF/, ''))
if (payload?.schemaVersion !== 1 || !Array.isArray(payload.locations) || !payload.locations.length) {
  throw new Error('public-data/locations.json is not a valid non-empty schema v1 snapshot.')
}

await mkdir(outputDir, { recursive: true })
const generatedAt = new Date().toISOString()
const source = { type: 'static-lightweight-location-snapshot', generatedAt }
const slugs = []
for (const location of payload.locations) {
  const spot = spotFromLocation(location)
  if (!spot.slug || !Number.isInteger(spot.id) || spot.id <= 0) throw new Error(`Invalid public location: ${JSON.stringify(location)}`)
  slugs.push(spot.slug)
  await writeAtomic(path.join(outputDir, `${spot.slug}.json`), { schemaVersion: 1, source, spot })
}
await writeAtomic(path.join(outputDir, 'index.json'), { schemaVersion: 1, source, slugs })
console.log(JSON.stringify({ generatedAt, spots: slugs.length, outputDir }, null, 2))
