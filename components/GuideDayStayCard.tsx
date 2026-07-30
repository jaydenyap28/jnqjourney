import Link from 'next/link'
import { BedDouble, ExternalLink } from 'lucide-react'

import FallbackImage from '@/components/FallbackImage'
import { buildLocationPath } from '@/lib/location-routing'
import { formatShortText } from '@/lib/short-text'
import { getGuideSpotCover } from '@/lib/guide-segment-spots'

export interface GuideStaySpot {
  id: number
  name: string
  name_cn?: string | null
  image_url?: string | null
  images?: string[] | null
  regions?: { name?: string | null; name_cn?: string | null } | null
}

export function getGuideStayCover(stay?: GuideStaySpot | null) {
  return getGuideSpotCover(stay)
}

export default function GuideDayStayCard({
  dayNumber,
  stay,
  staySpot,
  note,
  continued = false,
}: {
  dayNumber: number
  stay?: string
  staySpot?: GuideStaySpot | null
  note?: string
  continued?: boolean
}) {
  if (!stay && !staySpot) return null
  const name = staySpot?.name_cn || staySpot?.name || stay || ''
  const region = staySpot?.regions?.name_cn || staySpot?.regions?.name || '住宿地点'
  const content = (
    <>
      <div className={`relative overflow-hidden bg-black/20 ${continued ? 'h-16' : 'aspect-[4/3] md:aspect-[3/2]'}`}>
        <FallbackImage src={getGuideStayCover(staySpot)} alt={`${name} 住宿照片`} fill sizes={continued ? '72px' : '(max-width: 768px) 100vw, 180px'} className="object-cover transition duration-500 group-hover:scale-[1.025]" />
      </div>
      <div className="min-w-0">
        <p className="font-medium text-white">{name}</p>
        <p className="mt-1 text-xs text-white/52">{region}</p>
        {note ? <p className="mt-2 text-sm leading-6 text-white/65">{formatShortText(note)}</p> : null}
        {staySpot ? <span className="mt-3 inline-flex items-center gap-1.5 text-xs text-sky-100">查看酒店详情 <ExternalLink className="h-3 w-3" /></span> : null}
      </div>
    </>
  )

  return (
    <section aria-label={`Day ${dayNumber} 当日住宿`} className="mt-7 border border-sky-200/15 bg-sky-300/[0.055] p-4 md:p-5">
      <div className="flex items-center gap-2 text-sky-100/82"><BedDouble className="h-4 w-4" /><p className="text-xs font-semibold uppercase tracking-[0.22em]">{continued ? '继续入住' : '当日住宿'}</p></div>
      {staySpot ? <Link href={buildLocationPath(staySpot.name, staySpot.id)} className={`group mt-4 grid gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 ${continued ? 'grid-cols-[72px_minmax(0,1fr)] items-center' : 'md:grid-cols-[180px_minmax(0,1fr)]'}`}>{content}</Link> : <div className="mt-4 grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">{content}</div>}
    </section>
  )
}
