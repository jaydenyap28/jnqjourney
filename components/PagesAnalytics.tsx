import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import AnalyticsScripts from './AnalyticsScripts'
import { recordPageView } from '@/lib/page-view'

export default function PagesAnalytics() {
  const router = useRouter()
  const [path, setPath] = useState('')
  useEffect(() => {
    if (!router.isReady) return
    const complete = (url: string) => {
      const pagePath = url.split('#')[0]
      recordPageView(pagePath)
      setPath(pagePath)
    }
    complete(router.asPath)
    router.events.on('routeChangeComplete', complete)
    return () => { router.events.off('routeChangeComplete', complete) }
  }, [router.isReady, router.asPath, router.events])
  return path ? <AnalyticsScripts measurementId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim()} pagePath={path} /> : null
}
