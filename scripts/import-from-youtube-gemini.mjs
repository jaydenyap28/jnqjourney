#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

/**
 * 读取 .env.local（仅本地脚本使用）
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

function parseArgs(argv) {
  const args = {
    input: '',
    apply: false,
    country: 'Malaysia',
    category: 'attraction',
  }

  const rest = [...argv]
  while (rest.length) {
    const token = rest.shift()
    if (!token) break

    if (token === '--apply') args.apply = true
    else if (token === '--country') args.country = rest.shift() || 'Malaysia'
    else if (token === '--category') args.category = rest.shift() || 'attraction'
    else if (!args.input) args.input = token
  }

  return args
}

function extractVideoId(input) {
  if (!input) return null
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input

  try {
    const url = new URL(input)
    if (url.hostname.includes('youtu.be')) {
      const id = url.pathname.replace('/', '').trim()
      return id || null
    }

    if (url.hostname.includes('youtube.com')) {
      const v = url.searchParams.get('v')
      if (v) return v
      const parts = url.pathname.split('/').filter(Boolean)
      const embedIdx = parts.findIndex(p => p === 'embed' || p === 'shorts')
      if (embedIdx >= 0 && parts[embedIdx + 1]) return parts[embedIdx + 1]
    }
  } catch {
    return null
  }

  return null
}

async function fetchYoutubeSnippet(videoId, apiKey) {
  const endpoint = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}`
  const res = await fetch(endpoint)
  if (!res.ok) {
    throw new Error(`YouTube API 请求失败: HTTP ${res.status}`)
  }

  const json = await res.json()
  const item = json?.items?.[0]
  if (!item?.snippet) {
    throw new Error('YouTube API 未返回视频信息，请检查链接或 API Key')
  }

  return {
    title: item.snippet.title || '',
    description: item.snippet.description || '',
    publishedAt: item.snippet.publishedAt || null,
    channelTitle: item.snippet.channelTitle || null,
  }
}

async function extractSpotsWithGemini({ geminiApiKey, title, description, country, category, model }) {
  const prompt = `你是旅行内容结构化助手。请从 YouTube 标题和简介中提取景点清单。

要求：
1) 只输出 JSON，不要解释。
2) JSON 结构必须是：
{
  "spots": [
    {
      "name": "英文或原文名，必填",
      "name_cn": "中文名，可空",
      "address_or_query": "可用于地理编码的地址/关键词，可空",
      "description": "一句简介，可空",
      "tags": ["标签1","标签2"],
      "visit_date": "YYYY-MM-DD，可空",
      "region_name": "城市/区域名，可空",
      "country": "国家名，可空",
      "category": "food 或 attraction，可空",
      "confidence": 0.0
    }
  ]
}
3) 如果无法确认，不要乱编地址，address_or_query 可留空。
4) 尽量提取所有景点，不要漏掉。
5) 默认 country=${country}，默认 category=${category}。

视频标题：${title}

视频简介：
${description}`

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiApiKey)}`

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Gemini 请求失败: HTTP ${res.status} ${text}`)
  }

  const json = await res.json()
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini 未返回内容')

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Gemini 返回不是合法 JSON，请重试')
  }

  const spots = Array.isArray(parsed?.spots) ? parsed.spots : []
  return spots
}

function extractSpotsByRules({ title, description, country, category }) {
  const lines = String(description || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)

  const cleaned = []
  for (const line of lines) {
    // 去掉时间戳前缀，例如 00:35 xxx
    const noTs = line.replace(/^\d{1,2}:\d{2}(?::\d{2})?\s*[-–—.]?\s*/, '').trim()
    // 去掉项目符号
    const noBullet = noTs.replace(/^[-*•]\s*/, '').trim()

    // 过滤明显非景点行
    const lower = noBullet.toLowerCase()
    if (!noBullet) continue
    if (lower.includes('subscribe') || lower.includes('follow') || lower.includes('instagram')) continue
    if (lower.includes('business enquiry') || lower.includes('copyright')) continue
    if (/^https?:\/\//i.test(noBullet)) continue
    if (noBullet.length < 3) continue

    cleaned.push(noBullet)
  }

  // 取前 30 条，避免噪音太多
  const uniq = Array.from(new Set(cleaned)).slice(0, 30)

  return uniq.map((name) => ({
    name,
    name_cn: null,
    address_or_query: `${name} ${country}`,
    description: `From YouTube: ${title}`,
    tags: ['youtube-import'],
    visit_date: null,
    region_name: null,
    country,
    category,
    confidence: 0.35,
  }))
}

