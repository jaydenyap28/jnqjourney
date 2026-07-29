import Link from 'next/link'
import { CalendarDays, CornerDownRight, Route } from 'lucide-react'

import {
  formatPriceHighlightAmount,
  guidePriceUnitLabel,
  type PublicGuidePriceHighlight,
} from '@/lib/guide-price-highlights'

function formatPriceDate(value?: string | null) {
  if (!value) return ''
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return ''
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`
}

function groupHighlights(highlights: PublicGuidePriceHighlight[]) {
  const groups = new Map<string, PublicGuidePriceHighlight[]>()
  for (const item of highlights) {
    if (item.displayTargetType !== 'attraction') continue
    const current = groups.get(item.displayTargetId) || []
    current.push(item)
    groups.set(item.displayTargetId, current)
  }
  return Array.from(groups.values())
    .map((items) => items.sort((left, right) => left.displayPriority - right.displayPriority))
    .sort((left, right) => left[0].displayPriority - right[0].displayPriority)
}

function PriceLine({ item, compact = false }: { item: PublicGuidePriceHighlight; compact?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="break-words text-xs leading-5 text-white/56">{item.optionLabelZh || item.titleZh}</p>
      <p className={`${compact ? 'mt-0.5 text-sm' : 'mt-1 text-xl'} break-words font-semibold leading-tight tabular-nums text-white`}>
        {formatPriceHighlightAmount(item.currency, item.amountMinor)}
        <span className="ml-1 text-sm font-medium text-amber-100/72">{guidePriceUnitLabel(item.unit)}</span>
      </p>
    </div>
  )
}

export default function GuidePriceHighlightsSection({
  highlights,
}: {
  highlights: PublicGuidePriceHighlight[]
}) {
  const groups = groupHighlights(highlights.filter((item) => item.isKeyPrice)).slice(0, 8)
  if (!groups.length) return null

  return (
    <section aria-labelledby="guide-key-prices-heading" className="border-t border-white/10 pt-7">
      <div>
        <p id="guide-key-prices-heading" className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-200/76">
          KEY PRICES / 重点价格
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">旅程中较重要的门票与体验价格。</p>
      </div>

      <div className="mt-5 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {groups.map((items) => {
          const primary = items[0]
          const recordedDate = formatPriceDate(primary.paidDate)
          const isWideOptions = primary.topCardLayout === 'wide_options'
          return (
            <article
              key={primary.displayTargetId}
              className={`${isWideOptions ? 'xl:col-span-2' : ''} min-w-0 border border-white/10 bg-[#0b111d] p-4 transition hover:border-amber-200/22 hover:bg-[#0d1421]`}
            >
              <div className="min-w-0">
                <h3 className="break-words text-sm font-semibold leading-6 text-white">{primary.titleZh}</h3>
                {primary.titleEn ? <p className="mt-0.5 break-words text-xs leading-5 text-white/38">{primary.titleEn}</p> : null}
              </div>

              {isWideOptions ? (
                <div className="mt-4 grid gap-3 border-t border-white/8 pt-3 sm:grid-cols-3">
                  {items.map((item) => <PriceLine key={item.id} item={item} />)}
                </div>
              ) : (
                <div className="mt-4">
                  <PriceLine item={primary} />
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-white/8 pt-3 text-xs">
                {recordedDate ? (
                  <p className="inline-flex items-center gap-1.5 tabular-nums text-white/48">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {recordedDate}
                  </p>
                ) : <span />}
                <Link
                  href={`#day-${primary.dayNumber}`}
                  className="inline-flex min-h-6 items-center gap-1.5 font-medium text-amber-100/76 transition hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                >
                  查看 Day {primary.dayNumber}
                  <CornerDownRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </article>
          )
        })}
      </div>

      <p className="mt-4 border-l border-white/12 pl-3 text-xs leading-5 text-white/38">
        价格为当次旅程记录，可能因季节、日期、票种及购买渠道而调整。
      </p>
    </section>
  )
}

export function GuideSpotPriceHighlights({
  highlights,
}: {
  highlights: PublicGuidePriceHighlight[]
}) {
  if (!highlights.length) return null
  const sorted = [...highlights].sort((left, right) => left.displayPriority - right.displayPriority)
  const recordedDate = formatPriceDate(sorted[0].paidDate)

  return (
    <div className="mt-3 border-t border-white/8 pt-3">
      <div className="space-y-2">
        {sorted.map((item) => <PriceLine key={item.id} item={item} compact />)}
      </div>
      {recordedDate ? <p className="mt-2 text-[11px] tabular-nums text-white/36">{recordedDate}</p> : null}
    </div>
  )
}

export function GuideDayCostNote({
  highlights,
}: {
  highlights: PublicGuidePriceHighlight[]
}) {
  if (!highlights.length) return null
  const sorted = [...highlights].sort((left, right) => left.displayPriority - right.displayPriority)
  const primary = sorted[0]

  return (
    <aside className="mt-6 border-l-2 border-sky-200/45 bg-sky-200/[0.055] px-4 py-3.5" aria-label={`${primary.dayCostLabelZh || '当天费用'}：${primary.routeLabelZh || primary.titleZh}`}>
      <div className="flex min-w-0 items-start gap-3">
        <Route className="mt-0.5 h-4 w-4 shrink-0 text-sky-100/78" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-100/70">{primary.dayCostLabelZh || '当天费用'}</p>
          <p className="mt-1 text-sm font-medium text-white">{primary.routeLabelZh || primary.titleZh}</p>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {sorted.map((item) => (
              <div key={item.id} className="min-w-0">
                <span className="text-xs text-white/58">{item.optionLabelZh || item.titleZh}</span>
                <span className="ml-2 text-base font-semibold tabular-nums text-white">
                  {formatPriceHighlightAmount(item.currency, item.amountMinor)}
                  <span className="ml-1 text-sm font-medium text-sky-100/72">{guidePriceUnitLabel(item.unit)}</span>
                </span>
              </div>
            ))}
          </div>
          {primary.displayDetailsZh?.length ? (
            <div className="mt-2 space-y-1 text-xs leading-5 text-white/52">
              {primary.displayDetailsZh.map((detail) => <p key={detail}>{detail}</p>)}
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  )
}
