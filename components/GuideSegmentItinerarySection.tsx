import Link from 'next/link'
import { MapPin, Navigation } from 'lucide-react'

import FallbackImage from '@/components/FallbackImage'
import GuideDayStayCard, { type GuideStaySpot } from '@/components/GuideDayStayCard'
import GuideVideoCard from '@/components/GuideVideoCard'
import { getGuideSpotCover, type GuideSegmentSpot } from '@/lib/guide-segment-spots'
import { buildLocationPath } from '@/lib/location-routing'
import type { GuideItinerarySegment } from '@/lib/guides'
import { formatShortText } from '@/lib/short-text'

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(date)
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function youtubeId(value?: string) {
  const match = String(value || '').match(/(?:youtu\.be\/|[?&]v=)([^?&/]+)/)
  return match?.[1] || null
}

export default function GuideSegmentItinerarySection({ guideSlug, segments, spotsBySegment, staysByDay = {} }: {
  guideSlug: string
  segments: GuideItinerarySegment[]
  spotsBySegment?: Record<string, Record<string, GuideSegmentSpot>>
  staysByDay?: Record<number, GuideStaySpot | null>
}) {
  return <section aria-labelledby="itinerary-heading" className="min-w-0">
    <div className="border-b border-white/10 pb-5"><p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-200/68">Day by Day / 每日行程</p><h2 id="itinerary-heading" className="mt-2 font-display text-4xl leading-none text-white md:text-5xl">每日行程</h2></div>
    <div className="divide-y divide-white/10">
      {segments.map((segment) => {
        const segmentLabel = segment.dayEnd > segment.dayStart ? `Day ${segment.dayStart}–${segment.dayEnd}` : `Day ${segment.dayStart}`
        const routes = segment.verifiedRoutes.filter((route) => typeof route.dayNumber === 'number')
        const video = segment.media?.map((item) => ({ label: item.label, id: youtubeId(item.url) })).find((item) => item.id)
        return <article id={`day-${segment.dayStart}`} key={segment.id} className="scroll-mt-24 py-10 md:py-14">
          <header className="grid gap-3 md:grid-cols-[7rem_minmax(0,1fr)_auto] md:items-end"><p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-200">{segmentLabel}</p><h3 className="text-3xl font-semibold leading-tight text-white md:text-4xl">{segment.city}</h3><time dateTime={segment.dateStart} className="text-sm tabular-nums text-white/55">{formatDate(segment.dateStart)}－{formatDate(segment.dateEnd)}</time></header>
          <p className="mt-5 max-w-[800px] text-[15px] leading-[1.85] text-white/76 md:text-base">{formatShortText(segment.summary)}</p>
          <div className="mt-8 divide-y divide-white/10 border-y border-white/10">
            {routes.map((route) => {
              const dayNumber = route.dayNumber as number
              const date = addDays(segment.dateStart, dayNumber - segment.dayStart)
              const spots = (route.linkedSpots || []).map((name) => ({ name, spot: spotsBySegment?.[segment.id]?.[name] || null })).filter((item) => item.spot)
              const isFirstDay = dayNumber === segment.dayStart
              const isLastDay = dayNumber === segment.dayEnd
              return <section key={dayNumber} id={`day-${dayNumber}-detail`} className="scroll-mt-24 py-8 first:pt-0 last:pb-0">
                <header className="grid gap-2 md:grid-cols-[5rem_minmax(0,1fr)_auto] md:items-end"><p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-200">Day {dayNumber}</p><h4 className="text-2xl font-semibold text-white md:text-3xl">{route.title}</h4><time dateTime={date} className="text-sm tabular-nums text-white/55">{formatDate(date)}</time></header>
                {route.summary ? <div className="mt-4 border-l border-white/15 pl-4"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/45"><Navigation className="h-3.5 w-3.5" />当天路线</div><p className="mt-2 max-w-3xl text-sm leading-7 text-white/75">{formatShortText(route.summary)}</p></div> : null}
                {spots.length ? <section aria-label={`Day ${dayNumber} 当天景点`} className="mt-7"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/48">当天景点</p><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{spots.map(({ name, spot }, index) => spot ? <Link key={name} href={buildLocationPath(spot.name, spot.id)} className="group overflow-hidden border border-white/10 bg-white/[0.035] transition hover:border-white/22 hover:bg-white/[0.055] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"><div className="relative aspect-[4/3] overflow-hidden bg-black/25"><FallbackImage src={getGuideSpotCover(spot)} alt={`${spot.name_cn || spot.name} ${spot.regions?.name_cn || spot.regions?.name || ''} 旅行照片`.trim()} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 360px" className="object-cover transition duration-500 group-hover:scale-[1.025]" /><div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" /><div className="absolute left-3 top-3 flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center bg-amber-300 text-xs font-bold text-slate-950">{index + 1}</span><span className="bg-black/62 px-2.5 py-1 text-[10px] text-white/88 backdrop-blur">{spot.category || '地点'}</span></div></div><div className="p-4"><p className="text-base font-medium leading-6 text-white">{spot.name_cn || spot.name}</p><p className="mt-1 text-xs text-white/50">{spot.regions?.name_cn || spot.regions?.name || '地点'}</p></div></Link> : null)}</div></section> : null}
                {isFirstDay && segment.transport ? <section aria-label={`Day ${dayNumber} 交通`} className="mt-7 border-l border-white/15 pl-4"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">交通</p><p className="mt-2 max-w-3xl text-sm leading-7 text-white/75">{formatShortText(segment.transport)}</p></section> : null}
                <GuideDayStayCard dayNumber={dayNumber} stay={segment.accommodation} staySpot={staysByDay[dayNumber]} note={segment.accommodationNote} continued={Boolean(staysByDay[dayNumber] && staysByDay[dayNumber - 1]?.id === staysByDay[dayNumber]?.id)} />
                {isLastDay && segment.practicalTips?.length ? <aside className="mt-6 border-l-2 border-amber-300/40 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-white/68"><p className="font-medium text-amber-100">实用提醒</p><ul className="mt-2 space-y-1">{segment.practicalTips.map((item) => <li key={item}>{formatShortText(item)}</li>)}</ul></aside> : null}
                {isLastDay && video?.id ? <section aria-label={`Day ${dayNumber} 当日影片`} className="mt-7"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/48">当日影片</p><GuideVideoCard videoId={video.id} title={video.label} guideSlug={guideSlug} dayNumber={dayNumber} /></section> : null}
              </section>
            })}
          </div>
          {segment.referenceRoutes?.length ? <aside className="mt-6 border-l-2 border-amber-300/40 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-white/68"><p className="font-medium text-amber-100">附近延伸选择</p>{segment.referenceRoutes.map((route) => <p key={route.title} className="mt-2">{formatShortText(route.summary)}</p>)}</aside> : null}
        </article>
      })}
    </div>
  </section>
}
