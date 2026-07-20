import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: 'Public data configuration is unavailable.' }, { status: 503 })
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
    console.error('[public-locations]', locationsError?.message || regionsError?.message)
    return NextResponse.json({ error: 'Unable to load travel spots right now.' }, { status: 502 })
  }

  return NextResponse.json({ locations: locations || [], regions: regions || [] })
}
