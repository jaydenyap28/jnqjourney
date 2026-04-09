import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { pinyin } from 'pinyin-pro'

const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8')
  for (const line of env.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index === -1) continue
    const key = trimmed.slice(0, index).trim()
    let value = trimmed.slice(index + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const storageBucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'location-images'

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing Supabase environment variables.')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const STORAGE_PATH = '_system/location-slugs.webp'
const LEGACY_STORAGE_PATH = '_system/location-slugs.json'

const MANUAL_OVERRIDES = {
  '杭州|老西子·杭帮菜(西湖音乐喷泉店)': 'lao-xi-zi-hangzhou-cuisine',
  '杭州|西湖': 'west-lake-hangzhou',
  '杭州|钱江新城城市阳台': 'qianjiang-new-city-terrace',
  '广州|北京路步行街': 'beijing-road-pedestrian-street',
  '广州|大佛古寺': 'dafo-ancient-temple-guangzhou',
  '广州|广州塔': 'guangzhou-tower',
  '广州|石室圣心大教堂': 'sacred-heart-cathedral-guangzhou',
  '乌镇|乌镇': 'wuzhen-water-town',
  '苏州|同里古镇': 'tongli-water-town',
  '上海|上海外滩': 'the-bund-shanghai',
  '北京|故宫博物院': 'forbidden-city-beijing',
  '北京|前门大街': 'qianmen-street-beijing',
  '北京|慕田峪长城': 'mutianyu-great-wall',
  '哈尔滨市|哈尔滨冰雪大世界': 'harbin-ice-and-snow-world',
  '雪谷|中国雪谷': 'china-xuegu',
  '长白山|长白山北坡景区': 'changbai-mountain-north-slope',
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function tokenizeChineseName(value) {
  const base = String(value || '').trim()
  if (!base) return ''

  const transliterated = pinyin(base, {
    toneType: 'none',
    nonZh: 'consecutive',
    type: 'array',
    v: true,
  })

  const normalized = (Array.isArray(transliterated) ? transliterated : [String(transliterated)])
    .flatMap((part) => String(part || '').split(/[\s/]+/))
    .map((part) => slugify(part))
    .filter(Boolean)

  return normalized.join('-')
}

function buildBaseSlug(location) {
  const primaryName = String(location.name || '').trim()
  const fallbackName = String(location.name_cn || '').trim()
  const rawName = primaryName || fallbackName
  const englishBase = slugify(rawName)
  if (englishBase && /[a-z]/.test(englishBase)) return englishBase

  const transliterated = tokenizeChineseName(rawName)
  if (!transliterated) return `spot-${location.id}`

  const tokens = transliterated.split('-').filter(Boolean)
  return tokens.slice(0, 8).join('-')
}

function buildCategorySuffix(location, currentSlug) {
  const category = String(location.category || '').toLowerCase()
  if (category === 'food') {
    if (/(restaurant|cafe|coffee|tea|noodle|burger|foodcourt|cuisine|kitchen|hotpot|bbq)/.test(currentSlug)) {
      return ''
    }
    return 'cuisine'
  }

  if (category === 'accommodation') {
    if (/(hotel|hostel|guesthouse|inn|homestay|resort|lodge|villa)/.test(currentSlug)) {
      return ''
    }
    return 'hotel'
  }

  return ''
}

function buildChinaSlug(location) {
  const regionName = String(location.region_name || '').trim()
  const regionNameCn = String(location.region_name_cn || '').trim()
  const placeName = String(location.name || '').trim()
  const overrideCandidates = [
    `${regionNameCn}|${placeName}`,
    `${regionNameCn.replace(/市$/, '')}|${placeName}`,
    `${regionName}|${placeName}`,
  ].filter(Boolean)
  const manual = overrideCandidates.map((key) => MANUAL_OVERRIDES[key]).find(Boolean)
  if (manual) return manual

  const baseSlug = buildBaseSlug(location)
  const regionSlug = slugify(regionName) || tokenizeChineseName(regionNameCn)
  const suffix = buildCategorySuffix(location, baseSlug)

  const parts = [baseSlug]
  if (regionSlug && !baseSlug.includes(regionSlug)) parts.push(regionSlug)
  if (suffix) parts.push(suffix)

  return slugify(parts.join('-')) || `spot-${location.id}`
}

async function readExistingSlugMap() {
  for (const filePath of [STORAGE_PATH, LEGACY_STORAGE_PATH]) {
    const { data, error } = await supabase.storage.from(storageBucket).download(filePath)
    if (error || !data) continue
    const raw = await data.text()
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed)
          .map(([key, value]) => [String(key), slugify(String(value || ''))])
          .filter(([, value]) => value)
      )
    }
  }

  const localPath = path.join(process.cwd(), 'data', 'location-slugs.json')
  if (fs.existsSync(localPath)) {
    const parsed = JSON.parse(fs.readFileSync(localPath, 'utf8'))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed)
          .map(([key, value]) => [String(key), slugify(String(value || ''))])
          .filter(([, value]) => value)
      )
    }
  }

  return {}
}

async function fetchChinaLocations() {
  const rows = []
  let from = 0
  const pageSize = 500

  while (true) {
    const { data, error } = await supabase
      .from('locations')
      .select(`
        id,
        name,
        name_cn,
        category,
        regions:region_id (
          country,
          name,
          name_cn
        )
      `)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) throw error
    const batch = Array.isArray(data) ? data : []
    rows.push(...batch)
    if (batch.length < pageSize) break
    from += pageSize
  }

  return rows
    .map((row) => {
      const region = Array.isArray(row.regions) ? row.regions[0] || null : row.regions || null
      return {
        id: row.id,
        name: row.name,
        name_cn: row.name_cn,
        category: row.category,
        region_name: region?.name || '',
        region_name_cn: region?.name_cn || '',
        country: region?.country || '',
      }
    })
    .filter((row) => String(row.country || '').toLowerCase() === 'china')
}

async function persistSlugMap(slugMap) {
  const payload = Buffer.from(`${JSON.stringify(slugMap, null, 2)}\n`, 'utf8')
  const { error } = await supabase.storage.from(storageBucket).upload(STORAGE_PATH, payload, {
    upsert: true,
    contentType: 'image/webp',
  })

  if (error) throw error

  const localPath = path.join(process.cwd(), 'data', 'location-slugs.json')
  fs.writeFileSync(localPath, `${JSON.stringify(slugMap, null, 2)}\n`, 'utf8')
}

async function main() {
  const existing = await readExistingSlugMap()
  const chinaLocations = await fetchChinaLocations()
  const next = { ...existing }
  const preview = []

  for (const location of chinaLocations) {
    const slug = buildChinaSlug(location)
    next[String(location.id)] = slug
    if (preview.length < 40) {
      preview.push({
        id: location.id,
        name: location.name,
        region: location.region_name_cn || location.region_name,
        slug,
      })
    }
  }

  await persistSlugMap(next)

  process.stdout.write(
    JSON.stringify(
      {
        updated: chinaLocations.length,
        preview,
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
