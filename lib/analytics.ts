'use client'

export type AnalyticsEventName =
  | 'whatsapp_click'
  | 'package_view'
  | 'package_cta_click'
  | 'klook_click'
  | 'trip_click'
  | 'affiliate_click'
  | 'package_enquiry_start'
  | 'package_enquiry_copy'
  | 'phone_number_copy'

export type AnalyticsEventParams = Record<string, string | number | boolean | null | undefined>

export function trackEvent(name: AnalyticsEventName, params: AnalyticsEventParams = {}) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return

  const safeParams = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  )

  window.gtag('event', name, safeParams)
}

export function getDeviceType() {
  if (typeof window === 'undefined') return 'unknown'
  return window.matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop'
}
