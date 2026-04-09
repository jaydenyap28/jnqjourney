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
  'China|杭州|老西子·地道杭帮菜(西湖音乐喷泉店)': 'lao-xi-zi-hangzhou-cuisine',
  'China|杭州|西湖': 'west-lake-hangzhou',
  'China|杭州|钱江新城 城市阳台': 'qianjiang-new-city-terrace',
  'China|广州|北京路步行街': 'beijing-road-pedestrian-street',
  'China|广州|大佛古寺': 'dafo-ancient-temple-guangzhou',
  'China|广州|广州塔': 'guangzhou-tower',
  'China|广州|石室圣心大教堂': 'sacred-heart-cathedral-guangzhou',
  'China|乌镇|乌镇': 'wuzhen-water-town',
  'China|苏州|同里古镇': 'tongli-water-town',
  'China|上海|上海外滩': 'the-bund-shanghai',
  'China|北京|故宫博物院': 'forbidden-city-beijing',
  'China|北京|前门大街': 'qianmen-street-beijing',
  'China|北京|慕田峪长城': 'mutianyu-great-wall',
  'China|哈尔滨|哈尔滨冰雪大世界': 'harbin-ice-and-snow-world',
  'China|雪谷|中国雪谷': 'china-xuegu',
  'China|长白山|长白山北坡景区': 'changbai-mountain-north-slope',
  'Malaysia|霹雳|二奶巷': 'concubine-lane-ipoh',
  'Malaysia|霹雳|老黄芽菜鸡': 'restoran-lou-wong-bean-sprout-chicken',
  'Malaysia|霹雳|安记芽菜鸡沙河粉': 'ong-kee-bean-sprout-chicken-ipoh',
  'Malaysia|霹雳|怡保德记炒粉': 'ipoh-tuck-kee-restaurant',
  'Malaysia|霹雳|怡保咖喱面': 'yee-fatt-curry-mee-ipoh',
  'Malaysia|马六甲|士兰道青龙宫': 'sri-landa-qing-long-gong-melaka',
}

const ID_OVERRIDES = {
  322: 'guangzhou-tower',
  427: 'west-lake-hangzhou',
  429: 'qianjiang-new-city-terrace',
  432: 'wuzhen-water-town',
  445: 'tongli-water-town',
  449: 'the-bund-shanghai',
  478: 'qianmen-street-beijing',
  480: 'forbidden-city-beijing',
  484: 'mutianyu-great-wall',
  490: 'changbai-mountain-north-slope',
  645: 'lao-xi-zi-hangzhou-cuisine',
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

function transliterateChinese(value) {
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

function hasAsciiWords(value) {
  return /[a-z]/i.test(slugify(value))
}

function buildBaseSlug(name, fallbackName, maxTokens = 6) {
  const rawName = String(name || '').trim() || String(fallbackName || '').trim()
  const englishBase = slugify(rawName)
  if (englishBase && /[a-z]/.test(englishBase)) return englishBase

  const transliterated = transliterateChinese(rawName)
  if (!transliterated) return ''
  return transliterated.split('-').filter(Boolean).slice(0, maxTokens).join('-')
}

function buildRegionSlug(regionName, regionNameCn) {
  const english = slugify(regionName)
  if (english && /[a-z]/.test(english)) return english
  return transliterateChinese(regionNameCn).split('-').filter(Boolean).slice(0, 3).join('-')
}

function buildCategorySuffix(location, currentSlug) {
  const category = String(location.category || '').toLowerCase()
  if (category === 'food') {
    if (/(restaurant|cafe|coffee|tea|noodle|burger|foodcourt|cuisine|kitchen|hotpot|bbq|mee|chicken)/.test(currentSlug)) {
      return ''
    }
    return 'cuisine'
  }

  if (category === 'accommodation') {
    if (/(hotel|hostel|guesthouse|inn|homestay|resort|lodge|villa|suite)/.test(currentSlug)) {
      return ''
    }
    return 'hotel'
  }

  return ''
}

function shortenSlug(slug, maxLength = 40) {
  const parts = slug.split('-').filter(Boolean)
  if (slug.length <= maxLength || parts.length <= 3) return slug

  while (parts.length > 3 && parts.join('-').length > maxLength) {
    parts.pop()
  }

  return parts.join('-')
}

function buildSlug(location) {
  const forcedSlug = ID_OVERRIDES[Number(location.id)]
  if (forcedSlug) return forcedSlug

  const country = String(location.country || '').trim()
  const regionName = String(location.region_name || '').trim()
  const regionNameCn = String(location.region_name_cn || '').trim()
  const name = String(location.name || '').trim()
  const fallbackName = String(location.name_cn || '').trim()

  const normalizedRegionCn = regionNameCn.replace(/[省市州县区]$/u, '')
  const normalizedRegion = regionName.replace(/[省市州县区]$/u, '')
  const overrideCandidates = [
    `${country}|${regionNameCn || regionName}|${name || fallbackName}`,
    `${country}|${normalizedRegionCn || normalizedRegion}|${name || fallbackName}`,
  ]
  const manual = overrideCandidates.map((key) => MANUAL_OVERRIDES[key]).find(Boolean)
  if (manual) return manual

  const baseSlug = buildBaseSlug(name, fallbackName, country === 'China' ? 5 : 6)
  if (!baseSlug) return `spot-${location.id}`

  const regionSlug = buildRegionSlug(regionName, regionNameCn)
  const suffix = buildCategorySuffix(location, baseSlug)
  const parts = [baseSlug]

  if (country === 'China') {
    if (regionSlug && !baseSlug.includes(regionSlug) && baseSlug.length < 24) {
      parts.push(regionSlug)
    }
  } else if (country === 'Malaysia') {
    const needsRegionHint = !hasAsciiWords(name) && regionSlug && !baseSlug.includes(regionSlug)
    if (needsRegionHint) parts.push(regionSlug)
  }

  if (suffix) parts.push(suffix)

  return shortenSlug(slugify(parts.join('-'))) || `spot-${location.id}`
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

async function fetchLocations() {
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

  return rows.map((row) => {
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
}

function shouldRefreshSlug(location, existingSlug) {
  const country = String(location.country || '').toLowerCase()
  if (country === 'china') return true

  if (country === 'malaysia') {
    const rawName = String(location.name || '').trim()
    const fallbackName = String(location.name_cn || '').trim()
    const chineseOnly = !hasAsciiWords(rawName) && Boolean(fallbackName || rawName)
    const genericExisting = /^spot-\d+$/.test(existingSlug || '')
    return chineseOnly || genericExisting
  }

  return false
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
  const locations = await fetchLocations()
  const next = { ...existing }
  const preview = []
  let updated = 0

  for (const location of locations) {
    const key = String(location.id)
    const currentSlug = existing[key] || ''
    if (!shouldRefreshSlug(location, currentSlug)) continue

    const slug = buildSlug(location)
    if (!slug) continue

    next[key] = slug
    updated += 1

    if (preview.length < 80) {
      preview.push({
        id: location.id,
        country: location.country,
        region: location.region_name_cn || location.region_name,
        name: location.name,
        slug,
      })
    }
  }

  await persistSlugMap(next)

  process.stdout.write(
    JSON.stringify(
      {
        updated,
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
