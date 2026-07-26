'use client'

import dynamic from 'next/dynamic'
import type { GuideRouteMapPoint } from '@/components/GuideRouteMapCanvas'

export type { GuideRouteMapPoint }

const GuideRouteMapCanvas = dynamic(() => import('@/components/GuideRouteMapCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[330px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-sm text-white/50 md:h-[450px]">
      路线地图载入中…
    </div>
  ),
})

export default function GuideRouteMap(props: React.ComponentProps<typeof GuideRouteMapCanvas>) {
  return <GuideRouteMapCanvas {...props} />
}
