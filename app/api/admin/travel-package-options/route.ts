import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { requireAdminRequest } from '@/lib/server/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null
}

function text(value: unknown, max = 4000) { return String(value || '').trim().slice(0, max) }
function strings(value: unknown, limit = 100) { return Array.isArray(value) ? value.map((entry) => text(entry, 1000)).filter(Boolean).slice(0, limit) : [] }
function images(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((entry, index) => ({ url: text((entry as any)?.url || entry, 2000), alt: text((entry as any)?.alt, 300), caption: text((entry as any)?.caption, 500), sort_order: Number((entry as any)?.sort_order ?? index) || index })).filter((entry) => entry.url)
}

function image(value: unknown) {
  if (!value) return null
  const entry = typeof value === 'string' ? { url: value } : value as any
  const url = text(entry?.url, 2000)
  if (!url) return null
  return {
    url,
    alt: text(entry?.alt, 300),
    caption: text(entry?.caption, 500),
    sort_order: Number(entry?.sort_order ?? 0) || 0,
  }
}
function priceRows(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((entry) => ({ label: text((entry as any)?.label, 300), price: text((entry as any)?.price, 300) })).filter((entry) => entry.label && entry.price).slice(0, 40)
}
function itineraryDays(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((entry) => ({
    title: text((entry as any)?.title, 300),
    summary: text((entry as any)?.summary, 1200),
    items: strings((entry as any)?.items, 40),
  })).filter((entry) => entry.title || entry.summary || entry.items.length).slice(0, 10)
}

export async function GET(request: Request) {
  const auth = await requireAdminRequest(request)
  if (!auth.ok) return auth.response
  const packageId = Number(new URL(request.url).searchParams.get('packageId'))
  const supabase = getAdminClient()
  if (!supabase || !Number.isInteger(packageId) || packageId <= 0) return NextResponse.json({ error: 'Invalid package.' }, { status: 400 })
  const { data, error } = await supabase.from('travel_package_options').select('*').eq('package_id', packageId).order('sort_order')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const optionIds = (data || []).map((option) => option.id)
  const internalResult = optionIds.length
    ? await supabase.from('travel_package_option_internal').select('option_id,supplier_ref,supplier_package_name,internal_notes').in('option_id', optionIds)
    : { data: [], error: null }
  if (internalResult.error) return NextResponse.json({ error: internalResult.error.message }, { status: 500 })
  const internalById = new Map((internalResult.data || []).map((entry) => [Number(entry.option_id), entry]))
  const options = (data || []).map((option) => ({ ...option, ...(internalById.get(Number(option.id)) || {}) }))
  return NextResponse.json({ options })
}

