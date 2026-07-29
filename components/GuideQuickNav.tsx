'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { trackEvent } from '@/lib/analytics'

interface GuideQuickNavProps {
  guideSlug: string
  days: Array<{ dayNumber: number; title: string }>
  hasMap: boolean
  hasBudget: boolean
}

export default function GuideQuickNav({ guideSlug, days, hasMap, hasBudget }: GuideQuickNavProps) {
  const items = useMemo(
    () => [
      ...(hasMap ? [{ id: 'route-map', label: '路线地图', shortLabel: '路线' }] : []),
      ...(hasBudget ? [{ id: 'budget', label: '旅程花费', shortLabel: '花费' }] : []),
      ...days.map((day) => ({
        id: `day-${day.dayNumber}`,
        label: `Day ${day.dayNumber} · ${day.title}`,
        shortLabel: `D${day.dayNumber}`,
        dayNumber: day.dayNumber,
      })),
    ],
    [days, hasBudget, hasMap]
  )
  const [activeId, setActiveId] = useState(items[0]?.id || '')

  useEffect(() => {
    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((section): section is HTMLElement => Boolean(section))
    if (!sections.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)
        if (visible[0]) {
          const id = visible[0].target.id
          setActiveId(id)
          const dayNumber = Number(id.replace('day-', ''))
          if (Number.isFinite(dayNumber)) {
            trackEvent('guide_day_view', { guide_slug: guideSlug, day_number: dayNumber })
          }
        }
      },
      { rootMargin: '-18% 0px -68% 0px', threshold: [0, 0.1] }
    )

    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [guideSlug, items])

  function jumpTo(id: string) {
    const target = document.getElementById(id)
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.history.replaceState(null, '', `#${id}`)
    setActiveId(id)
    const dayNumber = Number(id.replace('day-', ''))
    trackEvent('guide_day_jump', {
      guide_slug: guideSlug,
      day_number: Number.isFinite(dayNumber) ? dayNumber : undefined,
      section: id,
    })
  }

  return (
    <nav
      aria-label="攻略快速导航"
      className="sticky top-0 z-40 border-y border-white/10 bg-[#070b13]/92 shadow-[0_12px_40px_rgba(0,0,0,0.22)] backdrop-blur-xl"
    >
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <div className="relative py-3 md:hidden">
          <label htmlFor="guide-day-nav" className="sr-only">选择攻略章节</label>
          <select
            id="guide-day-nav"
            value={activeId}
            onChange={(event) => jumpTo(event.target.value)}
            className="h-11 w-full appearance-none rounded-xl border border-white/12 bg-white/[0.06] px-4 pr-10 text-sm text-white outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-300/25"
          >
            {items.map((item) => <option key={item.id} value={item.id} className="bg-slate-950">{item.label}</option>)}
          </select>
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/55" />
        </div>

        <div className="hidden items-center gap-1 overflow-x-auto py-2 md:flex [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="mr-3 shrink-0 text-[10px] font-semibold uppercase tracking-[0.28em] text-white/42">Guide Index</span>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => jumpTo(item.id)}
              aria-current={activeId === item.id ? 'location' : undefined}
              className={`min-h-9 shrink-0 rounded-full px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
                activeId === item.id
                  ? 'bg-amber-300 text-slate-950'
                  : 'text-white/62 hover:bg-white/8 hover:text-white'
              }`}
            >
              {item.shortLabel}
            </button>
          ))}
        </div>
      </div>
    </nav>
  )
}
