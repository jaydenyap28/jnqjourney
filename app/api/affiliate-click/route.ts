import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PRODUCTION_HOSTS = new Set(['jnqjourney.com', 'www.jnqjourney.com'])
const BOT_PATTERN = /bot|crawler|spider|crawl|slurp|facebookexternalhit|preview|validator|lighthouse|pagespeed|headless|python-requests|curl|wget|uptime|monitor|semrush|ahrefs|mj12bot|bytespider|petalbot|yandex|duckduckbot|bingpreview|mediapartners-google|adsbot-google|google-inspectiontool/i

function requestHost(request: Request) {
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const rawHost = forwardedHost || request.headers.get('host') || new URL(request.url).hostname
  return rawHost.split(':')[0].toLowerCase()
}

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
  if (!PRODUCTION_HOSTS.has(requestHost(request))) {
    return NextResponse.json({ ok: true, skipped: 'non-production' })
  }

  const supabase = getSupabaseAdminClient()
  if (!supabase) {
    return NextResponse.json({ ok: false, error: 'Missing Supabase configuration.' }, { status: 500 })
  }

  try {
    const payload = await request.json()
    const linkId = Number(payload?.affiliateLinkId)
    if (!Number.isInteger(linkId) || linkId <= 0) {
      return NextResponse.json({ ok: false, error: 'Missing valid affiliate link id.' }, { status: 400 })
    }

    const { data: link, error: linkError } = await supabase
      .from('affiliate_links')
      .select('id, clicks, is_active')
      .eq('id', linkId)
      .single()

    if (linkError || !link || link.is_active === false) {
      return NextResponse.json({ ok: false, error: 'Affiliate link not found.' }, { status: 404 })
    }

    const sessionId = normalizeText(payload?.sessionId, 120)
    const visitorId = normalizeText(payload?.visitorId, 120)
    const visitId = normalizeText(payload?.visitId, 120)
    const trafficSource = normalizeText(payload?.trafficSource, 120)
    const trafficMedium = normalizeText(payload?.trafficMedium, 120)
    const trafficCampaign = normalizeText(payload?.trafficCampaign, 180)
    const userAgent = normalizeText(payload?.userAgent || request.headers.get('user-agent'), 500)
    const referrer = normalizeText(payload?.referrer || request.headers.get('referer'), 500)

    if (BOT_PATTERN.test(userAgent)) {
      return NextResponse.json({ ok: true, skipped: 'bot' })
    }

    const { error: insertError } = await supabase.from('affiliate_clicks').insert({
      affiliate_link_id: linkId,
      session_id: sessionId || visitorId || null,
      visitor_id: visitorId || sessionId || null,
      visit_id: visitId || null,
      traffic_source: trafficSource || null,
      traffic_medium: trafficMedium || null,
      traffic_campaign: trafficCampaign || null,
      user_agent: userAgent || null,
      referrer: referrer || null,
    })

    if (insertError) {
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 })
    }

    await supabase
      .from('affiliate_links')
      .update({ clicks: Number(link.clicks || 0) + 1 })
      .eq('id', linkId)

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to record affiliate click.' }, { status: 500 })
  }
}
