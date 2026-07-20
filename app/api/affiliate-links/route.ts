import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || (!serviceRoleKey && !anonKey)) return null

  return createClient(supabaseUrl, serviceRoleKey || anonKey || '', {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function parsePositiveInteger(value: string | null) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parseIdList(value: string | null) {
  if (!value) return []
  return value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0)
}

function normalizeJoinedRecord(item: any) {
  return {
    ...item,
    locations: Array.isArray(item?.locations) ? item.locations[0] || null : item?.locations || null,
    regions: Array.isArray(item?.regions) ? item.regions[0] || null : item?.regions || null,
  }
}

export async function GET(request: Request) {
  const supabase = getSupabaseServerClient()
  if (!supabase) {
    return NextResponse.json({ links: [], error: 'Missing Supabase configuration.' }, { status: 500 })
  }

  const url = new URL(request.url)
  const linkIds = parseIdList(url.searchParams.get('ids'))
  const locationId = parsePositiveInteger(url.searchParams.get('locationId'))
  const regionId = parsePositiveInteger(url.searchParams.get('regionId'))
  const noteSlug = String(url.searchParams.get('noteSlug') || '').trim()
  const provider = String(url.searchParams.get('provider') || '').trim()
  const requestedLimit = parsePositiveInteger(url.searchParams.get('limit')) || 18
  const limit = Math.min(Math.max(requestedLimit, 1), 50)

  if (!linkIds.length && !locationId && !regionId && !noteSlug) {
    return NextResponse.json({ links: [] })
  }

  let query = supabase
    .from('affiliate_links')
    .select('*, locations(name, name_cn, image_url, images), regions(name, name_cn, country, image_url)')
    .eq('is_active', true)
    .order('clicks', { ascending: false })

  if (linkIds.length) {
    query = query.in('id', linkIds)
  } else if (noteSlug) {
    query = query.eq('note_slug', noteSlug)
  } else if (locationId && regionId) {
    query = query.or(`location_id.eq.${locationId},region_id.eq.${regionId}`)
  } else if (locationId) {
    query = query.eq('location_id', locationId)
  } else if (regionId) {
    query = query.eq('region_id', regionId)
  }

  if (provider && provider !== 'all') {
    query = query.eq('provider', provider)
  }

  const { data, error } = await query.limit(limit)

  if (error) {
    return NextResponse.json({ links: [], error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    links: (data || []).map(normalizeJoinedRecord),
  })
}
