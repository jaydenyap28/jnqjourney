import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { requireAdminRequest } from '@/lib/server/admin-auth'

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

export async function GET(request: Request) {
  const auth = await requireAdminRequest(request)
  if (!auth.ok) return auth.response
  const supabase = getAdminClient()
  if (!supabase) return NextResponse.json({ error: 'Missing server database configuration.' }, { status: 500 })
  const { data, error } = await supabase.from('travel_packages').select('*').order('updated_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ packages: data || [] })
}

export async function POST(request: Request) {
  const auth = await requireAdminRequest(request)
  if (!auth.ok) return auth.response
  const supabase = getAdminClient()
  if (!supabase) return NextResponse.json({ error: 'Missing server database configuration.' }, { status: 500 })

  const body = await request.json()
  const status = ['draft', 'published', 'archived'].includes(body.status) ? body.status : 'draft'
  const payload = {
    ...(Number.isInteger(Number(body.id)) && Number(body.id) > 0 ? { id: Number(body.id) } : {}),
    slug: cleanString(body.slug, 160).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, ''),
    title_zh: cleanString(body.title_zh, 240),
    title_en: cleanString(body.title_en, 240) || null,
    destination: cleanString(body.destination, 160) || null,
    region_id: Number(body.region_id) > 0 ? Number(body.region_id) : null,
    duration: cleanString(body.duration, 80) || null,
    short_description: cleanString(body.short_description, 1000) || null,
    full_description: cleanString(body.full_description, 10000) || null,
    cover_image: cleanString(body.cover_image, 2000) || null,
    gallery: cleanStringArray(body.gallery, 30),
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
    related_location_ids: cleanStringArray(body.related_location_ids).map(Number).filter((id) => Number.isInteger(id) && id > 0),
    related_guide_slugs: cleanStringArray(body.related_guide_slugs),
    related_note_slugs: cleanStringArray(body.related_note_slugs),
    affiliate_link_ids: cleanStringArray(body.affiliate_link_ids).map(Number).filter((id) => Number.isInteger(id) && id > 0),
    updated_at: new Date().toISOString(),
    published_at: status === 'published' ? cleanString(body.published_at) || new Date().toISOString() : null,
  }

  if (!payload.slug || !payload.title_zh) return NextResponse.json({ error: 'Slug and Chinese title are required.' }, { status: 400 })
  if (status === 'published' && (!payload.cover_image || !payload.highlights.length || !payload.itinerary_days.length || !payload.included_items.length)) {
    return NextResponse.json({ error: '发布前必须填写封面、亮点、行程和包含项目。' }, { status: 400 })
  }

  const { data, error } = await supabase.from('travel_packages').upsert(payload).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ package: data })
}
