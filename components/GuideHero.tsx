import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import FallbackImage from '@/components/FallbackImage'
import type { TravelGuide } from '@/lib/guides'

export type GuideHeroRouteStop = {
  label: string
  name: string
  href: string
}

export default function GuideHero({
  guide,
  routeStops,
}: {
  guide: TravelGuide
  routeStops: GuideHeroRouteStop[]
}) {
  return (
    <header className="border-b border-white/10">
      <div className="mx-auto max-w-7xl px-4 py-5 md:px-8 md:py-8">
        <nav aria-label="Breadcrumb" className="mb-4 flex min-w-0 items-center gap-2 overflow-hidden text-xs text-white/58 md:text-sm">
          <Link href="/" className="shrink-0 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">Home</Link>
          <span aria-hidden="true">/</span>
          <Link href="/guide" className="shrink-0 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">Travel Guides</Link>
          <span aria-hidden="true">/</span>
          <span className="truncate text-white/38">{guide.title}</span>
        </nav>

        <div className={`relative isolate overflow-hidden rounded-[24px] border border-white/12 ${guide.coverAccent} md:rounded-[32px]`}>
          {guide.coverImage ? <FallbackImage src={guide.coverImage} alt={`${guide.title} 完整路线攻略封面`} fill priority sizes="(max-width: 768px) 100vw, 1280px" className="object-cover" /> : null}
          <div className="absolute inset-0 bg-[linear-gradient(105deg,rgba(2,6,18,0.90)_0%,rgba(2,6,18,0.70)_52%,rgba(2,6,18,0.48)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(255,255,255,0.12),transparent_30%)]" />

          <div className="relative grid gap-7 px-5 py-7 md:px-9 md:py-10 lg:grid-cols-[minmax(0,1.75fr)_minmax(280px,0.85fr)] lg:items-end">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-100/82">Travel Guide / 游记</p>
                {guide.duration ? <span className="rounded-full border border-white/16 bg-black/22 px-2.5 py-1 text-[10px] text-white/85">{guide.duration}</span> : null}
                {guide.travelStyle ? <span className="rounded-full border border-white/16 bg-black/22 px-2.5 py-1 text-[10px] text-white/85">{guide.travelStyle}</span> : null}
              </div>
              <h1 className="mt-5 max-w-[15ch] text-balance font-display text-[clamp(2.35rem,6vw,5.25rem)] leading-[0.98] tracking-[-0.035em] text-white">{guide.title}</h1>
              <p className="mt-4 max-w-2xl text-base font-medium leading-7 text-white/90 md:text-xl md:leading-8">{[guide.duration, guide.travelStyle, '完整攻略'].filter(Boolean).join(' · ')}</p>
              {guide.tagline ? <p className="mt-3 max-w-3xl text-sm leading-7 text-white/74 md:text-base md:leading-8">{guide.tagline}</p> : null}
              {guide.summary ? <p className="mt-2 max-w-3xl text-sm leading-7 text-white/64">{guide.summary}</p> : null}
              <dl className="mt-6 grid max-w-2xl grid-cols-2 divide-x divide-white/12 border-y border-white/12 bg-black/15 py-3">
                <div className="px-3 first:pl-0"><dt className="text-[10px] uppercase tracking-[0.2em] text-white/45">行程</dt><dd className="mt-1 text-sm font-semibold text-white">{guide.duration}</dd></div>
                <div className="px-3"><dt className="text-[10px] uppercase tracking-[0.2em] text-white/45">地区</dt><dd className="mt-1 text-sm font-semibold text-white">{routeStops.length} 个主要地区</dd></div>
              </dl>
            </div>

            <section aria-labelledby="hero-route-heading" className="border-l border-white/16 bg-black/20 p-4 backdrop-blur-md md:p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-200/75">Route / 路线</p>
              <h2 id="hero-route-heading" className="mt-2 text-xl font-semibold text-white">路线总览</h2>
              <ol className="mt-4 space-y-1">
                {routeStops.map((stop) => <li key={stop.href}><a href={stop.href} className="group grid min-h-12 grid-cols-[4.5rem_1fr_auto] items-center gap-2 border-t border-white/10 py-2.5 text-sm transition first:border-t-0 hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"><span className="font-semibold tabular-nums text-amber-200/80">{stop.label}</span><span className="min-w-0"><span className="block truncate font-medium text-white">{stop.name}</span></span><ArrowRight className="h-3.5 w-3.5 text-white/38 transition group-hover:translate-x-0.5 group-hover:text-amber-200" /></a></li>)}
              </ol>
            </section>
          </div>
        </div>
      </div>
    </header>
  )
}
