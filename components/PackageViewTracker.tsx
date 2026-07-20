'use client'

import { useEffect } from 'react'

import { getDeviceType, trackEvent } from '@/lib/analytics'

export default function PackageViewTracker({ packageId, packageName, sourceCode }: { packageId: number; packageName: string; sourceCode?: string | null }) {
  useEffect(() => {
    trackEvent('package_view', {
      page_path: window.location.pathname,
      page_type: 'package',
      page_title: document.title,
      package_id: packageId,
      package_name: packageName,
      device_type: getDeviceType(),
      source_code: sourceCode,
    })
  }, [packageId, packageName, sourceCode])
  return null
}
