'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { recordPageView } from '@/lib/page-view'

export default function PageViewTracker() {
  const pathname = usePathname()
  const query = useSearchParams()?.toString()
  useEffect(() => {
    if (pathname) recordPageView(query ? `${pathname}?${query}` : pathname)
  }, [pathname, query])
  return null
}
