import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow',
}

export async function GET(_: Request, { params }: { params: { slug: string } }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    console.error('[package-visibility] Supabase configuration is missing')
    return NextResponse.json({ error: 'Visibility check unavailable' }, { status: 503, headers: NO_STORE_HEADERS })
  }

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await supabase
    .from('travel_packages')
    .select('id')
    .eq('slug', params.slug)
    .eq('status', 'published')
    .limit(1)

  if (error) {
    console.error('[package-visibility]', error.message)
    return NextResponse.json({ error: 'Visibility check failed' }, { status: 502, headers: NO_STORE_HEADERS })
  }

  if (!data?.length) return new NextResponse('Not Found', { status: 404, headers: NO_STORE_HEADERS })
  return new NextResponse(null, { status: 204, headers: NO_STORE_HEADERS })
}
