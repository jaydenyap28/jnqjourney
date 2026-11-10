'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

// Included exclusively in the isolated Node renderer, after React commits.
export default function SnapshotHydrationProbe() {
  const pathname = usePathname()
  const router = useRouter()
  useEffect(() => {
    Object.assign(window, {
      __JNQ_SNAPSHOT_HYDRATED: { pathname, routerReady: typeof router.push === 'function', timeOrigin: performance.timeOrigin },
    })
  }, [pathname, router])
  return null
}
