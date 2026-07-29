import Link from 'next/link'
import { CalendarDays, CornerDownRight, Tag } from 'lucide-react'

import {
  formatPriceHighlightAmount,
  guidePriceTypeLabel,
  guidePriceUnitLabel,
  type PublicGuidePriceHighlight,
} from '@/lib/guide-price-highlights'

function formatPriceMonth(value?: string | null) {
  if (!value) return ''
  const match = value.match(/^(\d{4})-(\d{2})/)
  if (!match) return ''
  return `${match[1]}年${Number(match[2])}月`
}

function groupHighlights(highlights: PublicGuidePriceHighlight[]) {
  const groups = new Map<string, PublicGuidePriceHighlight[]>()
  for (const item of highlights) {
    const current = groups.get(item.attractionSlug) || []
    current.push(item)
    groups.set(item.attractionSlug, current)
  }
  return Array.from(groups.values())
    .map((items) => items.sort((left, right) => left.displayPriority - right.displayPriority))
    .sort((left, right) => left[0].displayPriority - right[0].displayPriority)
}

function PriceLine({ item }: { item: PublicGuidePriceHighlight }) {
  return (
    <div className="min-w-0 border-t border-white/8 pt-3 first:border-t-0 first:pt-0">
      {item.optionLabelZh ? (
        <p className="text-xs leading-5 text-white/56">
          {item.optionLabelZh}
          {item.optionLabelEn ? <span className="ml-1.5 text-white/32">{item.optionLabelEn}</span> : null}
        </p>
      ) : null}
      <p className="mt-1 break-words text-xl font-semibold leading-tight tabular-nums text-white">
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p id="guide-key-prices-heading" className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-200/76">
            Key Prices / 重点价格
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">
            旅程中较重要的固定门票、交通与体验价格。
          </p>
        </div>
        <span className="text-xs tabular-nums text-white/38">{groups.length} 项重点参考</span>
      </div>

      <div className="mt-5 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {groups.map((items) => {
          const primary = items[0]
          const month = formatPriceMonth(primary.paidDate)
          return (
            <article
              key={primary.attractionSlug}
              className="group flex min-w-0 flex-col border border-white/10 bg-[#0b111d] p-4 transition hover:border-amber-200/22 hover:bg-[#0d1421]"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-semibold leading-6 text-white">{primary.titleZh}</h3>
                  {primary.titleEn ? <p className="mt-0.5 break-words text-xs leading-5 text-white/38">{primary.titleEn}</p> : null}
                </div>
                <Tag className="mt-0.5 h-4 w-4 shrink-0 text-amber-200/58" />
              </div>

              <div className="mt-4 space-y-3">
                {items.map((item) => <PriceLine key={item.id} item={item} />)}
              </div>

              <div className="mt-4 space-y-2 border-t border-white/8 pt-3 text-xs leading-5 text-white/48">
                <p>{guidePriceTypeLabel(primary.priceType)}</p>
                {month ? (
                  <p className="flex items-center gap-1.5 tabular-nums">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {month}
                  </p>
                ) : null}
                {primary.includes[0] ? <p className="text-white/58">{primary.includes[0]}</p> : null}
              </div>

              <Link
                href={`#day-${primary.dayNumber}`}
                className="mt-auto inline-flex min-h-10 items-center gap-1.5 pt-4 text-xs font-medium text-amber-100/76 transition hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
              >
                查看 Day {primary.dayNumber}
                <CornerDownRight className="h-3.5 w-3.5" />
              </Link>
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
  const primary = sorted[0]
  const month = formatPriceMonth(primary.paidDate)

  return (
    <div className="mt-3 border-t border-white/8 pt-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200/64">
        {guidePriceTypeLabel(primary.priceType)}
      </p>
      <div className="mt-2 space-y-2">
        {sorted.map((item) => (
          <div key={item.id} className="grid min-w-0 gap-0.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline sm:gap-3">
            <p className="break-words text-xs leading-5 text-white/52">{item.optionLabelZh || item.titleZh}</p>
            <p className="break-words text-sm font-semibold leading-5 tabular-nums text-white">
              {formatPriceHighlightAmount(item.currency, item.amountMinor)}
              <span className="ml-1 font-medium text-amber-100/65">{guidePriceUnitLabel(item.unit)}</span>
            </p>
          </div>
        ))}
      </div>
      {month ? <p className="mt-2 text-[11px] tabular-nums text-white/36">{month}</p> : null}
    </div>
  )
}
