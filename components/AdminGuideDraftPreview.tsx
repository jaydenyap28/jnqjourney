'use client'

import { useEffect, useMemo, useState } from 'react'
import { MapPin, Route, ShieldAlert } from 'lucide-react'

import { adminFetch } from '@/lib/admin-fetch'
import type { TravelGuide } from '@/lib/guides'
import type { GuidePriceHighlight } from '@/lib/guide-price-highlights'
import GuideQuickNav from '@/components/GuideQuickNav'
import GuideVideoCard from '@/components/GuideVideoCard'

type Payload = { guide: TravelGuide; priceCandidates: GuidePriceHighlight[] }

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
      } catch (reason: any) { if (active) setError(reason?.message || 'Unable to load guide draft.') }
    })()
    return () => { active = false }
  }, [guideSlug])

  const timeline = useMemo(() => {
    if (!payload?.guide.itinerarySegments?.length) return []
    return payload.guide.itinerarySegments.flatMap((segment) => Array.from({ length: segment.dayEnd - segment.dayStart + 1 }, (_, offset) => ({ day: segment.dayStart + offset, city: segment.city, date: new Date(new Date(`${segment.dateStart}T00:00:00`).getTime() + offset * 86400000).toISOString().slice(0, 10) })))
  }, [payload])

  if (error) return <div className="flex min-h-[45vh] items-center justify-center text-red-100"><ShieldAlert className="mr-3 h-5 w-5" />{error}</div>
  if (!payload) return <div className="flex min-h-[45vh] items-center justify-center text-white/65">Loading admin guide draft…</div>
  const { guide, priceCandidates } = payload
  const segments = guide.itinerarySegments || []
  const candidatesById = new Map(priceCandidates.map((item) => [item.id, item]))
  return (
    <div className="space-y-14">
      <header className="overflow-hidden border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.17),transparent_32%),#0b111d] p-6 md:p-10">
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-200/75">Travel Guide / 游记</p>
        <h1 className="mt-4 font-display text-4xl leading-none text-white md:text-6xl">{guide.title}</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-white/72">{guide.tagline}</p>
        <dl className="mt-7 grid gap-4 border-t border-white/10 pt-5 sm:grid-cols-3">
          <div><dt className="text-xs text-white/45">旅程</dt><dd className="mt-1 font-semibold text-white">15天14夜</dd></div>
          <div><dt className="text-xs text-white/45">日期</dt><dd className="mt-1 font-semibold text-white">2025年11月4日－11月18日</dd></div>
          <div><dt className="text-xs text-white/45">已证实城市区间</dt><dd className="mt-1 font-semibold text-white">6 个</dd></div>
        </dl>
      </header>

      <GuideQuickNav guideSlug={guide.slug} days={segments.map((segment) => ({ dayNumber: segment.dayStart, title: segment.city }))} hasMap={true} hasBudget={false} />

      <section id="journey-overview" className="scroll-mt-24">
        <div className="border-b border-white/10 pb-5"><p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-200/70">Full journey / 完整旅程</p><h2 className="mt-2 font-display text-4xl text-white">15天路线概览</h2></div>
        <ol className="mt-6 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {timeline.map((item) => <li key={item.day} className="border border-white/10 bg-white/[0.025] p-3"><p className="text-[10px] uppercase tracking-[0.18em] text-amber-200/70">Day {item.day}</p><p className="mt-1 font-medium text-white">{item.city}</p><time className="mt-1 block text-xs text-white/48">{formatDate(item.date)}</time></li>)}
        </ol>
      </section>

      <section id="route-map" className="scroll-mt-24"><div className="border-b border-white/10 pb-5"><p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-200/70">Route map / 路线地图</p><h2 className="mt-2 font-display text-4xl text-white">城市路线</h2></div><div className="mt-6 flex flex-wrap items-center gap-2 text-sm text-white/82">{segments.map((segment, index) => <span key={segment.id} className="inline-flex items-center gap-2"><span className="border border-white/10 bg-white/[0.03] px-3 py-2">{segment.city}</span>{index < segments.length - 1 ? <Route className="h-4 w-4 text-amber-200/55" /> : null}</span>)}</div><p className="mt-3 text-sm leading-6 text-white/48">城市区间已按原始旅程资料确认；未获可靠坐标的景点不会被加入地图。</p></section>


      <section id="itinerary" className="scroll-mt-24"><div className="border-b border-white/10 pb-5"><p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-200/70">Itinerary / 城市行程</p><h2 className="mt-2 font-display text-4xl text-white">6个城市区间</h2></div><div className="divide-y divide-white/10">{segments.map((segment) => <article id={`day-${segment.dayStart}`} key={segment.id} className="py-9 md:py-12"><header className="grid gap-3 md:grid-cols-[8rem_minmax(0,1fr)_auto] md:items-end"><p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-200">Day {segment.dayStart}{segment.dayEnd > segment.dayStart ? `–${segment.dayEnd}` : ''}</p><h3 className="text-3xl text-white">{segment.city}</h3><time className="text-sm text-white/52">{dateRange(segment.dateStart, segment.dateEnd)}</time></header><p className="mt-5 max-w-3xl text-sm leading-7 text-white/70">{segment.summary}</p><div className="mt-6 grid gap-3 lg:grid-cols-2">{segment.verifiedRoutes.map((route) => <section key={route.title} className="border border-white/10 bg-white/[0.025] p-4"><p className="font-medium text-white">{route.title}</p><p className="mt-2 text-sm leading-6 text-white/62">{route.summary}</p>{route.linkedSpots?.length ? <div className="mt-3 flex flex-wrap gap-2">{route.linkedSpots.map((spot) => <span key={spot} className="inline-flex items-center gap-1 border border-white/10 px-2 py-1 text-xs text-white/66"><MapPin className="h-3 w-3" />{spot}</span>)}</div> : null}</section>)}</div>{segment.actualExperiences?.length ? <section className="mt-4 border-l-2 border-emerald-200/45 bg-emerald-200/[0.04] p-4"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-100">实际经验</p><ul className="mt-3 space-y-2 text-sm leading-6 text-white/68">{segment.actualExperiences.map((item) => <li key={item}>• {item}</li>)}</ul></section> : null}{segment.practicalTips?.length ? <section className="mt-4 border border-sky-200/15 bg-sky-300/[0.05] p-4"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-100">实用提醒</p><ul className="mt-3 space-y-2 text-sm leading-6 text-white/68">{segment.practicalTips.map((item) => <li key={item}>• {item}</li>)}</ul></section> : null}{segment.referenceRoutes?.length ? <aside className="mt-4 border-l-2 border-amber-200/40 bg-amber-200/[0.04] p-4 text-sm text-white/64"><p className="font-medium text-amber-100">附近延伸选择</p>{segment.referenceRoutes.map((route) => <p key={route.title} className="mt-2 leading-6">{route.summary}</p>)}</aside> : null}{segment.transport ? <div className="mt-4 flex gap-3 border border-sky-200/15 bg-sky-300/[0.05] p-4 text-sm text-white/70"><Route className="mt-0.5 h-4 w-4 shrink-0 text-sky-100" /><p>{segment.transport}</p></div> : null}{segment.accommodation ? <div className="mt-4 border border-white/10 p-4 text-sm text-white/70"><p className="text-xs uppercase tracking-[0.2em] text-white/45">住宿</p><p className="mt-2">{segment.accommodation}</p></div> : null}{segment.media?.map((media, index) => { const id = youtubeId(media.url); return id ? <GuideVideoCard key={media.label} videoId={id} title={media.label} guideSlug={guide.slug} dayNumber={segment.dayStart + index} /> : null })}</article>)}</div></section>

      <section id="draft-review" className="border border-amber-200/15 bg-amber-300/[0.035] p-5 md:p-6"><p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-100/70">Administrator review</p><h2 className="mt-2 font-display text-3xl text-white">待确认资料</h2><p className="mt-2 text-sm text-white/55">这些审核资料不会进入读者版正文或公开读取层。</p><div className="mt-5 grid gap-3 md:grid-cols-3">{priceCandidates.map((item) => <article key={item.id} className="border border-amber-200/15 bg-black/15 p-4"><p className="font-medium text-white">{item.titleZh}</p><p className="mt-1 text-xs text-white/48">{item.optionLabelZh}</p><p className="mt-2 text-lg font-semibold tabular-nums text-amber-100">{item.currency} {(item.amountMinor / 100).toFixed(2)}</p></article>)}</div><div className="mt-5 grid gap-3 md:grid-cols-2">{segments.filter((segment) => segment.pendingItems?.length || segment.globalDayMappingStatus === 'pending').map((segment) => <div key={segment.id} className="border border-white/10 p-4 text-sm text-white/62"><p className="font-medium text-white">{segment.city}</p>{segment.pendingItems?.map((item) => <p key={item} className="mt-2">• {item}</p>)}{segment.globalDayMappingStatus === 'pending' ? <p className="mt-2">• 影片内路线尚未映射为全程精确 Day。</p> : null}{!segment.imageMatches?.length ? <p className="mt-2">• 图片待用户后续上传。</p> : null}</div>)}</div></section>

    </div>
  )
}
