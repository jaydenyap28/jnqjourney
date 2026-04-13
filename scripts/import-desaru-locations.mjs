import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const ROOT = process.cwd()
const ENV_PATH = path.join(ROOT, '.env.local')

function parseEnvFile(content) {
  const result = {}

  for (const rawLine of String(content || '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) continue
    const key = line.slice(0, separatorIndex).trim()
    let value = line.slice(separatorIndex + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    result[key] = value
  }

  return result
}

async function loadEnv() {
  const raw = await fs.readFile(ENV_PATH, 'utf8')
  return parseEnvFile(raw)
}

const VIDEO_URL = 'https://youtu.be/PuW40vC_hu0'
const VISIT_DATE = '2024-11-15'

const ITEMS = [
  { name: 'Bamboo Walk @Sebana Woods', category: 'attraction', mapsUrl: 'https://maps.app.goo.gl/LUyKvaCehLnnyzyp7' },
  { name: '枯湖老树', name_cn: '枯湖老树', category: 'attraction', mapsUrl: 'https://maps.app.goo.gl/FxB8G28isusaA9MQ6' },
  { name: 'Temple Village Taman Bayu Damai', name_cn: '六湾神庙村', category: 'attraction', mapsUrl: 'https://maps.app.goo.gl/5Y4ekhMiBppc2czX8' },
  { name: 'Yard & Co', category: 'food', mapsUrl: 'https://maps.app.goo.gl/yuXaNy1QpVYpHKqd8' },
  { name: '山福寺 旧码头附近的停车处', name_cn: '山福寺旧码头停车处', category: 'attraction', mapsUrl: 'https://maps.app.goo.gl/kbzgQ7JiLXdASz7J9', opening_hours: 'Open 24 hours' },
  { name: 'Jomis Old Jetty', category: 'attraction', mapsUrl: 'https://maps.app.goo.gl/is79w68gSHhNQQoG6', opening_hours: 'Open 24 hours' },
  { name: 'Punggai Bayu Impian Campsite', category: 'accommodation', mapsUrl: 'https://maps.app.goo.gl/hrnjyjk7G74AcD739', opening_hours: 'Open 24 hours' },
  { name: 'Desaru Public Beach', category: 'attraction', mapsUrl: 'https://maps.app.goo.gl/o9PJ1xHA6yqfHMN68', opening_hours: 'Open 24 hours' },
  { name: 'Pantai Batu Layar', category: 'attraction', mapsUrl: 'https://maps.app.goo.gl/KpZKzhxRBFVrvJA9A', opening_hours: 'Open 24 hours' },
  { name: 'Pantai Tanjung Balau', category: 'attraction', mapsUrl: 'https://maps.app.goo.gl/Ef64qroki3mjY5Sv8', opening_hours: 'Open 24 hours' },
  { name: 'Pantai Tanjung Buluh, Sedili Kechil', category: 'attraction', mapsUrl: 'https://maps.app.goo.gl/D2w84bEzqncxxmVw5', opening_hours: 'Open 24 hours' },
  { name: 'Jason Bay Public Beach', category: 'attraction', mapsUrl: 'https://maps.app.goo.gl/ke4SCcWaPSErZnyk9', opening_hours: 'Open 24 hours' },
  { name: 'Pantai Manis Tanjung Sedili', category: 'attraction', mapsUrl: 'https://maps.app.goo.gl/kRCpffDCxjkbuZ6v8', opening_hours: 'Open 24 hours' },
  { name: 'Jeti ke Sedili Besar', category: 'attraction', mapsUrl: 'https://maps.app.goo.gl/KB1tBth1ksUZkD148', opening_hours: 'Open 24 hours' },
]

function fallbackAddress(item, region) {
  return [item.name_cn || item.name, region?.name_cn || region?.name, 'Johor', 'Malaysia']
    .filter(Boolean)
    .join(', ')
}

function normalizeTags(item) {
  const tags = new Set(['Johor', 'Desaru'])
  if (item.category === 'food') tags.add('美食')
  if (item.category === 'accommodation') tags.add('住宿')
  if (item.name.toLowerCase().includes('beach') || item.name.includes('Pantai')) tags.add('海边')
  if (item.name.toLowerCase().includes('jetty') || item.name.includes('Jeti')) tags.add('码头')
  if (item.name.toLowerCase().includes('temple') || item.name.includes('寺')) tags.add('寺庙')
  return [...tags]
}

function parseGoogleMapsUrl(finalUrl) {
  const decoded = decodeURIComponent(finalUrl)
  const coordsFromBang = decoded.match(/!8m2!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
  const coordsFromAt = decoded.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  const coordsMatch = coordsFromBang || coordsFromAt
  if (!coordsMatch) return null

  const latitude = Number(coordsMatch[1])
  const longitude = Number(coordsMatch[2])
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null

  const placeMatch = decoded.match(/\/maps\/place\/([^/@?]+)/)
  const placeName = placeMatch ? placeMatch[1].replace(/\+/g, ' ').trim() : ''

  return {
    latitude,
    longitude,
    address: placeName || null,
  }
}

async function resolveGoogleMaps(item) {
  const response = await fetch(item.mapsUrl, { redirect: 'follow' })
  const finalUrl = response.url
  if (!finalUrl) return null
  return parseGoogleMapsUrl(finalUrl)
}

async function main() {
  const env = await loadEnv()
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  const { data: regions, error: regionError } = await supabase
    .from('regions')
    .select('id,name,name_cn,country')
    .eq('country', 'Malaysia')

  if (regionError) throw regionError

  let desaruRegion =
    (regions || []).find((region) => String(region.name || '').toLowerCase() === 'desaru') ||
    (regions || []).find((region) => String(region.name_cn || '') === '迪沙鲁')

  const johorRegion =
    (regions || []).find((region) => String(region.name || '').toLowerCase() === 'johor') ||
    (regions || []).find((region) => String(region.name_cn || '') === '柔佛')

  if (!desaruRegion && johorRegion) {
    const { data: createdRegion, error: createRegionError } = await supabase
      .from('regions')
      .insert([{
        name: 'Desaru',
        name_cn: '迪沙鲁',
        description: 'Desaru, Johor travel spots, beaches, food, and route stops.',
        country: 'Malaysia',
        parent_id: johorRegion.id,
      }])
      .select('id,name,name_cn,country,parent_id')
      .single()

    if (createRegionError) throw createRegionError
    desaruRegion = createdRegion
  }

  const targetRegion = desaruRegion || johorRegion

  if (!targetRegion) {
    throw new Error('Could not find Desaru or Johor region in Supabase')
  }

  const relevantRegionIds = [targetRegion.id, johorRegion?.id].filter(Boolean)

  const { data: existingRows, error: existingError } = await supabase
    .from('locations')
    .select('id,name,name_cn,region_id,video_url,visit_date')
    .in('region_id', relevantRegionIds)

  if (existingError) throw existingError

  const existingByName = new Map()
  for (const row of existingRows || []) {
    const keys = [row.name, row.name_cn].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
    for (const key of keys) existingByName.set(key, row)
  }

  const inserts = []
  const duplicates = []
  const unresolved = []

  for (const item of ITEMS) {
    const keys = [item.name, item.name_cn].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
    const matched = keys.map((key) => existingByName.get(key)).find(Boolean)
    if (matched) {
      duplicates.push({ item, matched })
      continue
    }

    const geocoded = await resolveGoogleMaps(item)
    if (!geocoded) {
      unresolved.push(item.name_cn || item.name)
      continue
    }

    inserts.push({
      name: item.name,
      name_cn: item.name_cn || null,
      category: item.category,
      region_id: targetRegion.id,
      address: geocoded.address || fallbackAddress(item, targetRegion),
      latitude: geocoded.latitude,
      longitude: geocoded.longitude,
      video_url: VIDEO_URL,
      visit_date: VISIT_DATE,
      opening_hours: item.opening_hours || null,
      description: null,
      tags: normalizeTags(item),
      review: item.mapsUrl,
      status: 'active',
    })
  }

  console.log(JSON.stringify({
    targetRegion,
    duplicates: duplicates.map(({ item, matched }) => ({
      requested: item.name_cn || item.name,
      existingId: matched.id,
      existingName: matched.name_cn || matched.name,
    })),
    unresolved,
    insertCount: inserts.length,
  }, null, 2))

  let inserted = []
  if (inserts.length) {
    const { data, error: insertError } = await supabase
      .from('locations')
      .insert(inserts)
      .select('id,name,name_cn')

    if (insertError) throw insertError
    inserted = data || []
  }

  for (const { matched } of duplicates) {
    const patch = {
      region_id: targetRegion.id,
      video_url: matched.video_url || VIDEO_URL,
      visit_date: matched.visit_date || VISIT_DATE,
    }
    const { error: updateError } = await supabase
      .from('locations')
      .update(patch)
      .eq('id', matched.id)

    if (updateError) throw updateError
  }

  console.log(JSON.stringify({
    inserted: inserted.map((row) => ({ id: row.id, name: row.name_cn || row.name })),
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
