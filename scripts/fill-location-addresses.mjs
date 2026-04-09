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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function buildFallbackAddress(location) {
  const parts = [
    location.name_cn || location.name,
    location.regions?.name_cn || location.regions?.name,
    location.regions?.country,
  ]
    .map((item) => String(item || '').trim())
    .filter(Boolean)

  return parts.join(', ')
}

async function reverseGeocode(mapboxToken, longitude, latitude, language = 'zh-Hans,en') {
  const url = `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${encodeURIComponent(longitude)}&latitude=${encodeURIComponent(latitude)}&language=${encodeURIComponent(language)}&access_token=${encodeURIComponent(mapboxToken)}`
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Mapbox reverse geocode failed: ${response.status}`)
  }

  const payload = await response.json()
  const first = Array.isArray(payload?.features) ? payload.features[0] : null
  if (!first) return ''

  const labelCandidates = [
    first.properties?.full_address,
    first.properties?.place_formatted,
    first.properties?.name,
    first.place_name,
  ]

  return labelCandidates.map((item) => String(item || '').trim()).find(Boolean) || ''
}

async function main() {
  const env = await loadEnv()
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
  const mapboxToken = env.NEXT_PUBLIC_MAPBOX_TOKEN
  const updateAll = process.argv.includes('--all')
  const verbose = process.argv.includes('--verbose')

  if (!supabaseUrl || !serviceRoleKey || !mapboxToken) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or NEXT_PUBLIC_MAPBOX_TOKEN in .env.local')
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const pageSize = 200
  let from = 0
  const locations = []

  while (true) {
    const { data, error } = await supabase
      .from('locations')
      .select(`
        id,
        name,
        name_cn,
        latitude,
        longitude,
        address,
        regions:region_id (
          name,
          name_cn,
          country
        )
      `)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) throw error
    if (!data?.length) break
    locations.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }

  const targetLocations = locations.filter((location) => {
    if (location.latitude == null || location.longitude == null) return false
    if (updateAll) return true
    return !String(location.address || '').trim()
  })

  let updated = 0
  let skipped = 0
  let failed = 0

  for (const location of targetLocations) {
    const currentAddress = String(location.address || '').trim()

    try {
      const geocodedAddress = await reverseGeocode(mapboxToken, location.longitude, location.latitude)
      const nextAddress = geocodedAddress || currentAddress || buildFallbackAddress(location)

      if (!nextAddress || nextAddress === currentAddress) {
        skipped += 1
        continue
      }

      const { error } = await supabase
        .from('locations')
        .update({ address: nextAddress })
        .eq('id', location.id)

      if (error) throw error

      updated += 1
      if (verbose) {
        console.log(`Updated #${location.id}: ${location.name_cn || location.name} -> ${nextAddress}`)
      }
      await sleep(120)
    } catch (error) {
      failed += 1
      if (verbose) {
        console.error(`Failed #${location.id} ${location.name_cn || location.name}:`, error?.message || error)
      }
      await sleep(250)
    }
  }

  console.log(
    JSON.stringify(
      {
        scanned: locations.length,
        targeted: targetLocations.length,
        updated,
        skipped,
        failed,
        mode: updateAll ? 'all' : 'missing-only',
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
