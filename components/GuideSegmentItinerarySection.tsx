import Link from 'next/link'
import { BedDouble, MapPin, Navigation } from 'lucide-react'

import FallbackImage from '@/components/FallbackImage'
import GuideVideoCard from '@/components/GuideVideoCard'
import { getGuideSpotCover, type GuideSegmentSpot } from '@/lib/guide-segment-spots'
import { buildLocationPath } from '@/lib/location-routing'
import type { GuideItinerarySegment } from '@/lib/guides'

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(date)
}

function dateRange(start: string, end: string) {
  return start === end ? formatDate(start) : `${formatDate(start)}－${formatDate(end)}`
}

function youtubeId(value?: string) {
  const match = String(value || '').match(/(?:youtu\.be\/|[?&]v=)([^?&/]+)/)
  return match?.[1] || null
}

export default function GuideSegmentItinerarySection({
  guideSlug,
  segments,
  spotsBySegment,
}: {
  guideSlug: string
  segments: GuideItinerarySegment[]
  spotsBySegment?: Record<string, Record<string, GuideSegmentSpot>>
}) {
  return (
    <section aria-labelledby="itinerary-heading" className="min-w-0">
      <div className="border-b border-white/10 pb-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-200/68">Day by Day / 每日行程</p>
        <h2 id="itinerary-heading" className="mt-2 font-display text-4xl leading-none text-white md:text-5xl">每日行程</h2>
      </div>
      <div className="divide-y divide-white/10">
        {segments.map((segment) => {
          const video = segment.media?.map((item) => ({ label: item.label, id: youtubeId(item.url) })).find((item) => item.id)
          const spotNames = Array.from(new Set(segment.verifiedRoutes.flatMap((route) => route.linkedSpots || [])))
          const resolvedSpots = spotNames.map((name) => ({ name, spot: spotsBySegment?.[segment.id]?.[name] || null }))
          const dayLabel = segment.dayEnd > segment.dayStart ? `Day ${segment.dayStart}–${segment.dayEnd}` : `Day ${segment.dayStart}`
          return (
            <article id={`day-${segment.dayStart}`} key={segment.id} className="scroll-mt-24 py-10 md:py-14">
              <header className="grid gap-3 md:grid-cols-[7rem_minmax(0,1fr)_auto] md:items-end">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-200">{dayLabel}</p>
                <h3 className="text-3xl font-semibold leading-tight text-white md:text-4xl">{segment.city}</h3>
                <time dateTime={segment.dateStart} className="text-sm tabular-nums text-white/55">{dateRange(segment.dateStart, segment.dateEnd)}</time>
              </header>
              <div className="mt-5 flex flex-wrap gap-2 text-xs text-white/68">
                {spotNames.length ? <span className="inline-flex items-center gap-1.5 border border-white/10 bg-white/[0.035] px-3 py-1.5"><MapPin className="h-3.5 w-3.5" />{spotNames.length} 个地点</span> : null}
                {segment.accommodation ? <span className="inline-flex items-center gap-1.5 border border-white/10 bg-white/[0.035] px-3 py-1.5"><BedDouble className="h-3.5 w-3.5" />有住宿</span> : null}
              </div>
              <div className="mt-6 max-w-[800px] text-[15px] leading-[1.85] text-white/76 md:text-base"><p>{segment.summary}</p></div>

              {segment.verifiedRoutes.map((route) => <section key={route.title} className="mt-7 border-y border-white/10 py-4"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/45"><Navigation className="h-3.5 w-3.5" />{route.title}</div>{route.summary ? <p className="mt-3 max-w-3xl text-sm leading-7 text-white/75">{route.summary}</p> : null}</section>)}
              {spotNames.length ? <section aria-label={`${dayLabel} 相关地点`} className="mt-7"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/48">当天相关地点</p><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{resolvedSpots.map(({ name, spot }, index) => spot ? <Link key={name} href={buildLocationPath(spot.name, spot.id)} className="group overflow-hidden border border-white/10 bg-white/[0.035] transition hover:border-white/22 hover:bg-white/[0.055] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"><div className="relative aspect-[4/3] overflow-hidden bg-black/25"><FallbackImage src={getGuideSpotCover(spot)} alt={`${spot.name_cn || spot.name} ${spot.regions?.name_cn || spot.regions?.name || ''} 旅行照片`.trim()} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 360px" className="object-cover transition duration-500 group-hover:scale-[1.025]" /><div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" /><div className="absolute left-3 top-3 flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center bg-amber-300 text-xs font-bold text-slate-950">{index + 1}</span><span className="bg-black/62 px-2.5 py-1 text-[10px] text-white/88 backdrop-blur">{spot.category || '地点'}</span></div></div><div className="p-4"><p className="text-base font-medium leading-6 text-white">{spot.name_cn || spot.name}</p><p className="mt-1 text-xs text-white/50">{spot.regions?.name_cn || spot.regions?.name || '地点'}</p></div></Link> : <article key={name} className="overflow-hidden border border-white/10 bg-white/[0.025]"><div className="relative aspect-[4/3] bg-black/20"><FallbackImage src="/placeholder-image.jpg" alt={`${name} 景点照片`} fill sizes="(max-width: 640px) 100vw, 33vw" className="object-cover" /></div><div className="p-4"><p className="text-base font-medium leading-6 text-white">{name}</p></div></article>)}</div></section> : null}

              {segment.transport ? <section aria-label={`${dayLabel} 交通`} className="mt-7 border-l border-white/15 pl-4"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">交通</p><p className="mt-2 max-w-3xl text-sm leading-7 text-white/75">{segment.transport}</p></section> : null}
              {segment.accommodation ? <section aria-label={`${dayLabel} 当日住宿`} className="mt-7 border border-sky-200/15 bg-sky-300/[0.055] p-4 md:p-5"><div className="flex items-center gap-2 text-sky-100/82"><BedDouble className="h-4 w-4" /><p className="text-xs font-semibold uppercase tracking-[0.22em]">当日住宿</p></div><div className="mt-3 text-sm leading-7 text-white/78"><p>{segment.accommodation}</p>{segment.accommodationNote ? <p className="mt-2 text-white/58">{segment.accommodationNote}</p> : null}</div></section> : null}
              {segment.actualExperiences?.length ? <aside className="mt-6 border-l-2 border-amber-300/40 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-white/68"><p className="font-medium text-amber-100">实际经验</p><ul className="mt-2 space-y-1">{segment.actualExperiences.map((item) => <li key={item}>{item}</li>)}</ul></aside> : null}
              {segment.practicalTips?.length ? <aside className="mt-6 border-l-2 border-amber-300/40 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-white/68"><p className="font-medium text-amber-100">实用提醒</p><ul className="mt-2 space-y-1">{segment.practicalTips.map((item) => <li key={item}>{item}</li>)}</ul></aside> : null}
              {segment.referenceRoutes?.length ? <aside className="mt-6 border-l-2 border-amber-300/40 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-white/68"><p className="font-medium text-amber-100">附近延伸选择</p>{segment.referenceRoutes.map((route) => <p key={route.title} className="mt-2">{route.summary}</p>)}</aside> : null}
              {video?.id ? <section aria-label={`${dayLabel} 当日影片`} className="mt-7"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/48">当日影片</p><GuideVideoCard videoId={video.id} title={video.label} guideSlug={guideSlug} dayNumber={segment.dayStart} /></section> : null}
            </article>
          )
        })}
      </div>
    </section>
  )
}
