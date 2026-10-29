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
  | 'note_video_click'
  | 'hotel_affiliate_click'
  | 'related_guide_click'
  | 'budget_section_view'

export type AnalyticsEventParams = Record<string, string | number | boolean | null | undefined>

export function trackEvent(name: AnalyticsEventName, params: AnalyticsEventParams = {}) {
  if (process.env.JNQ_PREVIEW_READ_ONLY === '1') return
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return

  const safeParams = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  )

  try {
    window.gtag('event', name, safeParams)
  } catch {
    // Analytics must never interrupt navigation or an enquiry.
  }
}

// Deliberately use content identifiers, never destination URLs, query strings,
// WhatsApp text or contact details. Delivery uses the existing GA configuration.
export function trackSpotNavigation(spotId: number, target: 'guide' | 'package', slug: string, position: 'spot_reading_cue' | 'spot_related_guide' | 'spot_related_package') {
  if (!Number.isSafeInteger(spotId) || spotId <= 0 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug)) return
  trackEvent(target === 'guide' ? 'related_guide_click' : 'package_cta_click', {
    page_type: 'spot',
    spot_id: spotId,
    destination_type: target,
    destination_slug: slug,
    cta_position: position,
  })
}

export function getDeviceType() {
  if (typeof window === 'undefined') return 'unknown'
  return window.matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop'
}
