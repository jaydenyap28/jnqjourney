'use client'

import { useEffect, useState } from 'react'
import Script from 'next/script'
import { usePathname, useSearchParams } from 'next/navigation'

declare global {
  interface Window {
    dataLayer: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

interface GoogleAnalyticsProps {
  measurementId?: string | null
}

const PRODUCTION_ANALYTICS_HOSTS = new Set([
  'jnqjourney.com',
  'www.jnqjourney.com',
])

function isExcludedAnalyticsPath(pathname: string) {
  return pathname.startsWith('/admin') || pathname.startsWith('/api')
}

export default function GoogleAnalytics({ measurementId }: GoogleAnalyticsProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [analyticsAllowed, setAnalyticsAllowed] = useState(false)
  const [analyticsReady, setAnalyticsReady] = useState(false)

  useEffect(() => {
    if (!measurementId || typeof window === 'undefined' || isExcludedAnalyticsPath(pathname)) {
      setAnalyticsAllowed(false)
      setAnalyticsReady(false)
      return
    }

    const hostname = window.location.hostname.toLowerCase()
    setAnalyticsAllowed(PRODUCTION_ANALYTICS_HOSTS.has(hostname))
  }, [measurementId, pathname])

  useEffect(() => {
    if (
      !measurementId
      || !analyticsAllowed
      || !analyticsReady
      || isExcludedAnalyticsPath(pathname)
      || typeof window === 'undefined'
      || typeof window.gtag !== 'function'
    ) return

    const query = searchParams?.toString()
    const pagePath = query ? `${pathname}?${query}` : pathname

    window.gtag('event', 'page_view', {
      page_path: pagePath,
      page_location: window.location.href,
      page_title: document.title,
      send_to: measurementId,
    })
  }, [analyticsAllowed, analyticsReady, measurementId, pathname, searchParams])

  if (!measurementId || !analyticsAllowed || isExcludedAnalyticsPath(pathname)) return null

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />
      <Script
        id="google-analytics"
        strategy="afterInteractive"
        onReady={() => setAnalyticsReady(true)}
      >
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){window.dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${measurementId}', {
            anonymize_ip: true,
            send_page_view: false
          });
        `}
      </Script>
    </>
  )
}
