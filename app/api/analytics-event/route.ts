import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PRODUCTION_HOSTS = new Set(['jnqjourney.com', 'www.jnqjourney.com'])
const BOT_PATTERN = /bot|crawler|spider|crawl|slurp|facebookexternalhit|preview|validator|lighthouse|pagespeed|headless|python-requests|curl|wget|uptime|monitor|semrush|ahrefs|mj12bot|bytespider|petalbot|yandex|duckduckbot|bingpreview|mediapartners-google/i
const ALLOWED_EVENTS = new Set([
  'social_link_click',
  'package_view',
  'package_whatsapp_click',
  'package_cta_click',
  'package_brochure_view',
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

function requestHost(request: Request) {
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const rawHost = forwardedHost || request.headers.get('host') || new URL(request.url).hostname
  return rawHost.split(':')[0].toLowerCase()
}

function sanitizeParams(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const entries = Object.entries(value as Record<string, unknown>)
    .slice(0, 40)
    .flatMap(([key, raw]) => {
      const safeKey = normalizeText(key, 80)
      if (!safeKey || raw === undefined) return []
      if (typeof raw === 'string') return [[safeKey, normalizeText(raw, 500)]]
      if (typeof raw === 'number' && Number.isFinite(raw)) return [[safeKey, raw]]
      if (typeof raw === 'boolean' || raw === null) return [[safeKey, raw]]
      return []
    })
  return Object.fromEntries(entries)
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
    const body = await request.json()
    const eventName = normalizeText(body?.eventName, 80)
    const path = normalizeText(body?.path, 300)
    const sessionId = normalizeText(body?.sessionId, 120)
    const userAgent = normalizeText(body?.userAgent, 500)
    const params = sanitizeParams(body?.params)

    if (!ALLOWED_EVENTS.has(eventName)) {
      return NextResponse.json({ ok: true, skipped: 'event-not-recorded' })
    }
    if (BOT_PATTERN.test(userAgent)) {
      return NextResponse.json({ ok: true, skipped: 'bot' })
    }

    const { error } = await supabase.from('analytics_events').insert({
      event_name: eventName,
      path: path || null,
      session_id: sessionId || null,
      device_type: normalizeText((params as any).device_type, 30) || null,
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
