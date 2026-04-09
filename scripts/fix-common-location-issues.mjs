#!/usr/bin/env node
import path from 'node:path'
import fs from 'node:fs'
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
    apply: false,
    country: '',
    region: '',
    limit: 0,
  }

  const rest = [...argv]
  while (rest.length) {
    const token = rest.shift()
    if (!token) break

    if (token === '--apply') args.apply = true
    else if (token === '--country') args.country = rest.shift() || ''
    else if (token === '--region') args.region = rest.shift() || ''
    else if (token === '--limit') args.limit = Number(rest.shift() || 0) || 0
    else if (token === '--help' || token === '-h') args.help = true
  }

  return args
}

function printHelp() {
  console.log('Usage:')
  console.log('  npm run fix:locations')
  console.log('  npm run fix:locations -- --apply')
  console.log('  npm run fix:locations -- --country Malaysia --apply')
  console.log('  npm run fix:locations -- --region Johor --apply')
}

function normalizeCategory(value) {
  const raw = String(value || '').trim()
  if (!raw) return 'attraction'

  const lower = raw.toLowerCase()
  const foodKeywords = ['food', 'cafe', 'café', 'restaurant', 'kopitiam', 'coffee', 'drink', 'dessert']

  if (foodKeywords.some((keyword) => lower.includes(keyword))) return 'food'
  if (lower === 'food') return 'food'

  return 'attraction'
}

function normalizeStatus(value) {
  const raw = String(value || '').trim().toLowerCase()

  if (!raw || raw === 'open' || raw === 'active') return 'active'
  if (raw === 'temporarily_closed') return 'temporarily_closed'
  if (raw === 'permanently_closed' || raw === 'closed') return 'permanently_closed'

  return 'active'
}

function normalizeImages(images, coverImage) {
  const list = Array.isArray(images) ? images : []
  const deduped = []
  const seen = new Set()

  for (const value of list) {
    const url = String(value || '').trim()
    if (!url || url === coverImage || seen.has(url)) continue
    seen.add(url)
    deduped.push(url)
  }

  return deduped
}

function valuesEqual(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    const leftList = Array.isArray(left) ? left : []
    const rightList = Array.isArray(right) ? right : []
    if (leftList.length !== rightList.length) return false
    return leftList.every((value, index) => value === rightList[index])
  }

  return left === right
}

function diffKeys(before, after) {
  return Object.keys(after).filter((key) => !valuesEqual(before[key], after[key]))
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

  console.log('\n[1/3] Loading candidate locations...')
  const { data, error } = await supabase
    .from('locations')
    .select(`
      id,
      name,
      category,
      status,
      image_url,
      images,
      regions:region_id (
        name,
        country
      )
    `)
    .order('id', { ascending: true })

  if (error) throw error

  let rows = Array.isArray(data) ? data : []
  if (args.country) {
    rows = rows.filter((row) => (row.regions?.country || '').toLowerCase() === args.country.toLowerCase())
  }
  if (args.region) {
    rows = rows.filter((row) => (row.regions?.name || '').toLowerCase() === args.region.toLowerCase())
  }
  if (args.limit > 0) {
    rows = rows.slice(0, args.limit)
  }

  const patches = []

  for (const row of rows) {
    const nextCategory = normalizeCategory(row.category)
    const nextStatus = normalizeStatus(row.status)
    const nextCover = String(row.image_url || '').trim() || (Array.isArray(row.images) ? String(row.images[0] || '').trim() : '')
    const nextImages = normalizeImages(row.images, nextCover)

    const nextValues = {
      category: nextCategory,
      status: nextStatus,
      image_url: nextCover || null,
      images: nextImages,
    }

    const currentValues = {
      category: row.category,
      status: row.status,
      image_url: row.image_url,
      images: Array.isArray(row.images) ? row.images : [],
    }

    const changed = diffKeys(currentValues, nextValues)
    if (!changed.length) continue

    patches.push({
      id: row.id,
      name: row.name,
      region: row.regions?.name || '',
      changed,
      currentValues,
      nextValues,
    })
  }

  console.log(`[2/3] Found ${patches.length} locations with safe fixes.`)

  if (!patches.length) {
    console.log('No safe fixes needed.')
    process.exit(0)
  }

  const preview = patches.slice(0, 20)
  for (const patch of preview) {
    console.log(`- #${patch.id} ${patch.name}${patch.region ? ` (${patch.region})` : ''}: ${patch.changed.join(', ')}`)
  }
  if (patches.length > preview.length) {
    console.log(`...and ${patches.length - preview.length} more`)
  }

  if (!args.apply) {
    console.log('\nPreview only. Re-run with --apply to write the fixes to Supabase.')
    process.exit(0)
  }

  console.log('[3/3] Applying fixes...')
  let success = 0
  let failed = 0

  for (const patch of patches) {
    const { error: updateError } = await supabase
      .from('locations')
      .update(patch.nextValues)
      .eq('id', patch.id)

    if (updateError) {
      failed += 1
      console.error(`- Failed #${patch.id} ${patch.name}: ${updateError.message}`)
      continue
    }

    success += 1
  }

  console.log(`Done. Updated ${success} locations, failed ${failed}.`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error('\nFix failed:', error.message)
  process.exit(1)
})
