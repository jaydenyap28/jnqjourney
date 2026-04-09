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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

function parseArgs(argv) {
  const args = { apply: false, country: '', limit: 0 }
  const rest = [...argv]
  while (rest.length) {
    const token = rest.shift()
    if (!token) break
    if (token === '--apply') args.apply = true
    else if (token === '--country') args.country = rest.shift() || ''
    else if (token === '--limit') args.limit = Number(rest.shift() || 0) || 0
  }
  return args
}

const INTERNAL_ALIASES = new Set(['featured-home', 'homepage-featured', 'featured'])
const DROP_TAGS = new Set([
  'manual-map-import',
  'youtube-import',
  'spot',
  'attraction',
  'accommodation',
  'hotel',
  '景点',
  '住宿',
])

const TAG_ALIASES = {
  food: '美食',
  cafe: '咖啡',
  coffee: '咖啡',
  tea: '茶馆',
  market: '市集',
  shopping: '购物',
  seafood: '海鲜',
  bbq: '烧烤',
  breakfast: '早餐',
  temple: '寺庙',
  church: '教堂',
  museum: '博物馆',
  park: '公园',
  garden: '公园',
  bridge: '桥',
  square: '广场',
  village: '小镇',
  oldtown: '古镇',
  'old-town': '古镇',
  'water-town': '古镇',
  island: '海岛',
  beach: '海边',
  sea: '海边',
  coast: '海边',
  lake: '湖景',
  mountain: '山景',
  snow: '雪景',
  onsen: '温泉',
  'hot-spring': '温泉',
  waterfall: '瀑布',
  hiking: '徒步',
  drift: '漂流',
  bookstore: '书店',
  family: '亲子',
  night: '夜景',
}

function normalizeTag(tag) {
  const raw = String(tag || '').trim()
  if (!raw) return null

  const lower = raw.toLowerCase()
  if (DROP_TAGS.has(lower)) return null
  if (INTERNAL_ALIASES.has(lower)) return 'featured-home'
  if (TAG_ALIASES[lower]) return TAG_ALIASES[lower]
  if (/[a-z]/i.test(raw)) return null

  return raw
}

function addTag(list, tag) {
  const value = String(tag || '').trim()
  if (!value || list.includes(value)) return
  list.push(value)
}

