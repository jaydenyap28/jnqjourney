import { ArrowRight, Navigation } from 'lucide-react'
import { PublicCopy, PublicLink as Link } from './PublicLocale'
import { orderedGuideDayRoute, type AttractionSource } from '../lib/guide-attractions'
import { resolveGuideAttraction, type GuideSegmentSpot } from '../lib/guide-segment-spots'
import { guideAttractionDisplayName } from '../lib/guide-attraction-display'
import { buildLocationPath } from '../lib/location-routing'

export default function GuideDayRoute({ dayNumber, source, spots }: {
  dayNumber: number
  source: AttractionSource
  spots: GuideSegmentSpot[]
}) {
  const links = orderedGuideDayRoute(source).flatMap((item) => {
    if (item.type === 'note') return [{ href: `/notes/${encodeURIComponent(item.noteSlug)}`, label: item.displayName }]
    const spot = resolveGuideAttraction(item, spots)
    if (!spot || spot.category === 'accommodation') return []
    return [{ href: buildLocationPath(spot.name, spot.id), label: guideAttractionDisplayName(item, spot) }]
  })
  // Keep the existing Spot-only presentation; a single Note still needs a link.
  if (!links.length || (links.length === 1 && !source.routeItems)) return null
  return <nav aria-label={`Day ${dayNumber} 今日路线`} className="mt-6 border-y border-white/10 py-4">
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/45">
      <Navigation className="h-3.5 w-3.5" /><PublicCopy text="今日路线" />
    </div>
    <ol className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      {links.map((link, index) => <li key={`${link.href}-${index}`} className="flex min-w-0 items-center gap-2">
        <Link href={link.href} className="truncate text-sm text-white/82 transition hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">{link.label}</Link>
        {index < links.length - 1 ? <ArrowRight className="h-3.5 w-3.5 shrink-0 rotate-90 text-amber-200/45 sm:rotate-0" /> : null}
      </li>)}
    </ol>
  </nav>
}
