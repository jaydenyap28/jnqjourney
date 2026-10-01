import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PRODUCTION_HOSTS = new Set(['jnqjourney.com', 'www.jnqjourney.com'])
const BOT_PATTERN = /bot|crawler|spider|crawl|slurp|facebookexternalhit|preview|validator|lighthouse|pagespeed|headless|python-requests|curl|wget|uptime|monitor|semrush|ahrefs|mj12bot|bytespider|petalbot|yandex|duckduckbot|bingpreview|mediapartners-google/i

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

function requestHost(request: Request) {
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const rawHost = forwardedHost || request.headers.get('host') || new URL(request.url).hostname
  return rawHost.split(':')[0].toLowerCase()
}

export async function POST(request: Request) {
  const host = requestHost(request)
  if (!PRODUCTION_HOSTS.has(host)) {
    return NextResponse.json({ ok: true, skipped: 'non-production' })
  }

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

    if (BOT_PATTERN.test(userAgent)) {
      return NextResponse.json({ ok: true, skipped: 'bot' })
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
