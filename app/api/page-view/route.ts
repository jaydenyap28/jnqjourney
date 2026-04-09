import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) return null

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function normalizeText(value: unknown, maxLength: number) {
  return String(value || '').trim().slice(0, maxLength)
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdminClient()
  if (!supabase) {
    return NextResponse.json({ ok: false, error: 'Missing Supabase configuration.' }, { status: 500 })
  }

  try {
    const payload = await request.json()
    const path = normalizeText(payload?.path, 300)
    const contentType = normalizeText(payload?.contentType, 50)
    const contentSlug = normalizeText(payload?.contentSlug, 250)
    const sessionId = normalizeText(payload?.sessionId, 120)
    const referrer = normalizeText(payload?.referrer, 500)
    const userAgent = normalizeText(payload?.userAgent, 500)

    if (!path || !contentType) {
      return NextResponse.json({ ok: false, error: 'Missing tracking payload.' }, { status: 400 })
    }

    const { error } = await supabase.from('page_views').insert({
      path,
      content_type: contentType,
      content_slug: contentSlug || null,
      session_id: sessionId || null,
      referrer: referrer || null,
      user_agent: userAgent || null,
    })

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to record page view.' }, { status: 500 })
  }
}
