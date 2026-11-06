'use client'

import { getAnalyticsTrackingContext, isAnalyticsAllowed } from './analytics'

let lastPath = ''
let previousPath = ''

export function deriveContentMeta(path: string) {
  const pathname = path.split(/[?#]/)[0].replace(/^\/en(?=\/|$)/, '') || '/'
  const [section, ...parts] = pathname.slice(1).split('/')
  const contentTypes: Record<string, string> = { spot: 'spot', guide: 'guide', notes: 'note', packages: 'package', region: 'region' }
  if (pathname === '/') return { contentType: 'home', contentSlug: 'home' }
  if (pathname === '/packages') return { contentType: 'package_index', contentSlug: 'packages' }
  return { contentType: parts.length ? contentTypes[section] || 'page' : 'page', contentSlug: parts.join('/') || section }
}

export function recordPageView(path: string) {
  const trackedPath = path.split('#')[0]
  if (!isAnalyticsAllowed(trackedPath)) { lastPath = ''; return }
  if (lastPath === trackedPath) return
  lastPath = trackedPath
  const tracking = getAnalyticsTrackingContext()
  const referrer = previousPath ? `${window.location.origin}${previousPath}` : document.referrer
  previousPath = trackedPath
  void fetch('/api/page-view', {
    method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: trackedPath, ...deriveContentMeta(trackedPath),
      sessionId: tracking.visitorId, visitorId: tracking.visitorId, visitId: tracking.visitId,
      deviceType: tracking.deviceType, trafficSource: tracking.attribution.source,
      trafficMedium: tracking.attribution.medium, trafficCampaign: tracking.attribution.campaign,
      referrer, userAgent: navigator.userAgent,
    }),
  }).catch(() => null)
}
