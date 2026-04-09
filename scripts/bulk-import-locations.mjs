#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

/**
 * 读取 .env.local（简化版）
 */
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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

/**
 * 极简 CSV 解析器（支持双引号与逗号）
 */
function parseCsv(text) {
  const rows = []
  let row = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    const next = text[i + 1]

    if (c === '"') {
      if (inQuotes && next === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (c === ',' && !inQuotes) {
      row.push(current)
      current = ''
      continue
    }

    if ((c === '\n' || c === '\r') && !inQuotes) {
      if (c === '\r' && next === '\n') i++
      row.push(current)
      if (row.some(cell => cell.trim() !== '')) rows.push(row)
      row = []
      current = ''
      continue
    }

    current += c
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current)
    if (row.some(cell => cell.trim() !== '')) rows.push(row)
  }

  if (rows.length === 0) return []
  const headers = rows[0].map(h => h.trim())
  return rows.slice(1).map((r) => {
    const obj = {}
    headers.forEach((h, idx) => {
      obj[h] = (r[idx] ?? '').trim()
    })
    return obj
  })
}

function toFloat(v) {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function splitTags(v) {
  if (!v) return []
  return String(v).split(/[,，]/).map(s => s.trim()).filter(Boolean)
}

function normalizeImportedTags(tags) {
  const featureAliases = new Set(['featured-home', 'homepage-featured', 'featured'])
  const dropTags = new Set(['manual-map-import', 'youtube-import', 'spot', 'attraction', 'hotel', 'accommodation', '景点', '住宿'])
  const aliasMap = {
      food: '\u7f8e\u98df',
      cafe: '\u5496\u5561',
      coffee: '\u5496\u5561',
      tea: '\u8336\u996e',
    shopping: '\u8d2d\u7269',
    market: '\u5e02\u96c6',
    'night-view': '\u591c\u666f',
    'sea-view': '\u6d77\u666f',
    nature: '\u81ea\u7136',
    onsen: '\u6e29\u6cc9',
    'hot-spring': '\u6e29\u6cc9',
    family: '\u4eb2\u5b50',
    bridge: '\u6865\u6881',
    village: '\u6751\u843d',
    park: '\u516c\u56ed',
    garden: '\u516c\u56ed',
    museum: '\u535a\u7269\u9986',
    church: '\u6559\u5802',
    temple: '\u5bfa\u5e99',
    snow: '\u96ea\u666f',
    seafood: '\u6d77\u9c9c',
    bbq: '\u70e7\u70e4',
    breakfast: '\u65e9\u9910',
    'old-town': '\u53e4\u9547',
    'water-town': '\u53e4\u9547',
    'historic-district': '\u8001\u8857',
    architecture: '\u5730\u6807',
    landmark: '\u5730\u6807',
    viewpoint: '\u6253\u5361',
    pier: '\u7801\u5934',
    bookstore: '\u4e66\u5e97',
    square: '\u5e7f\u573a',
    culture: '\u6587\u5316',
    'theme-park': '\u4e50\u56ed',
    drift: '\u6f02\u6d41',
    hiking: '\u5f92\u6b65',
    'road-trip': '\u81ea\u9a7e',
  }

  const values = Array.isArray(tags) ? tags : splitTags(tags)
  const result = []
  for (const item of values) {
    const raw = String(item || '').trim()
    if (!raw) continue
    const lower = raw.toLowerCase()
    if (dropTags.has(lower)) continue
    if (featureAliases.has(lower)) {
      if (!result.includes('featured-home')) result.push('featured-home')
      continue
    }
    if (aliasMap[lower]) {
      const mapped = aliasMap[lower]
      if (!result.includes(mapped)) result.push(mapped)
      continue
    }
    if (/^[a-z0-9-]+$/i.test(raw)) continue
    if (!result.includes(raw)) result.push(raw)
  }
  return result
}

/**
 * 规范化输入记录
 */
function normalizeItem(item) {
  return {
    name: item.name || '',
    name_cn: item.name_cn || null,
    category: item.category || 'attraction',
    address: item.address || null,
    latitude: toFloat(item.latitude),
    longitude: toFloat(item.longitude),
    region_name: item.region_name || null,
    country: item.country || null,
    video_url: item.video_url || null,
    facebook_video_url: item.facebook_video_url || null,
    image_url: item.image_url || null,
    images: item.images ? (Array.isArray(item.images) ? item.images : String(item.images).split('|').map(s => s.trim()).filter(Boolean)) : [],
    description: item.description || item.review || null,
    tags: normalizeImportedTags(item.tags),
    visit_date: item.visit_date || null,
    opening_hours: item.opening_hours || null,
    status: item.status || 'active',
  }
}

async function main() {
  const cwd = process.cwd()
  loadEnvLocal(path.join(cwd, '.env.local'))

  const inputPath = process.argv[2]
  if (!inputPath) {
    console.log('用法: npm run import:locations -- ./data/locations.json')
    console.log('支持 .json 或 .csv')
    process.exit(1)
  }

  const fullPath = path.isAbsolute(inputPath) ? inputPath : path.join(cwd, inputPath)
  if (!fs.existsSync(fullPath)) {
    console.error(`找不到文件: ${fullPath}`)
    process.exit(1)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRole) {
    console.error('缺少环境变量: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    console.error('请在 .env.local 增加 SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } })

  const raw = fs.readFileSync(fullPath, 'utf8')
  let input = []
  if (fullPath.endsWith('.json')) {
    input = JSON.parse(raw)
    if (!Array.isArray(input)) throw new Error('JSON 须为数组')
  } else if (fullPath.endsWith('.csv')) {
    input = parseCsv(raw)
  } else {
    throw new Error('仅支持 .json / .csv')
  }

  const normalized = input.map(normalizeItem).filter(i => i.name && i.latitude !== null && i.longitude !== null)

  if (normalized.length === 0) {
    console.log('没有可导入的数据（至少需要 name/latitude/longitude）')
    process.exit(0)
  }

  // 预加载 regions，避免每条记录都请求
  const { data: regions, error: regionErr } = await supabase
    .from('regions')
    .select('id,name,country')

  if (regionErr) throw regionErr

  const regionMap = new Map()
  for (const r of regions || []) {
    regionMap.set(`${(r.name || '').toLowerCase()}__${(r.country || '').toLowerCase()}`, r.id)
    regionMap.set(`${(r.name || '').toLowerCase()}__`, r.id)
  }

  const payloads = normalized.map((item) => {
    const keyWithCountry = `${(item.region_name || '').toLowerCase()}__${(item.country || '').toLowerCase()}`
    const keyNoCountry = `${(item.region_name || '').toLowerCase()}__`
    const region_id = item.region_name ? (regionMap.get(keyWithCountry) ?? regionMap.get(keyNoCountry) ?? null) : null

    return {
      name: item.name,
      name_cn: item.name_cn,
      category: item.category,
      address: item.address,
      latitude: item.latitude,
      longitude: item.longitude,
      region_id,
      video_url: item.video_url,
      facebook_video_url: item.facebook_video_url,
      image_url: item.image_url,
      images: item.images,
      description: item.description,
      tags: item.tags,
      visit_date: item.visit_date,
      opening_hours: item.opening_hours,
      status: item.status,
    }
  })

  const batchSize = 200
  let inserted = 0

  for (let i = 0; i < payloads.length; i += batchSize) {
    const batch = payloads.slice(i, i + batchSize)
    const { error } = await supabase.from('locations').insert(batch)
    if (error) {
      console.error(`批次 ${i / batchSize + 1} 导入失败:`, error.message)
      process.exit(1)
    }
    inserted += batch.length
    console.log(`已导入 ${inserted}/${payloads.length}`)
  }

  console.log(`✅ 导入完成，共 ${inserted} 条`) 
}

main().catch((err) => {
  console.error('导入异常:', err.message)
  process.exit(1)
})
