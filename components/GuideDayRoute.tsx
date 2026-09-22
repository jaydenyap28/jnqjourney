import { ArrowRight, Navigation } from 'lucide-react'
import RelatedNoteCards from './RelatedNoteCards'
import { PublicCopy, PublicLink as Link } from './PublicLocale'
import type { GuideRouteNoteCard } from '../lib/content-relations'
import { orderedGuideDayRoute, type AttractionSource } from '../lib/guide-attractions'
import { resolveGuideAttraction, type GuideSegmentSpot } from '../lib/guide-segment-spots'
import { guideAttractionDisplayName } from '../lib/guide-attraction-display'
import { buildLocationPath } from '../lib/location-routing'

export default function GuideDayRoute({ dayNumber, source, spots, notes = [] }: {
  dayNumber: number
  source: AttractionSource
  spots: GuideSegmentSpot[]
  notes?: GuideRouteNoteCard[]
}) {
  const routeItems = orderedGuideDayRoute(source)
  const links = routeItems.flatMap((item) => {
    if (item.type === 'note') return []
    const spot = resolveGuideAttraction(item, spots)
    if (!spot || spot.category === 'accommodation') return []
    return [{ href: buildLocationPath(spot.name, spot.id), label: guideAttractionDisplayName(item, spot) }]
  })
  const seenNotes = new Set<string>()
  const noteCards = routeItems.flatMap((item) => {
    if (item.type !== 'note') return []
    const note = notes.find((candidate) => candidate.routeItemSlug === item.noteSlug)
    if (!note || seenNotes.has(note.slug)) return []
    seenNotes.add(note.slug)
    return [note]
  })
  const showSpotRoute = Boolean(links.length && (links.length > 1 || source.routeItems))
  if (!showSpotRoute && !noteCards.length) return null
  return <>
    {showSpotRoute ? <nav aria-label={`Day ${dayNumber} 今日路线`} className="mt-6 border-y border-white/10 py-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/45">
        <Navigation className="h-3.5 w-3.5" /><PublicCopy text="今日路线" />
      </div>
      <ol className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {links.map((link, index) => <li key={`${link.href}-${index}`} className="flex min-w-0 items-center gap-2">
          <Link href={link.href} className="truncate text-sm text-white/82 transition hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">{link.label}</Link>
          {index < links.length - 1 ? <ArrowRight className="h-3.5 w-3.5 shrink-0 rotate-90 text-amber-200/45 sm:rotate-0" /> : null}
        </li>)}
      </ol>
    </nav> : null}
    <RelatedNoteCards notes={noteCards} variant="guide-day" />
  </>
}
