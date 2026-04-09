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
  const args = {
    input: '',
    preview: false,
  }

  const rest = [...argv]
  while (rest.length) {
    const token = rest.shift()
    if (!token) break

    if (token === '--preview') args.preview = true
    else if (!args.input) args.input = token
  }

  return args
}

async function main() {
  const cwd = process.cwd()
  loadEnvLocal(path.join(cwd, '.env.local'))

  const { input, preview } = parseArgs(process.argv.slice(2))
  if (!input) {
    console.log('用法:')
    console.log('  npm run update:photos -- ./data/photos-update.csv')
    console.log('  npm run update:photos -- ./data/photos-update.csv --preview')
    process.exit(1)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) throw new Error('缺少 NEXT_PUBLIC_SUPABASE_URL')
  if (!serviceRoleKey) throw new Error('缺少 SUPABASE_SERVICE_ROLE_KEY')

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  const filePath = path.resolve(cwd, input)
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`)
  }

  const raw = fs.readFileSync(filePath, 'utf8')
  const lines = raw.split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) {
    throw new Error('CSV 至少需要一行表头 + 一行数据')
  }

  const header = lines[0].split(',').map(h => h.trim())
  const data = lines.slice(1).map(line => {
    const cells = line.split(',').map(c => c.trim())
    const obj = {}
    header.forEach((h, idx) => {
      obj[h] = cells[idx] || ''
    })
    return obj
  }).filter(row => row.name && row.region_name)

  console.log(`读取到 ${data.length} 条待更新记录`)

  // 预加载所有 regions
  const { data: regions, error: regionErr } = await supabase
    .from('regions')
    .select('id,name,country')

  if (regionErr) throw regionErr

  const regionMap = new Map()
  for (const r of regions || []) {
    const key = `${(r.name || '').toLowerCase()}__${(r.country || '').toLowerCase()}`
    regionMap.set(key, r.id)
  }

  const updates = []
  const notFound = []

  for (const row of data) {
    const regionKey = `${row.region_name.toLowerCase()}__${(row.country || 'Japan').toLowerCase()}`
    const regionId = regionMap.get(regionKey)

    if (!regionId) {
      notFound.push({ ...row, reason: `region 未找到: ${row.region_name}` })
      continue
    }

    const { data: locations } = await supabase
      .from('locations')
      .select('id,name,region_id')
      .eq('name', row.name)
      .eq('region_id', regionId)
      .limit(1)

    if (!locations || !locations.length) {
      notFound.push({ ...row, reason: `location 未找到: ${row.name} (region_id: ${regionId})` })
      continue
    }

    const loc = locations[0]
    const images = row.images
      ? String(row.images).split('|').map(url => url.trim()).filter(Boolean)
      : []

    updates.push({
      id: loc.id,
      name: loc.name,
      region_name: row.region_name,
      image_url: row.image_url || null,
      images,
    })
  }

  console.log(`\n匹配成功: ${updates.length} 条`)
  console.log(`未匹配: ${notFound.length} 条`)

  if (notFound.length) {
    console.log('\n未匹配详情:')
    notFound.forEach(nf => {
      console.log(`  ${nf.name} (${nf.region_name}) - ${nf.reason}`)
    })
  }

  if (preview) {
    console.log('\n预览模式，不执行更新。')
    console.log('如需执行，去掉 --preview 参数。')
    process.exit(0)
  }

  if (!updates.length) {
    console.log('没有可更新的记录。')
    process.exit(0)
  }

  console.log('\n开始批量更新...')
  let success = 0
  let failed = 0

  for (const upd of updates) {
    try {
      const { error } = await supabase
        .from('locations')
        .update({
          image_url: upd.image_url,
          images: upd.images,
        })
        .eq('id', upd.id)

      if (error) {
        console.error(`❌ ${upd.name} 更新失败:`, error.message)
        failed++
      } else {
        console.log(`✅ ${upd.name} 更新成功`)
        success++
      }
    } catch (err) {
      console.error(`❌ ${upd.name} 异常:`, err.message)
      failed++
    }
  }

  console.log(`\n完成: ${success} 成功, ${failed} 失败`)
}

main().catch((err) => {
  console.error('❌ 执行失败:', err.message)
  process.exit(1)
})
