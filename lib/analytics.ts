'use client'

export type AnalyticsEventName =
  | 'whatsapp_click'
  | 'about_whatsapp_click'
  | 'contact_whatsapp_click'
  | 'policy_link_click'
  | 'social_link_click'
  | 'package_view'
  | 'package_whatsapp_click'
  | 'package_cta_click'
  | 'package_brochure_view'
  | 'package_gallery_open'
  | 'package_comparison_view'
  | 'package_option_view'
  | 'package_option_select'
  | 'klook_click'
  | 'trip_click'
  | 'affiliate_click'
  | 'package_enquiry_start'
  | 'package_enquiry_copy'
  | 'phone_number_copy'
  | 'guide_day_jump'
  | 'guide_day_view'
  | 'guide_route_map_interaction'
  | 'guide_location_click'
  | 'guide_gallery_open'
  | 'guide_video_click'
  | 'hotel_affiliate_click'
  | 'related_guide_click'
  | 'budget_section_view'

export type AnalyticsEventParams = Record<string, string | number | boolean | null | undefined>

export type AnalyticsAttribution = {
  source: string
  medium: string
  campaign: string
}

export type AnalyticsTrackingContext = {
  visitorId: string
  visitId: string
  deviceType: string
  attribution: AnalyticsAttribution
}

const FIRST_PARTY_EVENTS = new Set<AnalyticsEventName>([
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

const VISIT_TIMEOUT_MS = 30 * 60 * 1000
const VISITOR_KEY = 'jnq_visitor_id'
const LEGACY_VISITOR_KEY = 'jnq_session_id'
const VISIT_STATE_KEY = 'jnq_visit_state_v2'
const ATTRIBUTION_KEY = 'jnq_attribution_v2'

function makeId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

function siteHost() {
  if (typeof window === 'undefined') return ''
  return window.location.hostname.replace(/^www\./, '').toLowerCase()
}

function normalizeSourceName(value: string) {
  const source = value.replace(/^www\./, '').toLowerCase()
  if (!source) return 'direct'
  if (source.includes('google')) return 'google'
  if (source.includes('bing')) return 'bing'
  if (source.includes('yahoo')) return 'yahoo'
  if (source.includes('baidu')) return 'baidu'
  if (source.includes('youtube') || source.includes('youtu.be')) return 'youtube'
  if (source.includes('facebook') || source === 'fb.com') return 'facebook'
  if (source.includes('instagram')) return 'instagram'
  if (source.includes('threads')) return 'threads'
  if (source.includes('tiktok')) return 'tiktok'
  if (source.includes('xiaohongshu') || source.includes('xhslink') || source === 'xhs') return 'xiaohongshu'
  if (source.includes('whatsapp')) return 'whatsapp'
  if (source.includes('telegram')) return 'telegram'
  if (source.includes('chatgpt')) return 'chatgpt'
  if (source.includes('perplexity')) return 'perplexity'
  if (source.includes('gemini')) return 'gemini'
  return source
}

function externalReferrerSource() {
  if (typeof document === 'undefined' || !document.referrer) return ''
  try {
    const host = new URL(document.referrer).hostname.replace(/^www\./, '').toLowerCase()
    const ownHost = siteHost()
    if (!host || host === ownHost || host.endsWith(`.${ownHost}`)) return ''
    return normalizeSourceName(host)
  } catch {
    return ''
  }
}

export function getAnalyticsVisitorId() {
  if (typeof window === 'undefined') return ''

  const existing = window.localStorage.getItem(VISITOR_KEY)
  if (existing) return existing

  const legacy = window.localStorage.getItem(LEGACY_VISITOR_KEY)
  const value = legacy || makeId()
  window.localStorage.setItem(VISITOR_KEY, value)
  if (!legacy) window.localStorage.setItem(LEGACY_VISITOR_KEY, value)
  return value
}

export function getAnalyticsVisitId() {
  if (typeof window === 'undefined') return ''

  const now = Date.now()
  let state: { id?: string; lastActivity?: number } | null = null
  try {
    state = JSON.parse(window.localStorage.getItem(VISIT_STATE_KEY) || 'null')
  } catch {
    state = null
  }

  const expired = !state?.id || !state?.lastActivity || now - Number(state.lastActivity) > VISIT_TIMEOUT_MS
  const id = expired ? makeId() : String(state!.id)
  window.localStorage.setItem(VISIT_STATE_KEY, JSON.stringify({ id, lastActivity: now }))
  return id
}

// Backward-compatible alias. Historically this key was a persistent browser ID,
// so keep callers working while new reporting uses visitorId + visitId separately.
export function getAnalyticsSessionId() {
  return getAnalyticsVisitorId()
}

export function getAnalyticsAttribution(visitId = getAnalyticsVisitId()): AnalyticsAttribution {
  if (typeof window === 'undefined') return { source: 'direct', medium: 'direct', campaign: '' }

  const params = new URLSearchParams(window.location.search)
  const utmSource = String(params.get('utm_source') || '').trim()
  const utmMedium = String(params.get('utm_medium') || '').trim()
  const utmCampaign = String(params.get('utm_campaign') || '').trim()

  let stored: { visitId?: string; source?: string; medium?: string; campaign?: string } | null = null
  try {
    stored = JSON.parse(window.localStorage.getItem(ATTRIBUTION_KEY) || 'null')
  } catch {
    stored = null
  }

  if (!utmSource && stored?.visitId === visitId && stored.source) {
    return {
      source: stored.source,
      medium: stored.medium || 'referral',
      campaign: stored.campaign || '',
    }
  }

  const referrerSource = externalReferrerSource()
  const attribution: AnalyticsAttribution = utmSource
    ? {
        source: normalizeSourceName(utmSource),
        medium: utmMedium || 'social',
        campaign: utmCampaign,
      }
    : referrerSource
      ? { source: referrerSource, medium: 'referral', campaign: '' }
      : { source: 'direct', medium: 'direct', campaign: '' }

  window.localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify({ visitId, ...attribution }))
  return attribution
}

export function getDeviceType() {
  if (typeof window === 'undefined') return 'unknown'
  return window.matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop'
}

export function getAnalyticsTrackingContext(): AnalyticsTrackingContext {
  const visitId = getAnalyticsVisitId()
  return {
    visitorId: getAnalyticsVisitorId(),
    visitId,
    deviceType: getDeviceType(),
    attribution: getAnalyticsAttribution(visitId),
  }
}

export function trackEvent(name: AnalyticsEventName, params: AnalyticsEventParams = {}) {
  if (typeof window === 'undefined') return
  if (window.localStorage.getItem('jnq_exclude_analytics') === '1') return

  const context = getAnalyticsTrackingContext()
  const safeParams = Object.fromEntries(
    Object.entries({
      ...params,
      device_type: params.device_type || context.deviceType,
    }).filter(([, value]) => value !== undefined && value !== null && value !== '')
  )

  if (typeof window.gtag === 'function') {
    window.gtag('event', name, safeParams)
  }

  if (FIRST_PARTY_EVENTS.has(name)) {
    const query = window.location.search
    const path = `${window.location.pathname}${query || ''}`
    void fetch('/api/analytics-event', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventName: name,
        path,
        sessionId: context.visitorId,
        visitorId: context.visitorId,
        visitId: context.visitId,
        userAgent: navigator.userAgent,
        deviceType: context.deviceType,
        trafficSource: context.attribution.source,
        trafficMedium: context.attribution.medium,
        trafficCampaign: context.attribution.campaign,
        params: safeParams,
      }),
    }).catch(() => null)
  }
}
