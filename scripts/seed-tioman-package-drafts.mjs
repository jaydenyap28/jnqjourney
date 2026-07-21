import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnvFile(filePath) {
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*([^#=]+)=(.*)$/))
      .filter(Boolean)
      .map((match) => [match[1].trim(), match[2].trim().replace(/^['"]|['"]$/g, '')])
  )
}

const env = { ...loadEnvFile('.env.local'), ...process.env }
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) throw new Error('Missing Supabase configuration.')

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const tiomanCover = 'https://pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev/locations/2026-05-31/273-1775533061061-35d413c4-ae3c-434d-a273-1c3a33b543eb-pulau-tio-06c7974f-259c-4fbe-bfae-88c0802761a9.webp'

const common = {
  destination: 'Pulau Tioman, Pahang, Malaysia',
  duration: '3天2夜',
  cover_image: tiomanCover,
  video_url: null,
  featured: false,
  related_location_ids: [],
  related_guide_slugs: [],
  related_note_slugs: [],
  affiliate_link_ids: [],
  status: 'draft',
  published_at: null,
}

const packages = [
  {
    ...common,
    slug: 'tioman-aman-resort-3d2n',
    title_zh: 'Aman Tioman Resort 3天2夜浮潜配套 2026',
    title_en: 'Aman Tioman Resort 3D2N Snorkeling Package 2026',
    short_description: '适合想住得更舒适一点，并希望把船票、住宿、餐食和一次浮潜安排好的旅客。',
    full_description: '这项 2026 Aman Tioman Resort 3天2夜配套整理自旅行社资料，包含指定船票、住宿、餐食和浮潜安排。房况、船班、晚餐形式与最终行程须由旅行社或 Resort 确认。',
    highlights: ['每人 RM690 起，按房型与人数计算', 'Mersing 或 Tanjung Gemok 来回船票包含', '2 晚冷气住宿与指定餐食', '第 2 天出海浮潜'],
    suitable_for: ['想住得更舒适一点的旅客', '希望船票、住宿、餐食和浮潜一次安排好的旅客'],
    itinerary_days: [
      { title: '抵达与入住', summary: '出发码头、船班与入住时间以旅行社或 Resort 最终确认资料为准。' },
      { title: '出海浮潜', summary: '海报列明第 2 天安排出海浮潜；实际活动受天气、海况和 Resort 安排影响。' },
      { title: '退房与返程', summary: '返程船班与退房安排以最终确认资料为准。' },
    ],
    included_items: ['Mersing 或 Tanjung Gemok 来回船票', '2 晚冷气住宿', '2 份早餐', '2 份晚餐（Set、Buffet 或 BBQ 以最终安排为准）', '1 份午餐', '第 2 天出海浮潜', '浮潜面镜 Mask', '救生衣 Life Jacket'],
    excluded_items: ['Marine Park Fee：马来西亚人 RM5／外国人 RM30', 'Tourism Tax：RM10／房／晚', 'Pahang Tax：RM3／房／晚', '旅游保险不包括', '外国人船票附加费：RM50／人', '周末、学校假期或公共假期可能有附加费'],
    notes: ['儿童年龄区间需要向旅行社确认：海报同时列出儿童 4–11 岁与 2–4 岁，4 岁存在重叠。', '儿童年龄及收费以旅行社最终确认为准。', '原始竖版配套海报待上传至 R2 后才能通过发布检查。'],
    price_display: '每人 RM690 起',
    price_note: '价格有效至 15 Nov 2026。价格与房况可能调整，最终价格、船班、房型和行程以旅行社或 Resort 最终确认为准。',
    whatsapp_message: '你好，我从 JnQ Journey 看到 Aman Tioman Resort 3天2夜浮潜配套，想查询最新价格和房况。\n\n预计日期：\n成人：\n儿童及年龄：\n出发码头：\n房间数量：\n其他要求：\n\n来源：JNQ-TIOMAN-AMAN',
    source_code: 'JNQ-TIOMAN-AMAN',
    sort_order: 20,
    seo_title: 'Aman Tioman Resort 3天2夜浮潜配套 2026｜JnQ Journey',
    seo_description: 'Aman Tioman Resort 2026年3天2夜浮潜配套，每人 RM690 起；船票、住宿、餐食与浮潜安排以旅行社最终确认为准。',
  },
  {
    ...common,
    slug: 'tioman-paya-beach-resort-3d2n',
    title_zh: 'Paya Beach Resort 3天2夜浮潜配套 2026',
    title_en: 'Paya Beach Resort 3D2N Snorkeling Package 2026',
    short_description: '适合预算型海岛小旅行、情侣、家庭和朋友小团体。',
    full_description: '这项 2026 Paya Beach Resort 3天2夜配套整理自旅行社资料，含指定船票、住宿、餐食和 Renggis Island 与 Marine Park 浮潜。Yoga by the Sea 与 Eco Education & Survival Program 是否进行，以 Resort、天气与海况安排为准。',
    highlights: ['每人 RM509 起，按房型与人数计算', 'Mersing 或 Tanjung Gemok 来回船票包含', 'Renggis Island 与 Marine Park 浮潜', 'Yoga 与 Eco Program 以 Resort 安排为准'],
    suitable_for: ['预算型海岛小旅行', '情侣、家庭和朋友小团体'],
    itinerary_days: [
      { title: '抵达与入住', summary: '出发码头、船班与入住时间以旅行社或 Resort 最终确认资料为准。' },
      { title: '浮潜与 Resort 活动', summary: '海报列明 Renggis Island 与 Marine Park 浮潜；Yoga 与 Eco Program 是否进行，以 Resort、天气和海况安排为准。' },
      { title: '退房与返程', summary: '返程船班与退房安排以最终确认资料为准。' },
    ],
    included_items: ['Mersing 或 Tanjung Gemok 来回船票', '2 晚冷气住宿', '2 份早餐', '2 份晚餐', '1 份午餐', 'Renggis Island 与 Marine Park 浮潜', '浮潜面镜 Mask', '救生衣 Life Jacket', 'Yoga by the Sea（以 Resort 安排为准）', 'Eco Education & Survival Program（以 Resort 安排为准）'],
    excluded_items: ['Marine Park Fee：马来西亚人 RM5／外国人 RM30', 'Tourism Tax：RM10／房／晚', 'Pahang Tax：RM3／房／晚', '旅游保险不包括', '外国人船票附加费：RM50／人', '周末、学校假期或公共假期可能有附加费'],
    notes: ['Yoga by the Sea 与 Eco Education & Survival Program 不保证每日安排。', '活动是否进行会受 Resort、天气与海况影响。', '原始竖版配套海报待上传至 R2 后才能通过发布检查。'],
    price_display: '每人 RM509 起',
    price_note: '价格有效至 14 Nov 2026。价格与房况可能调整，最终价格、船班、房型和行程以旅行社或 Resort 最终确认为准。',
    whatsapp_message: '你好，我从 JnQ Journey 看到 Paya Beach Resort 3天2夜浮潜配套，想查询最新价格和房况。\n\n预计日期：\n成人：\n儿童及年龄：\n出发码头：\n房间数量：\n其他要求：\n\n来源：JNQ-TIOMAN-PAYA',
    source_code: 'JNQ-TIOMAN-PAYA',
    sort_order: 21,
    seo_title: 'Paya Beach Resort 3天2夜浮潜配套 2026｜JnQ Journey',
    seo_description: 'Paya Beach Resort 2026年3天2夜浮潜配套，每人 RM509 起；Renggis Island 与 Marine Park 浮潜安排以旅行社或 Resort 最终确认为准。',
  },
  {
    ...common,
    slug: 'tioman-barat-resort-3d2n',
    title_zh: 'The Barat Tioman 3天2夜浮潜配套 2026',
    title_en: 'The Barat Tioman 3D2N Snorkeling Package 2026',
    short_description: '房型选择较多，适合情侣、家庭和朋友团体；报价单位为每房，不是每人。',
    full_description: '这项 2026 Peak Season The Barat Tioman 3天2夜配套整理自旅行社资料。价格按房计算，船票另计，包含 Tekek Jetty 与 Resort 来回接送。房型、房况、税费、船票和最终价格须重新确认。',
    highlights: ['双人房每房 RM1,440 起，不是每人价格', '房型选择较多', '船票另计', 'Tekek Jetty 来回接送'],
    suitable_for: ['情侣', '家庭', '朋友团体', '希望选择不同房型的旅客'],
    itinerary_days: [
      { title: '抵达与入住', summary: 'Tekek Jetty 与 Resort 接送、船票及入住时间以旅行社或 Resort 最终确认资料为准。' },
      { title: '出海浮潜', summary: '海报列明一次出海浮潜；实际安排受天气、海况和 Resort 最终确认影响。' },
      { title: '退房与返程', summary: '返程船票和退房安排以最终确认资料为准。' },
    ],
    included_items: ['2 晚冷气住宿', '2 份早餐', '2 份晚餐券', '1 份午餐券', '1 次出海浮潜', 'Tekek Jetty 与 Resort 来回接送'],
    excluded_items: ['6 岁及以上按成人计算', '6 岁以下同床同餐免费', '儿童浮潜可加购：RM120／人', 'Tourism Tax（非马来西亚人）：RM10／房／晚', 'Pahang Tax：RM3／房', 'Marine Park Fee：马来西亚人 RM5／外国人 RM30', '船票另计：成人 RM125／儿童 RM115', '外国人附加费：RM50／人'],
    notes: ['价格单位为每房，不是每人。', '海报列示 Pahang Tax 为 RM3／房，未注明每晚；税费计算方式与最新金额以旅行社或 Resort 最终确认为准。', '原始竖版配套海报待上传至 R2 后才能通过发布检查。'],
    price_display: '双人房每房 RM1,440 起',
    price_note: '2026 Peak Season 价格参考。房型、房况、税费、船票及最终价格须重新确认；税费计算方式和最新金额以旅行社或 Resort 最终确认为准。',
    whatsapp_message: '你好，我从 JnQ Journey 看到 The Barat Tioman 3天2夜浮潜配套，想查询最新房型和价格。\n\n预计日期：\n成人：\n儿童及年龄：\n想要房型：\n房间数量：\n是否需要船票：\n其他要求：\n\n来源：JNQ-TIOMAN-BARAT',
    source_code: 'JNQ-TIOMAN-BARAT',
    sort_order: 22,
    seo_title: 'The Barat Tioman 3天2夜配套 2026｜房型价格｜JnQ Journey',
    seo_description: 'The Barat Tioman 2026 Peak Season 3天2夜浮潜配套，双人房每房 RM1,440 起；船票另计，房型与最终价格须重新确认。',
  },
]

const { data: existingRegion, error: readRegionError } = await supabase
  .from('regions')
  .select('*')
  .eq('name', 'Pulau Tioman')
  .eq('country', 'Malaysia')
  .maybeSingle()
if (readRegionError) throw readRegionError

const regionPayload = {
  name: 'Pulau Tioman',
  name_cn: '刁曼岛',
  slug: 'pulau-tioman',
  country: 'Malaysia',
  description: '刁曼岛位于马来西亚彭亨外海，适合海岛住宿、浮潜与轻松度假行程。',
  image_url: tiomanCover,
  updated_at: new Date().toISOString(),
}

const { data: region, error: regionError } = existingRegion
  ? await supabase.from('regions').update(regionPayload).eq('id', existingRegion.id).select('*').single()
  : await supabase.from('regions').insert(regionPayload).select('*').single()
if (regionError) throw regionError

const { error: locationError } = await supabase.from('locations').update({ region_id: region.id }).eq('id', 273)
if (locationError) throw locationError

const output = []
for (const item of packages) {
  const { data: existing, error: existingError } = await supabase
    .from('travel_packages')
    .select('id,gallery,cover_image')
    .eq('slug', item.slug)
    .maybeSingle()
  if (existingError) throw existingError

  const payload = {
    ...item,
    region_id: region.id,
    gallery: existing?.gallery || [],
    cover_image: existing?.cover_image || item.cover_image,
    canonical_url: `https://www.jnqjourney.com/packages/${item.slug}`,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = existing
    ? await supabase.from('travel_packages').update(payload).eq('id', existing.id).select('id,slug,status,region_id,cover_image,gallery').single()
    : await supabase.from('travel_packages').insert(payload).select('id,slug,status,region_id,cover_image,gallery').single()
  if (error) throw error
  output.push(data)
}

console.log(JSON.stringify({ region: { id: region.id, slug: region.slug }, packages: output }, null, 2))