function inferTags(row, normalizedExisting) {
  const tags = []
  const text = [
    row.name,
    row.name_cn,
    row.address,
    row.regions?.name,
    row.regions?.name_cn,
  ]
    .filter(Boolean)
    .join(' ')
  const nameText = [row.name, row.name_cn].filter(Boolean).join(' ')
  const lower = text.toLowerCase()

  if (String(row.category || '').trim().toLowerCase() === 'food') {
    addTag(tags, '美食')
  }

  for (const tag of normalizedExisting) {
    if (tag !== 'featured-home' && tag !== '美食' && tag !== '景点' && tag !== '住宿') addTag(tags, tag)
  }

  if (/古城/.test(text)) addTag(tags, '古城')
  if (/古镇|water[- ]town|old[- ]town/i.test(text)) addTag(tags, '古镇')
  if (/老街|步行街|斜街|街区|中央大街|山塘街/.test(text)) addTag(tags, '老街')
  if (/小镇|村|古镇|village|town/i.test(text) && !tags.includes('古镇')) addTag(tags, '小镇')

  if (/岛|island|pulau/i.test(text)) addTag(tags, '海岛')
  if (/海边|海滩|沙滩|海岸|海湾|湾|beach|coast|bay|seaside|shore/i.test(text)) addTag(tags, '海边')
  if (/湖|潭|湾|lake|lagoon/i.test(text) && !tags.includes('海边')) addTag(tags, '湖景')
  if (/山|峰|峡|谷|雪山|长城|hill|mount|mountain|cliff|canyon/i.test(text)) addTag(tags, '山景')
  if (/瀑布|waterfall|falls/i.test(text)) addTag(tags, '瀑布')
  if (/雪|冰雪|滑雪|\b(?:ski|snow)\b/i.test(nameText)) addTag(tags, '雪景')
  if (/温泉|足汤|onsen|hot spring/i.test(lower)) addTag(tags, '温泉')

  if (/寺|庙|佛塔|佛寺|观音洞|拉康|temple|shrine|pagoda|monastery/i.test(text)) addTag(tags, '寺庙')
  if (/教堂|church|cathedral/i.test(text)) addTag(tags, '教堂')
  if (/博物馆|美术馆|文化村|museum|gallery/i.test(text)) addTag(tags, '博物馆')
  if (/公园|花园|park|garden/i.test(text)) addTag(tags, '公园')
  if (/书店|书局|书院|bookstore|library/i.test(text)) addTag(tags, '书店')
  if (/广场|square|plaza/i.test(text)) addTag(tags, '广场')
  if (/桥|bridge/i.test(text)) addTag(tags, '桥')

  if (/咖啡|coffee|cafe/i.test(text)) addTag(tags, '咖啡')
  if (/茶室|茶馆|茶饮|tea/i.test(text)) addTag(tags, '茶馆')
  if (/海鲜|seafood/i.test(text)) addTag(tags, '海鲜')
  if (/烧烤|烤肉|bbq|barbecue/i.test(text)) addTag(tags, '烧烤')
  if (/早餐|早市|早茶/i.test(text)) addTag(tags, '早餐')
  if (/市集|集市|夜市|market/i.test(text)) addTag(tags, '市集')
  if (/商场|商圈|商街|商城|购物|mall|shopping|outlet|plaza/i.test(text)) addTag(tags, '购物')

  if (/夜景|日落|月光|\bsunset\b|\bnight view\b|\bnightscape\b/i.test(lower)) addTag(tags, '夜景')
  if (/乐园|环球|\btheme park\b|\bamusement\b/i.test(lower)) addTag(tags, '乐园')
  if (/漂流|\brafting\b|\bdrift\b/i.test(lower)) addTag(tags, '漂流')
  if (/徒步|\bhiking\b|\btrail\b|\btrek\b/i.test(lower)) addTag(tags, '徒步')
  if (/亲子|\bfamily\b|\bkids\b/i.test(lower)) addTag(tags, '亲子')

  const finalTags = tags.slice(0, 5)
  if (normalizedExisting.includes('featured-home')) addTag(finalTags, 'featured-home')
  return finalTags
}

function arraysEqual(left, right) {
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

async function main() {
  const cwd = process.cwd()
  loadEnvLocal(path.join(cwd, '.env.local'))
  const args = parseArgs(process.argv.slice(2))

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const { data, error } = await supabase
    .from('locations')
    .select(`
      id,
      name,
      name_cn,
      category,
      address,
      description,
      tags,
      regions:region_id (
        name,
        name_cn,
        country
      )
    `)
    .order('id', { ascending: true })

  if (error) throw error

  let rows = Array.isArray(data) ? data : []
  if (args.country) {
    rows = rows.filter((row) => (row.regions?.country || '').toLowerCase() === args.country.toLowerCase())
  }
  if (args.limit > 0) rows = rows.slice(0, args.limit)

  const updates = []
  for (const row of rows) {
    const normalizedExisting = (Array.isArray(row.tags) ? row.tags : [])
      .map(normalizeTag)
      .filter(Boolean)
    const nextTags = inferTags(row, normalizedExisting)
    const currentTags = Array.isArray(row.tags) ? row.tags : []

    if (!arraysEqual(currentTags, nextTags)) {
      updates.push({ id: row.id, name: row.name, currentTags, nextTags })
    }
  }

  console.log(`[preview] ${updates.length} locations need tag updates.`)
  for (const item of updates.slice(0, 25)) {
    console.log(`- #${item.id} ${item.name}: ${JSON.stringify(item.currentTags)} -> ${JSON.stringify(item.nextTags)}`)
  }

  if (!args.apply) return

  let success = 0
  for (const item of updates) {
    const { error: updateError } = await supabase
      .from('locations')
      .update({ tags: item.nextTags })
      .eq('id', item.id)
    if (updateError) throw updateError
    success += 1
  }

  console.log(`[done] Updated ${success} locations.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