export async function POST(request: Request) {
  const auth = await requireAdminRequest(request)
  if (!auth.ok) return auth.response
  const supabase = getAdminClient()
  if (!supabase) return NextResponse.json({ error: 'Missing database configuration.' }, { status: 500 })
  const body = await request.json()
  const packageId = Number(body.package_id)
  const id = Number(body.id)
  const priceUnit = ['person', 'room', 'package', 'group'].includes(body.price_unit) ? body.price_unit : ''
  const status = ['active', 'inactive', 'archived'].includes(body.status) ? body.status : 'inactive'
  const gallery = images(body.gallery)
  const brochureImage = image(body.brochure_image) || gallery[0] || null
  const payload = {
    package_id: packageId,
    slug: text(body.slug, 160).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, ''),
    name_zh: text(body.name_zh, 240), name_en: text(body.name_en, 240) || null,
    duration: text(body.duration, 80) || null,
    accommodation_name: text(body.accommodation_name, 240), accommodation_type: text(body.accommodation_type, 120) || null,
    village_name: text(body.village_name, 120) || null, short_description: text(body.short_description, 1000) || null,
    full_description: text(body.full_description, 10000) || null,
    cover_image: text(body.cover_image, 2000) || null,
    hero_image: text(body.hero_image, 2000) || null,
    hero_image_mobile: text(body.hero_image_mobile, 2000) || null,
    hero_image_contains_text: Boolean(body.hero_image_contains_text),
    highlights: strings(body.highlights), suitable_for: strings(body.suitable_for), itinerary_days: itineraryDays(body.itinerary_days),
    price_from: Number.isFinite(Number(body.price_from)) ? Number(body.price_from) : null,
    price_currency: text(body.price_currency, 12) || 'MYR', price_unit: priceUnit,
    price_display: text(body.price_display, 240), price_note: text(body.price_note, 1000) || null, price_rows: priceRows(body.price_rows),
    included_items: strings(body.included_items), excluded_items: strings(body.excluded_items), notes: strings(body.notes),
    validity_label: text(body.validity_label, 240) || null, valid_until: text(body.valid_until, 20) || null,
    brochure_image: brochureImage, gallery, whatsapp_message: text(body.whatsapp_message, 2000) || null,
    source_code: text(body.source_code, 160) || null,
    seo_title: text(body.seo_title, 240) || null,
    seo_description: text(body.seo_description, 500) || null,
    canonical_url: text(body.canonical_url, 500) || null,
    related_location_ids: strings(body.related_location_ids).map(Number).filter((value) => Number.isInteger(value) && value > 0),
    featured: Boolean(body.featured),
    sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0, status,
    updated_at: new Date().toISOString(),
  }
  const { data: parentPackage, error: parentError } = await supabase.from('travel_packages').select('slug,title_zh').eq('id', packageId).maybeSingle()
  if (parentError) return NextResponse.json({ error: parentError.message }, { status: 500 })
  const parentSlug = String(parentPackage?.slug || '')
  const supplierRef = text(body.supplier_ref, 120) || null
  const supplierPackageName = text(body.supplier_package_name, 240) || null
  const internalNotes = strings(body.internal_notes)

  const missing = []
  if (!Number.isInteger(packageId) || packageId <= 0) missing.push('package')
  if (!payload.slug || !payload.name_zh || !payload.accommodation_name) missing.push('name')
  if (!priceUnit || !payload.price_display) missing.push('price unit and display')
  if (!payload.included_items.length || !payload.excluded_items.length) missing.push('included and excluded items')
  if (!payload.source_code || !payload.whatsapp_message || !payload.validity_label) missing.push('WhatsApp source and validity')
  // The public Tioman detail page always displays the final-confirmation notice.
  // Option notes must be present, but existing supplier wording must not block edits.
  if (!payload.notes.length) missing.push('option notes')
  if (payload.status === 'active' && parentSlug === 'tioman-3d2n' && !gallery[0]?.url) missing.push('brochure image')
  if (payload.status === 'active' && parentSlug === 'batam-3d2n' && !payload.itinerary_days.length) missing.push('Batam itinerary')
  if (payload.status === 'active' && parentSlug === 'hainan') {
    if (!payload.duration) missing.push('Hainan duration')
    if (!payload.itinerary_days.length) missing.push('Hainan itinerary')
    if (!payload.cover_image && !gallery[0]?.url) missing.push('Hainan cover image')
    if (!payload.full_description) missing.push('Hainan full description')
    if (!payload.seo_title || !payload.seo_description) missing.push('Hainan SEO')
  }
  if (payload.slug === 'the-barat-tioman' && payload.price_unit !== 'room') missing.push('The Barat room unit')
  if (payload.slug === 'aman-tioman' && !payload.notes.some((note) => note.includes('年龄区间'))) missing.push('Aman child age overlap warning')
  if (missing.length) return NextResponse.json({ error: `Cannot save option: ${missing.join(', ')}` }, { status: 400 })
  const query = Number.isInteger(id) && id > 0 ? supabase.from('travel_package_options').update(payload).eq('id', id).eq('package_id', packageId) : supabase.from('travel_package_options').insert(payload)
  const { data, error } = await query.select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { error: internalError } = await supabase.from('travel_package_option_internal').upsert({
    option_id: data.id,
    supplier_ref: supplierRef,
    supplier_package_name: supplierPackageName,
    internal_notes: internalNotes,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'option_id' })
  if (internalError) return NextResponse.json({ error: internalError.message }, { status: 500 })

  return NextResponse.json({ option: { ...data, supplier_ref: supplierRef, supplier_package_name: supplierPackageName, internal_notes: internalNotes } })
}

export async function DELETE(request: Request) {
  const auth = await requireAdminRequest(request)
  if (!auth.ok) return auth.response
  const supabase = getAdminClient()
  const body = await request.json()
  if (!supabase || !Number.isInteger(Number(body.id))) return NextResponse.json({ error: 'Invalid option.' }, { status: 400 })
  const { error } = await supabase.from('travel_package_options').delete().eq('id', Number(body.id))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
