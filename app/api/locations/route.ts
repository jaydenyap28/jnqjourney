import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[public-locations] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.')
    return NextResponse.json(
      { error: 'Public data configuration is unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const [{ data: locations, error: locationsError }, { data: regions, error: regionsError }] = await Promise.all([
    supabase
      .from('locations')
      .select('*, regions:region_id(id,name,name_cn,country,description,image_url,code,parent_id)')
      .eq('status', 'active')
      .order('id', { ascending: false }),
    supabase
      .from('regions')
      .select('id,name,name_cn,country,description,image_url,code,parent_id')
      .order('id', { ascending: true }),
  ])

  if (locationsError || regionsError) {
    console.error('[public-locations]', {
      locations: locationsError?.message || null,
      regions: regionsError?.message || null,
    })
    return NextResponse.json(
      { error: 'Unable to load travel spots right now.' },
      { status: 502, headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
    )
  }

  return NextResponse.json(
    { locations: locations || [], regions: regions || [] },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
  )
}
