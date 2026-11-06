'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import AnalyticsScripts from './AnalyticsScripts'

export default function GoogleAnalytics({ measurementId }: { measurementId?: string | null }) {
  const pathname = usePathname()
  const query = useSearchParams()?.toString()
  return <AnalyticsScripts measurementId={measurementId} pagePath={query ? `${pathname}?${query}` : pathname || '/'} />
}
