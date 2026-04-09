#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

function loadEnvLocal(envPath) {
  if (!fs.existsSync(envPath)) return

  const raw = fs.readFileSync(envPath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue

    const key = trimmed.slice(0, eqIdx).trim()
    let value = trimmed.slice(eqIdx + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (!process.env[key]) process.env[key] = value
  }
}

function parseArgs(argv) {
  const args = {
    outputDir: 'data/reports',
    country: '',
    region: '',
    limit: 0,
    verifyAddresses: false,
  }

  const rest = [...argv]
  while (rest.length) {
    const token = rest.shift()
    if (!token) break

    if (token === '--output-dir') args.outputDir = rest.shift() || args.outputDir
    else if (token === '--country') args.country = rest.shift() || ''
    else if (token === '--region') args.region = rest.shift() || ''
    else if (token === '--limit') args.limit = Number(rest.shift() || 0) || 0
    else if (token === '--verify-addresses') args.verifyAddresses = true
    else if (token === '--help' || token === '-h') args.help = true
  }

  return args
}

function printHelp() {
  console.log('Usage:')
  console.log('  npm run audit:locations')
  console.log('  npm run audit:locations -- --country Malaysia')
  console.log('  npm run audit:locations -- --region Johor')
  console.log('  npm run audit:locations -- --verify-addresses')
  console.log('  npm run audit:locations -- --output-dir data/reports')
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim()
}

function toUrl(value) {
  if (!value) return null

  try {
    return new URL(String(value).trim())
  } catch {
    return null
  }
}

function isValidCoordinatePair(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  )
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (degrees) => (degrees * Math.PI) / 180
  const earthRadiusKm = 6371
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a))
}

function looksLikeImageUrl(value) {
  const url = toUrl(value)
  if (!url) return false

  const pathname = url.pathname.toLowerCase()
  if (/\.(jpg|jpeg|png|webp|gif|avif)$/i.test(pathname)) return true

  return (
    url.hostname.includes('supabase') ||
    url.hostname.includes('fbcdn.net') ||
    url.hostname.includes('fbsbx.com') ||
    url.hostname.includes('imgbb.com') ||
    url.hostname.includes('ibb.co')
  )
}

function validateMediaUrl(value, type) {
  if (!value) return null

  const url = toUrl(value)
  if (!url) return `invalid_${type}_url`

  const host = url.hostname.toLowerCase()

  if (type === 'youtube' && !host.includes('youtube.com') && !host.includes('youtu.be')) {
    return 'unexpected_youtube_domain'
  }

  if (type === 'facebook' && !host.includes('facebook.com') && !host.includes('fb.watch')) {
    return 'unexpected_facebook_domain'
  }

  if (type === 'image' && !looksLikeImageUrl(value)) {
    return 'unexpected_image_domain'
  }

  return null
}

async function geocodeAddress(address) {
  if (!address) return null

  const endpoint = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`
  const response = await fetch(endpoint, {
    headers: { 'User-Agent': 'jnqjourney-audit/1.0' },
  })

  if (!response.ok) return null

  const json = await response.json()
  const first = Array.isArray(json) ? json[0] : null
  if (!first) return null

  return {
    latitude: Number(first.lat),
    longitude: Number(first.lon),
    displayName: first.display_name || '',
  }
}

function pushIssue(report, severity, code, message, extra = {}) {
  report.issues.push({ severity, code, message, ...extra })
}

function pushSuggestion(report, code, message, extra = {}) {
  report.suggestions.push({ code, message, ...extra })
}

function summarizeSeverity(issues) {
  return {
    error: issues.filter((issue) => issue.severity === 'error').length,
    warning: issues.filter((issue) => issue.severity === 'warning').length,
    info: issues.filter((issue) => issue.severity === 'info').length,
  }
}

function renderMarkdown({ generatedAt, filters, summary, items }) {
  const lines = []
  lines.push('# Location Audit Report')
  lines.push('')
  lines.push(`Generated at: ${generatedAt}`)
  lines.push('')
  lines.push('## Scope')
  lines.push('')
  lines.push(`- Country filter: ${filters.country || 'all'}`)
  lines.push(`- Region filter: ${filters.region || 'all'}`)
  lines.push(`- Address verification: ${filters.verifyAddresses ? 'enabled' : 'disabled'}`)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push(`- Checked locations: ${summary.checked}`)
  lines.push(`- Error items: ${summary.itemsWithErrors}`)
  lines.push(`- Warning items: ${summary.itemsWithWarnings}`)
  lines.push(`- Total errors: ${summary.totalErrors}`)
  lines.push(`- Total warnings: ${summary.totalWarnings}`)
  lines.push(`- Duplicate groups: ${summary.duplicateGroups}`)
  lines.push('')

  const flagged = items.filter((item) => item.issues.length || item.suggestions.length)
  if (!flagged.length) {
    lines.push('## Findings')
    lines.push('')
    lines.push('No issues found.')
    return lines.join('\n')
  }

  lines.push('## Findings')
  lines.push('')
  for (const item of flagged) {
    lines.push(`### ${item.name || '(Unnamed location)'}${item.regionName ? ` (${item.regionName})` : ''}`)
    lines.push('')
    lines.push(`- ID: ${item.id}`)
    lines.push(`- Coordinates: ${item.latitude}, ${item.longitude}`)

    for (const issue of item.issues) {
      lines.push(`- [${issue.severity}] ${issue.code}: ${issue.message}`)
    }

    for (const suggestion of item.suggestions) {
      lines.push(`- [suggestion] ${suggestion.code}: ${suggestion.message}`)
    }

    lines.push('')
  }

  return lines.join('\n')
}

