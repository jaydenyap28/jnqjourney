'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { getAnalyticsTrackingContext } from '@/lib/analytics'

function deriveContentMeta(pathname: string) {
  if (pathname.startsWith('/spot/')) {
    return { contentType: 'spot', contentSlug: pathname.replace('/spot/', '') }
  }
  if (pathname.startsWith('/guide/')) {
    return { contentType: 'guide', contentSlug: pathname.replace('/guide/', '') }
  }
  if (pathname.startsWith('/notes/')) {
    return { contentType: 'note', contentSlug: pathname.replace('/notes/', '') }
  }
  if (pathname.startsWith('/packages/')) {
    return { contentType: 'package', contentSlug: pathname.replace('/packages/', '') }
  }
  if (pathname.startsWith('/region/')) {
    return { contentType: 'region', contentSlug: pathname.replace('/region/', '') }
  }
  if (pathname === '/packages') {
    return { contentType: 'package_index', contentSlug: 'packages' }
  }
  if (pathname === '/') {
    return { contentType: 'home', contentSlug: 'home' }
  }
  return { contentType: 'page', contentSlug: pathname.replace(/^\//, '') || 'home' }
}

export default function PageViewTracker() {
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname) return
    if (pathname.startsWith('/admin') || pathname.startsWith('/api')) return
    if (window.localStorage.getItem('jnq_exclude_analytics') === '1') return

    const tracking = getAnalyticsTrackingContext()
    const query = typeof window !== 'undefined' ? window.location.search.replace(/^\?/, '') : ''
    const trackedPath = query ? `${pathname}?${query}` : pathname
    const dedupeKey = `pageview:${trackedPath}:${new Date().toISOString().slice(0, 16)}`
    if (window.sessionStorage.getItem(dedupeKey)) return
    window.sessionStorage.setItem(dedupeKey, '1')

    const { contentType, contentSlug } = deriveContentMeta(pathname)
    const previousPath = window.sessionStorage.getItem('jnq_previous_path')
    const referrer = previousPath
      ? `${window.location.origin}${previousPath}`
      : typeof document !== 'undefined'
        ? document.referrer
        : ''

    window.sessionStorage.setItem('jnq_previous_path', trackedPath)

    void fetch('/api/page-view', {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: trackedPath,
        contentType,
        contentSlug,
        sessionId: tracking.visitorId,
        visitorId: tracking.visitorId,
        visitId: tracking.visitId,
        deviceType: tracking.deviceType,
        trafficSource: tracking.attribution.source,
        trafficMedium: tracking.attribution.medium,
        trafficCampaign: tracking.attribution.campaign,
        referrer,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      }),
    }).catch(() => null)
  }, [pathname])

  return null
}
