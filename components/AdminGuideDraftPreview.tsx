'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ShieldAlert } from 'lucide-react'

import { adminFetch } from '@/lib/admin-fetch'
import type { TravelGuide } from '@/lib/guides'
import type { GuidePriceHighlight } from '@/lib/guide-price-highlights'
import GuideHero from '@/components/GuideHero'
import GuideQuickNav from '@/components/GuideQuickNav'
import GuideSegmentItinerarySection from '@/components/GuideSegmentItinerarySection'

type Payload = { guide: TravelGuide; priceCandidates: GuidePriceHighlight[] }

function formatCandidateAmount(item: GuidePriceHighlight) {
  return new Intl.NumberFormat('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(item.amountMinor / 100)
}

export default function AdminGuideDraftPreview({ guideSlug }: { guideSlug: string }) {
  const [payload, setPayload] = useState<Payload | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const response = await adminFetch(`/api/admin/guide-drafts/${encodeURIComponent(guideSlug)}`, { cache: 'no-store' })
        const body = await response.json()
        if (!response.ok) throw new Error(body?.error || 'Unable to load guide draft.')
        if (active) setPayload(body)
      } catch (reason: unknown) { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load guide draft.') }
    })()
    return () => { active = false }
  }, [guideSlug])

  const timeline = useMemo(() => payload?.guide.itinerarySegments?.flatMap((segment) => Array.from({ length: segment.dayEnd - segment.dayStart + 1 }, (_, offset) => ({ day: segment.dayStart + offset, city: segment.city }))) || [], [payload])
  if (error) return <div className="flex min-h-[45vh] items-center justify-center text-red-100"><ShieldAlert className="mr-3 h-5 w-5" />{error}</div>
  if (!payload) return <div className="flex min-h-[45vh] items-center justify-center text-white/65">Loading guide preview…</div>

  const { guide, priceCandidates } = payload
  const segments = guide.itinerarySegments || []
  const heroRouteStops = segments.map((segment) => ({ label: `Day ${segment.dayStart}${segment.dayEnd > segment.dayStart ? `–${segment.dayEnd}` : ''}`, name: segment.city, href: `#day-${segment.dayStart}` }))
  return (
    <main className="min-h-screen overflow-x-clip bg-[radial-gradient(circle_at_top,rgba(125,211,252,0.10),transparent_20%),linear-gradient(180deg,#0a101b_0%,#050912_48%,#020409_100%)] text-white">
      <GuideHero guide={guide} routeStops={heroRouteStops} />
      <GuideQuickNav guideSlug={guide.slug} days={segments.map((segment) => ({ dayNumber: segment.dayStart, title: segment.city }))} hasMap={false} hasBudget={false} />
      <div className="mx-auto max-w-6xl space-y-16 px-4 py-10 md:px-8 md:py-16">
        <section id="journey-overview" className="scroll-mt-24"><div className="border-b border-white/10 pb-5"><p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-200/68">Full journey / 完整旅程</p><h2 className="mt-2 font-display text-4xl leading-none text-white md:text-5xl">15天路线概览</h2></div><ol className="mt-6 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">{timeline.map((item) => <li key={item.day} className="border border-white/10 bg-white/[0.025] p-3"><p className="text-[10px] uppercase tracking-[0.18em] text-amber-200/70">Day {item.day}</p><p className="mt-1 font-medium text-white">{item.city}</p></li>)}</ol></section>
        <GuideSegmentItinerarySection guideSlug={guide.slug} segments={segments} />
        <details id="draft-review" className="scroll-mt-24 border border-amber-200/15 bg-amber-300/[0.035] p-5 md:p-6"><summary className="flex cursor-pointer list-none items-center justify-between gap-4"><span><span className="block text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-100/70">Administrator review</span><span className="mt-2 block font-display text-2xl text-white">草稿审核资料</span></span><ChevronDown className="h-5 w-5 shrink-0 text-amber-100" /></summary><div className="mt-6 border-t border-amber-200/15 pt-5"><p className="text-sm text-white/55">待确认的价格、路线映射与图片补充仅供管理员审核，不会出现在读者正文或公开读取层。</p><div className="mt-5 grid gap-3 md:grid-cols-3">{priceCandidates.map((item) => <article key={item.id} className="border border-amber-200/15 bg-black/15 p-4"><p className="font-medium text-white">{item.titleZh}</p><p className="mt-1 text-xs text-white/48">{item.optionLabelZh}</p><p className="mt-2 text-lg font-semibold tabular-nums text-amber-100">{item.currency} {formatCandidateAmount(item)}</p></article>)}</div><div className="mt-5 grid gap-3 md:grid-cols-2">{segments.filter((segment) => segment.pendingItems?.length || segment.globalDayMappingStatus === 'pending' || !segment.imageMatches?.length).map((segment) => <div key={segment.id} className="border border-white/10 p-4 text-sm text-white/62"><p className="font-medium text-white">{segment.city}</p>{segment.pendingItems?.map((item) => <p key={item} className="mt-2">• {item}</p>)}{segment.globalDayMappingStatus === 'pending' ? <p className="mt-2">• 影片路线尚未映射为全程精确 Day。</p> : null}{!segment.imageMatches?.length ? <p className="mt-2">• 图片待用户后续上传。</p> : null}</div>)}</div></div></details>
      </div>
    </main>
  )
}