async function main() {
  const cwd = process.cwd()
  loadEnvLocal(path.join(cwd, '.env.local'))

  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    process.exit(0)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  console.log('\n[1/4] Loading locations and regions...')
  const { data: locations, error: locationError } = await supabase
    .from('locations')
    .select(`
      id,
      name,
      name_cn,
      category,
      address,
      latitude,
      longitude,
      region_id,
      image_url,
      images,
      video_url,
      facebook_video_url,
      description,
      tags,
      visit_date,
      opening_hours,
      status,
      regions:region_id (
        id,
        name,
        country
      )
    `)
    .order('id', { ascending: true })

  if (locationError) throw locationError

  let rows = Array.isArray(locations) ? locations : []
  if (args.country) {
    rows = rows.filter((row) => (row.regions?.country || '').toLowerCase() === args.country.toLowerCase())
  }
  if (args.region) {
    rows = rows.filter((row) => (row.regions?.name || '').toLowerCase() === args.region.toLowerCase())
  }
  if (args.limit > 0) {
    rows = rows.slice(0, args.limit)
  }

  if (!rows.length) {
    console.log('No matching locations found.')
    process.exit(0)
  }

  console.log(`[2/4] Auditing ${rows.length} locations...`)

  const duplicateGroups = new Map()
  for (const row of rows) {
    const key = `${normalizeName(row.name)}__${String(row.region_id || '')}`
    if (!duplicateGroups.has(key)) duplicateGroups.set(key, [])
    duplicateGroups.get(key).push(row.id)
  }

  const reports = []

  for (const row of rows) {
    const report = {
      id: row.id,
      name: row.name || '',
      regionName: row.regions?.name || '',
      country: row.regions?.country || '',
      latitude: row.latitude,
      longitude: row.longitude,
      issues: [],
      suggestions: [],
    }

    if (!row.name || !String(row.name).trim()) {
      pushIssue(report, 'error', 'missing_name', 'Location name is empty.')
    }

    if (!row.region_id) {
      pushIssue(report, 'warning', 'missing_region', 'Region is not assigned.')
    }

    if (!isValidCoordinatePair(Number(row.latitude), Number(row.longitude))) {
      pushIssue(report, 'error', 'invalid_coordinates', 'Latitude or longitude is missing or out of range.')
    }

    if (!row.address || !String(row.address).trim()) {
      pushIssue(report, 'warning', 'missing_address', 'Address is empty.')
    }

    if (!row.description || !String(row.description).trim()) {
      pushIssue(report, 'warning', 'missing_description', 'Description is empty.')
    }

    if (!row.image_url) {
      pushIssue(report, 'warning', 'missing_cover', 'Cover image is empty.')
      if (Array.isArray(row.images) && row.images[0]) {
        pushSuggestion(report, 'cover_from_gallery', 'Use the first gallery image as cover.')
      }
    } else {
      const coverIssue = validateMediaUrl(row.image_url, 'image')
      if (coverIssue) {
        pushIssue(report, 'warning', coverIssue, `Cover image URL looks suspicious: ${row.image_url}`)
      }
    }

    const gallery = Array.isArray(row.images) ? row.images.filter(Boolean) : []
    const invalidGallery = gallery.filter((item) => validateMediaUrl(item, 'image'))
    if (!gallery.length) {
      pushIssue(report, 'info', 'missing_gallery', 'Gallery images are empty.')
    }
    if (invalidGallery.length) {
      pushIssue(report, 'warning', 'invalid_gallery_urls', `${invalidGallery.length} gallery image URL(s) look suspicious.`)
    }
    if (row.image_url && gallery.includes(row.image_url)) {
      pushIssue(report, 'info', 'cover_duplicated_in_gallery', 'Cover image is also present in gallery.')
    }

    const youtubeIssue = validateMediaUrl(row.video_url, 'youtube')
    if (youtubeIssue) {
      pushIssue(report, 'warning', youtubeIssue, `YouTube URL looks suspicious: ${row.video_url}`)
    }

    const facebookIssue = validateMediaUrl(row.facebook_video_url, 'facebook')
    if (facebookIssue) {
      pushIssue(report, 'warning', facebookIssue, `Facebook URL looks suspicious: ${row.facebook_video_url}`)
    }

    if (!['attraction', 'food'].includes(String(row.category || ''))) {
      pushIssue(report, 'warning', 'unexpected_category', `Category "${row.category}" is outside the expected set.`)
    }

    if (!['active', 'permanently_closed', 'temporarily_closed'].includes(String(row.status || ''))) {
      pushIssue(report, 'warning', 'unexpected_status', `Status "${row.status}" is outside the expected set.`)
    }

    const duplicateKey = `${normalizeName(row.name)}__${String(row.region_id || '')}`
    const duplicates = duplicateGroups.get(duplicateKey) || []
    if (duplicates.length > 1) {
      pushIssue(report, 'warning', 'possible_duplicate', `Possible duplicate with IDs: ${duplicates.join(', ')}`, {
        relatedIds: duplicates,
      })
    }

    if (typeof row.name_cn === 'string' && row.name_cn.trim() && row.name_cn.trim() === row.name.trim()) {
      pushIssue(report, 'info', 'duplicate_name_cn', 'Chinese name is identical to the primary name.')
    }

    if (!Array.isArray(row.tags) || row.tags.length === 0) {
      pushIssue(report, 'info', 'missing_tags', 'Tags are empty.')
    }

    if (args.verifyAddresses && row.address && isValidCoordinatePair(Number(row.latitude), Number(row.longitude))) {
      try {
        const geo = await geocodeAddress(row.address)
        if (!geo) {
          pushIssue(report, 'info', 'address_unverified', 'Address verification returned no result.')
        } else {
          const distanceKm = haversineKm(
            Number(row.latitude),
            Number(row.longitude),
            geo.latitude,
            geo.longitude
          )

          if (distanceKm > 3) {
            pushIssue(
              report,
              'warning',
              'address_coordinate_mismatch',
              `Address geocoding is ${distanceKm.toFixed(2)} km away from stored coordinates.`,
              { distanceKm, geocodedAddress: geo.displayName }
            )
          }
        }
      } catch (error) {
        pushIssue(report, 'info', 'address_verification_failed', `Address verification failed: ${error.message}`)
      }
    }

    const severitySummary = summarizeSeverity(report.issues)
    report.errorCount = severitySummary.error
    report.warningCount = severitySummary.warning
    report.infoCount = severitySummary.info

    reports.push(report)
  }

  const summary = {
    checked: reports.length,
    itemsWithErrors: reports.filter((item) => item.errorCount > 0).length,
    itemsWithWarnings: reports.filter((item) => item.warningCount > 0).length,
    totalErrors: reports.reduce((sum, item) => sum + item.errorCount, 0),
    totalWarnings: reports.reduce((sum, item) => sum + item.warningCount, 0),
    duplicateGroups: Array.from(duplicateGroups.values()).filter((ids) => ids.length > 1).length,
  }

  console.log('[3/4] Writing report files...')
  const outputDir = path.resolve(cwd, args.outputDir)
  fs.mkdirSync(outputDir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const baseName = `location-audit-${timestamp}`
  const jsonPath = path.join(outputDir, `${baseName}.json`)
  const markdownPath = path.join(outputDir, `${baseName}.md`)

  const payload = {
    generatedAt: new Date().toISOString(),
    filters: {
      country: args.country,
      region: args.region,
      verifyAddresses: args.verifyAddresses,
      limit: args.limit,
    },
    summary,
    items: reports,
  }

  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2))
  fs.writeFileSync(
    markdownPath,
    renderMarkdown({
      generatedAt: payload.generatedAt,
      filters: payload.filters,
      summary,
      items: reports,
    })
  )

  console.log('[4/4] Done.')
  console.log(`- JSON report: ${jsonPath}`)
  console.log(`- Markdown report: ${markdownPath}`)
  console.log(`- Checked: ${summary.checked}`)
  console.log(`- Error items: ${summary.itemsWithErrors}`)
  console.log(`- Warning items: ${summary.itemsWithWarnings}`)
}

main().catch((error) => {
  console.error('\nAudit failed:', error.message)
  process.exit(1)
})
