'use client'

import { useEffect, useRef, useState } from 'react'
import Script from 'next/script'
import { isAnalyticsAllowed } from '@/lib/analytics'

declare global {
  interface Window {
    dataLayer: unknown[]
    gtag?: (...args: unknown[]) => void
    [key: `ga-disable-${string}`]: boolean | undefined
  }
}

// Router-independent: the App and Pages adapters supply their resolved URL.
export default function AnalyticsScripts({ measurementId, pagePath }: { measurementId?: string | null; pagePath: string }) {
  const [allowed, setAllowed] = useState(false)
  const [ready, setReady] = useState(false)
  const lastPath = useRef('')
  useEffect(() => {
    const nextAllowed = isAnalyticsAllowed(pagePath)
    if (measurementId) window[`ga-disable-${measurementId}`] = !nextAllowed
    if (!nextAllowed) lastPath.current = ''
    setAllowed(nextAllowed)
  }, [pagePath, measurementId])
  useEffect(() => {
    if (!allowed || !ready || !measurementId || !isAnalyticsAllowed(pagePath) || !window.gtag || lastPath.current === pagePath) return
    lastPath.current = pagePath
    window.gtag('event', 'page_view', {
      page_path: pagePath, page_location: window.location.origin + pagePath,
      page_title: document.title, send_to: measurementId,
    })
  }, [allowed, ready, measurementId, pagePath])
  if (!allowed || !/^G-[A-Z0-9]+$/.test(measurementId || '')) return null
  return <>
    <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />
    <Script id="google-analytics" strategy="afterInteractive" onReady={() => setReady(true)}>{`
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function(){window.dataLayer.push(arguments);};
      window.gtag('js', new Date());
      // GA4 stream history-based page views must also remain disabled.
      window.gtag('config', '${measurementId}', { anonymize_ip: true, send_page_view: false });
    `}</Script>
  </>
}
