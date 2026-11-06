import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PRODUCTION_ANALYTICS_HOSTS, analyticsRequestHost, isAnalyticsBot, isAnalyticsPath } from '@/lib/analytics-policy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_EVENTS = new Set([
  'related_guide_click',
  'spot_navigation_click',
  'social_link_click',
  'package_view',
  'package_whatsapp_click',
  'package_cta_click',
  'package_brochure_view',
  'package_gallery_open',
  'package_comparison_view',
  'package_option_view',
  'package_option_select',
  'package_enquiry_start',
  'package_enquiry_copy',
])

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function normalizeText(value: unknown, maxLength: number) {
  return String(value || '').trim().slice(0, maxLength)
}

function normalizeNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function sanitizeParams(value: unknown): Record<string, string | number | boolean | null> {
  const output: Record<string, string | number | boolean | null> = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return output

  for (const [key, raw] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
    const safeKey = normalizeText(key, 80)
    if (!safeKey || raw === undefined) continue

    if (typeof raw === 'string') output[safeKey] = normalizeText(raw, 500)
    else if (typeof raw === 'number' && Number.isFinite(raw)) output[safeKey] = raw
    else if (typeof raw === 'boolean' || raw === null) output[safeKey] = raw
  }

  return output
}

export async function POST(request: Request) {
  if (!PRODUCTION_ANALYTICS_HOSTS.has(analyticsRequestHost(request)) || (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production')) {
    return NextResponse.json({ ok: true, skipped: 'non-production' })
  }

  try {
    const body = await request.json()
    const eventName = normalizeText(body?.eventName, 80)
    const path = normalizeText(body?.path, 300)
    const sessionId = normalizeText(body?.sessionId, 120)
    const visitorId = normalizeText(body?.visitorId, 120)
    const visitId = normalizeText(body?.visitId, 120)
    const userAgent = normalizeText(request.headers.get('user-agent') || body?.userAgent, 500)
    const deviceType = normalizeText(body?.deviceType, 30)
    const trafficSource = normalizeText(body?.trafficSource, 120)
    const trafficMedium = normalizeText(body?.trafficMedium, 120)
    const trafficCampaign = normalizeText(body?.trafficCampaign, 180)
    const params = sanitizeParams(body?.params)

    if (!ALLOWED_EVENTS.has(eventName)) {
      return NextResponse.json({ ok: true, skipped: 'event-not-recorded' })
    }
    if (!isAnalyticsPath(path)) return NextResponse.json({ ok: true, skipped: 'excluded-path' })
    if (isAnalyticsBot(userAgent)) {
      return NextResponse.json({ ok: true, skipped: 'bot' })
    }

    const supabase = getSupabaseAdminClient()
    if (!supabase) return NextResponse.json({ ok: false, error: 'Missing Supabase configuration.' }, { status: 500 })
    const { error } = await supabase.from('analytics_events').insert({
      event_name: eventName,
      path: path || null,
      session_id: sessionId || visitorId || null,
      visitor_id: visitorId || sessionId || null,
      visit_id: visitId || null,
      device_type: deviceType || normalizeText((params as any).device_type, 30) || null,
      traffic_source: trafficSource || null,
      traffic_medium: trafficMedium || null,
      traffic_campaign: trafficCampaign || null,
      package_id: normalizeNumber((params as any).package_id),
      option_id: normalizeNumber((params as any).option_id),
      source_code: normalizeText((params as any).source_code, 120) || null,
      params,
    })

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to record analytics event.' }, { status: 500 })
  }
}
