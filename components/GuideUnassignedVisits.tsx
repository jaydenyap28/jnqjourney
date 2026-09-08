import Link from 'next/link'
import GuideDayStayCard from '@/components/GuideDayStayCard'
import GuideVideoCard from '@/components/GuideVideoCard'
import { orderedGuideAttractions } from '@/lib/guide-attractions'
import { resolveGuideAttraction, type GuideSegmentSpot } from '@/lib/guide-segment-spots'
import { guideAttractionDisplayName } from '@/lib/guide-attraction-display'
import type { TravelGuide } from '@/lib/guides'

export default function GuideUnassignedVisits({ guide, spots }: { guide: TravelGuide; spots: GuideSegmentSpot[] }) {
  const visits = orderedGuideAttractions(guide)
  const videoId = guide.videoUrl?.match(/(?:youtu\.be\/|[?&]v=)([\w-]{11})/)?.[1]
  return <section className="min-w-0" aria-labelledby="itinerary-heading">
    <div className="border-b border-white/10 pb-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-200/70">Visited places / 实际到访</p>
      <h2 id="itinerary-heading" className="mt-2 font-display text-4xl text-white md:text-5xl">这趟去过的地方</h2>
      <p className="mt-4 max-w-3xl text-sm leading-7 text-white/70">以下按影片介绍顺序整理。每日安排尚待补充，可先查看地点资料与完整影片。</p>
    </div>
    <ol className="mt-6 grid gap-x-7 sm:grid-cols-2 lg:grid-cols-3">
      {visits.map((ref, index) => {
        const spot = resolveGuideAttraction(ref, spots)
        const name = guideAttractionDisplayName(ref, spot || {})
        return <li key={ref.spotId} className="min-w-0 border-b border-white/10 py-5">
          <span className="text-xs tabular-nums text-amber-200/70">{String(index + 1).padStart(2, '0')}</span>
          <h3 className="mt-2 break-words text-lg font-medium leading-7 text-white">{spot ? <Link href={`/spot/${ref.spotSlug}`} className="block py-1 hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200">{name}</Link> : name}</h3>
          {ref.guideSummary ? <p className="mt-2 text-sm leading-7 text-white/65">{ref.guideSummary}</p> : null}
        </li>
      })}
    </ol>
    {!!guide.accommodationStays?.length && <div className="mt-10"><h2 className="font-display text-3xl text-white">这趟住过的地方</h2><div className="grid gap-x-5 lg:grid-cols-2">{guide.accommodationStays.map(stay => {
      const spot = spots.find(item => item.id === stay.accommodationId && item.category === 'accommodation')
      return spot ? <GuideDayStayCard key={stay.accommodationId} staySpot={spot} note={stay.note} /> : null
    })}</div></div>}
    {!!guide.notes.length && <aside className="mt-10 border-l-2 border-amber-200/35 pl-5"><h2 className="text-2xl font-medium text-white">交通与旅行提醒</h2><div className="mt-4 space-y-4">{guide.notes.map(note => <p key={note} className="max-w-3xl text-sm leading-7 text-white/70">{note}</p>)}</div></aside>}
    {videoId && <div className="mt-10"><h2 className="mb-4 font-display text-3xl text-white">完整旅行影片</h2><GuideVideoCard videoId={videoId} title={guide.title} guideSlug={guide.slug} /></div>}
  </section>
}
