import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PRODUCTION_ANALYTICS_HOSTS, analyticsRequestHost, isAnalyticsBot, isAnalyticsPath } from '@/lib/analytics-policy'

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
  if (!PRODUCTION_ANALYTICS_HOSTS.has(analyticsRequestHost(request)) || (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production')) {
    return NextResponse.json({ ok: true, skipped: 'non-production' })
  }

  try {
    const payload = await request.json()
    const path = normalizeText(payload?.path, 300)
    const contentType = normalizeText(payload?.contentType, 50)
    const contentSlug = normalizeText(payload?.contentSlug, 250)
    const sessionId = normalizeText(payload?.sessionId, 120)
    const visitorId = normalizeText(payload?.visitorId, 120)
    const visitId = normalizeText(payload?.visitId, 120)
    const deviceType = normalizeText(payload?.deviceType, 30)
    const trafficSource = normalizeText(payload?.trafficSource, 120)
    const trafficMedium = normalizeText(payload?.trafficMedium, 120)
    const trafficCampaign = normalizeText(payload?.trafficCampaign, 180)
    const referrer = normalizeText(payload?.referrer, 500)
    const userAgent = normalizeText(request.headers.get('user-agent') || payload?.userAgent, 500)

    if (!path || !contentType) {
      return NextResponse.json({ ok: false, error: 'Missing tracking payload.' }, { status: 400 })
    }

    if (!isAnalyticsPath(path)) return NextResponse.json({ ok: true, skipped: 'excluded-path' })
    if (isAnalyticsBot(userAgent)) {
      return NextResponse.json({ ok: true, skipped: 'bot' })
    }

    const supabase = getSupabaseAdminClient()
    if (!supabase) return NextResponse.json({ ok: false, error: 'Missing Supabase configuration.' }, { status: 500 })
    const { error } = await supabase.from('page_views').insert({
      path,
      content_type: contentType,
      content_slug: contentSlug || null,
      session_id: sessionId || visitorId || null,
      visitor_id: visitorId || sessionId || null,
      visit_id: visitId || null,
      device_type: deviceType || null,
      traffic_source: trafficSource || null,
      traffic_medium: trafficMedium || null,
      traffic_campaign: trafficCampaign || null,
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
