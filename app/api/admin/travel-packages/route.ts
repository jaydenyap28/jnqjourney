import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { requireAdminRequest } from '@/lib/server/admin-auth'
import { isTiomanPackage, isTiomanRegion } from '@/lib/tioman-packages'
import { packagePublicationResponse, invalidatePackagePages } from '@/lib/server/package-publication'
import { packageUsesOptions, isHainanPackage } from '@/lib/package-presentation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function cleanString(value: unknown, max = 4000) {
  return String(value || '').trim().slice(0, max)
}

function cleanStringArray(value: unknown, limit = 100) {
  return Array.isArray(value) ? value.map((item) => cleanString(item, 1000)).filter(Boolean).slice(0, limit) : []
}

function cleanGallery(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((item, index) => {
      if (typeof item === 'string') return { url: cleanString(item, 2000), alt: '', caption: '', sort_order: index }
      if (!item || typeof item !== 'object') return null
      const image = item as Record<string, unknown>
      return {
        url: cleanString(image.url, 2000),
        alt: cleanString(image.alt, 300),
        caption: cleanString(image.caption, 500),
        sort_order: Number.isFinite(Number(image.sort_order)) ? Number(image.sort_order) : index,
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item?.url))
    .sort((left, right) => left.sort_order - right.sort_order)
    .slice(0, 30)
}

export async function GET(request: Request) {
  const auth = await requireAdminRequest(request)
  if (!auth.ok) return auth.response
  const supabase = getAdminClient()
  if (!supabase) return NextResponse.json({ error: 'Missing server database configuration.' }, { status: 500 })

  const id = Number(new URL(request.url).searchParams.get('id') || 0)
  const packagesQuery = id > 0
    ? supabase.from('travel_packages').select('*').eq('id', id)
    : supabase.from('travel_packages').select('*').order('updated_at', { ascending: false })
  const [packagesResult, regionsResult] = await Promise.all([
    packagesQuery,
    supabase.from('regions').select('id,name,name_cn,country').order('country').order('name'),
  ])
  const error = packagesResult.error || regionsResult.error
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (id > 0 && !(packagesResult.data || []).length) {
    return NextResponse.json({ error: '找不到这项旅游配套。' }, { status: 404 })
  }
  const selectedPackage = id > 0 ? packagesResult.data?.[0] || null : null
  let options: unknown[] = []
  if (selectedPackage) {
    const { data, error: comparisonError } = await supabase
      .from('travel_package_options')
      .select('*')
      .eq('package_id', selectedPackage.id)
      .order('sort_order', { ascending: true })
    if (comparisonError) return NextResponse.json({ error: comparisonError.message }, { status: 500 })
    options = data || []
  }

  return NextResponse.json({
    packages: packagesResult.data || [],
    package: selectedPackage || undefined,
    options,
    regions: regionsResult.data || [],
  })
}

export async function POST(request: Request) {
  const auth = await requireAdminRequest(request)
  if (!auth.ok) return auth.response
  const supabase = getAdminClient()
  if (!supabase) return NextResponse.json({ error: 'Missing server database configuration.' }, { status: 500 })

  const body = await request.json()
  if (body.action === 'revalidate-public') {
    const id = Number(body.id)
    if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({error:'Invalid package.'},{status:400})
    const {data:item,error} = await supabase.from('travel_packages').select('id,slug').eq('id',id).maybeSingle()
    const deletedSlug = !item && typeof body.deletedSlug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.deletedSlug) ? body.deletedSlug : undefined
    if (error || (!item && !deletedSlug)) return NextResponse.json({error:'Package unavailable.'},{status:error?500:404})
    try {
      const previousSlug = typeof body.previousSlug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.previousSlug) ? body.previousSlug : undefined
      invalidatePackagePages(item?.slug || deletedSlug!,previousSlug,body.scope !== 'detail')
      return NextResponse.json({ok:true,publication:{state:'invalidated',verified:false}},{headers:{'Cache-Control':'private, no-store'}})
    } catch { return NextResponse.json({ok:false,error:'公开缓存刷新失败，请稍后仅重试刷新。'},{status:503}) }
  }
  const status = ['draft', 'published', 'archived'].includes(body.status) ? body.status : 'draft'
  const id = Number.isInteger(Number(body.id)) && Number(body.id) > 0 ? Number(body.id) : null
  const slug = cleanString(body.slug, 160).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  const gallery = cleanGallery(body.gallery)
  const payload = {
    ...(id ? { id } : {}),
    slug,
    title_zh: cleanString(body.title_zh, 240),
    title_en: cleanString(body.title_en, 240) || null,
    destination: cleanString(body.destination, 160) || null,
    region_id: Number(body.region_id) > 0 ? Number(body.region_id) : null,
    duration: cleanString(body.duration, 80) || null,
    short_description: cleanString(body.short_description, 1000) || null,
    full_description: cleanString(body.full_description, 10000) || null,
    cover_image: cleanString(body.cover_image, 2000) || null,
    gallery,
    video_url: cleanString(body.video_url, 2000) || null,
    highlights: cleanStringArray(body.highlights),
    suitable_for: cleanStringArray(body.suitable_for),
    itinerary_days: Array.isArray(body.itinerary_days) ? body.itinerary_days.slice(0, 30) : [],
    included_items: cleanStringArray(body.included_items),
    excluded_items: cleanStringArray(body.excluded_items),
    notes: cleanStringArray(body.notes),
    price_display: cleanString(body.price_display, 240) || null,
    price_note: cleanString(body.price_note, 1000) || null,
    whatsapp_message: cleanString(body.whatsapp_message, 2000) || null,
    source_code: cleanString(body.source_code, 160) || null,
    status,
    featured: Boolean(body.featured),
    sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
    seo_title: cleanString(body.seo_title, 240) || null,
    seo_description: cleanString(body.seo_description, 500) || null,
    canonical_url: cleanString(body.canonical_url, 500) || null,
    related_location_ids: cleanStringArray(body.related_location_ids).map(Number).filter((value) => Number.isInteger(value) && value > 0),
    related_guide_slugs: cleanStringArray(body.related_guide_slugs),
    related_note_slugs: cleanStringArray(body.related_note_slugs),
    affiliate_link_ids: cleanStringArray(body.affiliate_link_ids).map(Number).filter((value) => Number.isInteger(value) && value > 0),
    updated_at: new Date().toISOString(),
    published_at: status === 'published' ? cleanString(body.published_at) || new Date().toISOString() : null,
  }

  if (!payload.slug || !payload.title_zh) {
    return NextResponse.json({ error: 'Slug 和中文标题为必填项。' }, { status: 400 })
  }

  const { data: slugOwner, error: slugError } = await supabase
    .from('travel_packages')
    .select('id')
    .eq('slug', payload.slug)
    .maybeSingle()
  if (slugError) return NextResponse.json({ error: slugError.message }, { status: 500 })
  if (slugOwner && slugOwner.id !== id) {
    return NextResponse.json({ error: '这个页面 Slug 已被其他旅游配套使用。' }, { status: 409 })
  }

  if (status === 'published' || body.action === 'validate') {
    const missing: string[] = []
    const optionPackage = packageUsesOptions(payload)
    let validRegion = false
    if (payload.region_id) {
      const { data: region } = await supabase.from('regions').select('name,name_cn,country').eq('id', payload.region_id).maybeSingle()
      validRegion = Boolean(region)
      if (payload.slug.startsWith('batam-')) {
        validRegion = String(region?.name || '').toLowerCase() === 'batam' && String(region?.country || '').toLowerCase() === 'indonesia'
      }
      if (isTiomanPackage(payload.slug)) validRegion = isTiomanRegion(region)
    }
    if (!validRegion) missing.push('正确地区')
    if (!payload.title_zh) missing.push('标题')
    if (!payload.short_description) missing.push('简短介绍')
    if (!optionPackage && !payload.included_items.length) missing.push('配套包含')
    if (!optionPackage && !payload.excluded_items.length) missing.push('不包含项目')
    if (!payload.whatsapp_message || !payload.source_code) missing.push('WhatsApp CTA')
    if (!payload.cover_image) missing.push('封面图')
    if (!optionPackage && payload.gallery.length < 3) missing.push('至少 3 张实拍图')
    if (!payload.itinerary_days.length) missing.push('行程概览')
    if (optionPackage) {
      if (payload.slug === 'tioman-3d2n' && !payload.price_display) missing.push('主配套价格说明')
      if (payload.slug === 'tioman-3d2n' && (!payload.price_note?.includes('最终') || !payload.price_note.includes('确认'))) missing.push('最终确认说明')
      const { data: activeOptions, error: optionsError } = await supabase
        .from('travel_package_options')
        .select('name_zh,price_unit,price_display,included_items,excluded_items,notes,source_code,whatsapp_message,validity_label,gallery,brochure_image,slug')
        .eq('package_id', id || 0)
        .eq('status', 'active')
      if (optionsError) return NextResponse.json({ error: optionsError.message }, { status: 500 })
      if (!(activeOptions || []).length) missing.push('至少一个 active option')
      if (isHainanPackage(payload) && activeOptions?.length !== 2) missing.push('海南主配套需要两个启用选项')
      for (const option of activeOptions || []) {
        // Final-confirmation language is rendered consistently on the public detail page.
        // Do not reject an otherwise complete option because a supplier uses different wording.
        if (!option.name_zh || !option.price_unit || !option.price_display || !option.source_code || !option.whatsapp_message || !option.validity_label || !option.included_items?.length || !option.excluded_items?.length || !option.notes?.length || (!option.gallery?.[0]?.url && !option.brochure_image?.url)) missing.push(`完整 option：${option.name_zh || option.slug}`)
        if (option.slug === 'the-barat-tioman' && option.price_unit !== 'room') missing.push('The Barat 每房价格单位')
        if (option.slug === 'aman-tioman' && !option.notes?.some((note: string) => note.includes('年龄区间'))) missing.push('Aman 儿童年龄区间提醒')
      }
    }
    if (missing.length) {
      return NextResponse.json({ error: `暂时无法发布，请先补齐：${missing.join('、')}。` }, { status: 400 })
    }
  }

  if (body.action === 'validate') {
    return NextResponse.json({ ok: true, message: '发布检查通过。' })
  }

  let previousSlug: string | undefined
  if (id) {
    const {data:previous,error:previousError} = await supabase.from('travel_packages').select('slug').eq('id',id).maybeSingle()
    if (previousError || !previous) return NextResponse.json({error:'配套不存在或无法读取，请重新加载。'},{status:previousError?500:404})
    previousSlug = previous.slug
  }
  const query = id
    ? supabase.from('travel_packages').update(payload).eq('id', id)
    : supabase.from('travel_packages').insert(payload)
  const { data, error } = await query.select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return packagePublicationResponse({package:data},data.id,data.slug,previousSlug)
}

export async function DELETE(request: Request) {
  const auth = await requireAdminRequest(request)
  if (!auth.ok) return auth.response
  const supabase = getAdminClient()
  if (!supabase) return NextResponse.json({ error: 'Missing server database configuration.' }, { status: 500 })

  const body = await request.json()
  const id = Number(body.id)
  const confirmSlug = cleanString(body.confirmSlug, 160)
  if (!Number.isInteger(id) || id <= 0 || !confirmSlug) {
    return NextResponse.json({ error: '缺少删除确认资料。' }, { status: 400 })
  }

  const { data: existing, error: readError } = await supabase
    .from('travel_packages')
    .select('id,slug')
    .eq('id', id)
    .maybeSingle()
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: '找不到这项旅游配套。' }, { status: 404 })
  if (existing.slug !== confirmSlug) return NextResponse.json({ error: '删除确认不匹配。' }, { status: 409 })

  const { data:deleted,error } = await supabase.from('travel_packages').delete().eq('id', id).eq('slug', confirmSlug).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!deleted?.some(row => row.id === id)) return NextResponse.json({error:'没有确认删除任何记录，请重新加载。'},{status:409})
  return packagePublicationResponse({ok:true,deleted:true},id,confirmSlug)
}
