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

const FIRST_PARTY_EVENTS = new Set<AnalyticsEventName>([
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

export function getAnalyticsSessionId() {
  if (typeof window === 'undefined') return ''
  const key = 'jnq_session_id'
  const existing = window.localStorage.getItem(key)
  if (existing) return existing
  const value = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  window.localStorage.setItem(key, value)
  return value
}

export function trackEvent(name: AnalyticsEventName, params: AnalyticsEventParams = {}) {
  if (typeof window === 'undefined') return
  if (window.localStorage.getItem('jnq_exclude_analytics') === '1') return

  const safeParams = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
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
        sessionId: getAnalyticsSessionId(),
        userAgent: navigator.userAgent,
        params: safeParams,
      }),
    }).catch(() => null)
  }
}

export function getDeviceType() {
  if (typeof window === 'undefined') return 'unknown'
  return window.matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop'
}