async function geocode(query) {
  if (!query) return null

  // 风险点：Nominatim 速率限制严格，这里串行调用+小延迟
  const endpoint = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`
  const res = await fetch(endpoint, {
    headers: { 'User-Agent': 'jnqjourney-importer/1.0' },
  })

  if (!res.ok) return null
  const json = await res.json()
  if (!Array.isArray(json) || !json[0]) return null

  const item = json[0]
  return {
    latitude: Number(item.lat),
    longitude: Number(item.lon),
    displayName: item.display_name || null,
  }
}

function normalizeTags(tags) {
  if (!tags) return []
  if (Array.isArray(tags)) return tags.map(t => String(t).trim()).filter(Boolean)
  return String(tags)
    .split(/[,，]/)
    .map(s => s.trim())
    .filter(Boolean)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  const cwd = process.cwd()
  loadEnvLocal(path.join(cwd, '.env.local'))

  const { input, apply, country, category } = parseArgs(process.argv.slice(2))
  if (!input) {
    console.log('用法:')
    console.log('  npm run import:youtube:gemini -- "https://youtu.be/xxxx"')
    console.log('  npm run import:youtube:gemini -- "https://youtu.be/xxxx" --apply')
    console.log('  npm run import:youtube:gemini -- "https://youtu.be/xxxx" --country Malaysia --category food')
    process.exit(1)
  }

  const videoId = extractVideoId(input)
  if (!videoId) {
    throw new Error('无法解析 YouTube videoId，请检查链接')
  }

  const youtubeApiKey = process.env.YOUTUBE_API_KEY
  const geminiApiKey = process.env.GEMINI_API_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!youtubeApiKey) throw new Error('缺少 YOUTUBE_API_KEY')
  if (!geminiApiKey) throw new Error('缺少 GEMINI_API_KEY')
  if (!supabaseUrl) throw new Error('缺少 NEXT_PUBLIC_SUPABASE_URL')
  if (!serviceRoleKey) throw new Error('缺少 SUPABASE_SERVICE_ROLE_KEY')

  const preferredModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
  const fallbackModels = [preferredModel, 'gemini-2.0-flash-lite', 'gemini-1.5-flash-latest']

  console.log(`\n[1/5] 获取 YouTube 视频信息: ${videoId}`)
  const snippet = await fetchYoutubeSnippet(videoId, youtubeApiKey)

  console.log(`[2/5] Gemini 抽取景点中...`)
  let extracted = []
  let lastErr = null

  for (const model of fallbackModels) {
    try {
      extracted = await extractSpotsWithGemini({
        geminiApiKey,
        title: snippet.title,
        description: snippet.description,
        country,
        category,
        model,
      })
      console.log(`Gemini 模型: ${model}`)
      lastErr = null
      break
    } catch (err) {
      lastErr = err
      const msg = err?.message || ''
      if (msg.includes('HTTP 404')) {
        console.log(`模型 ${model} 不可用，尝试下一个...`)
        continue
      }
      if (msg.includes('HTTP 429') || msg.includes('RESOURCE_EXHAUSTED')) {
        console.log(`模型 ${model} 配额不足（429），尝试下一个...`)
        continue
      }
      throw err
    }
  }

  if (lastErr || !extracted.length) {
    console.log('Gemini 当前不可用或未抽到结果，自动降级到规则提取模式...')
    extracted = extractSpotsByRules({
      title: snippet.title,
      description: snippet.description,
      country,
      category,
    })
  }

  if (!extracted.length) {
    console.log('未抽取到景点，建议检查视频简介格式。')
    process.exit(0)
  }

  console.log(`[3/5] 地理编码（Nominatim）中...`)
  const enriched = []
  for (const item of extracted) {
    const name = (item?.name || '').trim()
    if (!name) continue

    const query = item.address_or_query || `${name} ${item.region_name || ''} ${item.country || country}`
    const geo = await geocode(query)
    await sleep(300) // 降低请求频率，避免触发限制

    enriched.push({
      name,
      name_cn: item?.name_cn?.trim?.() || null,
      category: item?.category || category,
      region_name: item?.region_name || null,
      country: item?.country || country,
      address: item?.address_or_query || geo?.displayName || null,
      latitude: geo?.latitude ?? null,
      longitude: geo?.longitude ?? null,
      description: item?.description || null,
      tags: normalizeTags(item?.tags),
      visit_date: item?.visit_date || null,
      video_url: `https://youtu.be/${videoId}`,
      facebook_video_url: null,
      image_url: null,
      images: [],
      status: 'active',
      confidence: Number(item?.confidence || 0),
    })
  }

  const pendingDir = path.join(cwd, 'data', 'pending-imports')
  fs.mkdirSync(pendingDir, { recursive: true })
  const pendingPath = path.join(pendingDir, `youtube_${videoId}.json`)
  fs.writeFileSync(pendingPath, JSON.stringify({
    source: {
      type: 'youtube',
      input,
      videoId,
      title: snippet.title,
      publishedAt: snippet.publishedAt,
      channelTitle: snippet.channelTitle,
    },
    country,
    category,
    extractedCount: extracted.length,
    normalizedCount: enriched.length,
    items: enriched,
  }, null, 2), 'utf8')

  console.log(`[4/5] 已生成待确认文件: ${pendingPath}`)

  if (!apply) {
    console.log('\n未执行入库（安全模式）。')
    console.log('确认内容后执行：')
    console.log(`npm run import:youtube:gemini -- "${input}" --apply`)
    process.exit(0)
  }

  console.log('[5/5] 入库中...')
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  // 预加载 regions，减少请求次数
  const { data: regions, error: regionErr } = await supabase
    .from('regions')
    .select('id,name,country')

  if (regionErr) throw regionErr

  const regionMap = new Map()
  for (const r of regions || []) {
    regionMap.set(`${(r.name || '').toLowerCase()}__${(r.country || '').toLowerCase()}`, r.id)
    regionMap.set(`${(r.name || '').toLowerCase()}__`, r.id)
  }

  const payload = enriched
    .filter(x => x.latitude !== null && x.longitude !== null)
    .map(x => {
      const keyWithCountry = `${(x.region_name || '').toLowerCase()}__${(x.country || '').toLowerCase()}`
      const keyNoCountry = `${(x.region_name || '').toLowerCase()}__`
      const region_id = x.region_name ? (regionMap.get(keyWithCountry) ?? regionMap.get(keyNoCountry) ?? null) : null

      return {
        name: x.name,
        name_cn: x.name_cn,
        category: x.category,
        address: x.address,
        latitude: x.latitude,
        longitude: x.longitude,
        region_id,
        video_url: x.video_url,
        facebook_video_url: x.facebook_video_url,
        image_url: x.image_url,
        images: x.images,
        description: x.description,
        tags: x.tags,
        visit_date: x.visit_date,
        opening_hours: null,
        status: x.status,
      }
    })

  if (!payload.length) {
    console.log('没有可入库数据（可能地理编码失败）。请先检查 pending 文件。')
    process.exit(0)
  }

  const { error: insertErr } = await supabase.from('locations').insert(payload)
  if (insertErr) throw insertErr

  console.log(`✅ 入库完成：${payload.length} 条`) 
}

main().catch((err) => {
  console.error('❌ 执行失败:', err.message)
  process.exit(1)
})
