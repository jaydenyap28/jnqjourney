import { CalendarDays, ReceiptText, RefreshCw, Users, Wallet } from 'lucide-react'

import type { TravelGuide } from '@/lib/guides'
import {
  PUBLIC_BUDGET_CATEGORY_LABELS,
  formatSnapshotMoney,
  guideBudgetScopeLabel,
  type GuideBudgetSnapshotRecord,
} from '@/lib/guide-budget'

function parseMoney(value?: string | null) {
  const parsed = Number(String(value || '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function formatEstimatedMoney(value?: string | null, fallbackCurrency = 'RM') {
  const text = String(value || '').trim()
  if (!text) return ''
  if (/^(rm|cny|jpy|thb|idr|usd|rmb|myr|¥|￥|\$)/i.test(text)) return text
  return `${fallbackCurrency} ${text}`
}

function estimatedScopeLabel(scope?: string) {
  switch (scope) {
    case 'per_person':
      return '每人预算'
    case 'per_room':
      return '每房预算'
    case 'per_group':
      return '每组预算'
    case 'total_trip':
      return '整趟总预算'
    default:
      return '预算口径未指定'
  }
}

function tripDays(snapshot: GuideBudgetSnapshotRecord) {
  const start = Date.parse(`${snapshot.trip_date_from}T00:00:00Z`)
  const end = Date.parse(`${snapshot.trip_date_to}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null
  return Math.round((end - start) / 86_400_000) + 1
}

function formatDate(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(date)
}

function CategoryGrid({
  categories,
  currency,
  total,
  tone,
}: {
  categories: Array<{ label: string; amount: number; note?: string }>
  currency: string
  total: number
  tone: 'estimated' | 'actual'
}) {
  return (
    <div className="grid min-w-0 gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,13rem),1fr))]">
      {categories.map((item, index) => {
        const percentage = total > 0 ? Math.min(100, Math.max(0, (item.amount / total) * 100)) : 0
        const visiblePercentage = percentage > 0 ? Math.max(2, percentage) : 0
        return (
          <article
            key={`${item.label}-${item.amount}-${index}`}
            className="min-w-0 border border-white/10 bg-[#0b111d] px-4 py-4"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 text-xs leading-5 text-white/62">{item.label}</p>
              <p className="shrink-0 text-right text-lg font-semibold tabular-nums text-white">
                {formatSnapshotMoney(currency, item.amount)}
              </p>
            </div>
            <div className="mt-4 h-1 overflow-hidden bg-white/8" aria-hidden="true">
              <div
                className={tone === 'actual' ? 'h-full bg-emerald-300/75' : 'h-full bg-amber-300/75'}
                style={{ width: `${visiblePercentage}%` }}
              />
            </div>
            <p className="mt-2 text-[10px] tabular-nums text-white/38">{percentage.toFixed(1)}%</p>
            {item.note ? <p className="mt-2 text-xs leading-5 text-white/48">{item.note}</p> : null}
          </article>
        )
      })}
    </div>
  )
}

export default function GuideBudgetSection({
  guide,
  actualSpend,
}: {
  guide: TravelGuide
  actualSpend: GuideBudgetSnapshotRecord | null
}) {
  const hasEstimated = Boolean(guide.budget || guide.budgetItems.length)
  const hasActual = Boolean(actualSpend)
  if (!hasEstimated && !hasActual) return null

  const heading = hasEstimated && hasActual ? '预算与实际花费' : hasActual ? '实际花费拆解' : '预算拆解'
  const estimatedItems = guide.budgetItems.map((item) => ({
    label: item.label || '预算项目',
    amount: parseMoney(item.amount),
    note: item.note,
  }))
  const estimatedTotal = parseMoney(guide.budget) || estimatedItems.reduce((sum, item) => sum + item.amount, 0)
  const actualCategories = actualSpend
    ? Object.entries(actualSpend.categories)
        .map(([key, value]) => ({
          label: PUBLIC_BUDGET_CATEGORY_LABELS[key] ? `${key} / ${PUBLIC_BUDGET_CATEGORY_LABELS[key]}` : key,
          amount: Number(value),
        }))
        .filter((item) => Number.isFinite(item.amount) && item.amount !== 0)
    : []
  const actualTotal = actualSpend ? Number(actualSpend.total) : 0
  const days = actualSpend ? tripDays(actualSpend) : null

  return (
    <section id="budget" className="scroll-mt-24">
      <div className="border-b border-white/10 pb-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-200/68">
          Trip Cost / 旅程花费
        </p>
        <h2 className="mt-2 font-display text-4xl leading-none text-white md:text-5xl">{heading}</h2>
      </div>

      {actualSpend ? (
        <div className="mt-6">
          <div className="border border-emerald-200/16 bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.13),transparent_38%),#0b111d] p-5 md:p-6">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1.85fr)] lg:items-end">
              <div>
                <div className="flex items-center gap-2 text-emerald-100/75">
                  <Wallet className="h-4 w-4" />
                  <p className="text-xs font-semibold uppercase tracking-[0.22em]">实际总花费</p>
                </div>
                <p className="mt-4 break-words text-[clamp(2rem,5vw,3.7rem)] font-semibold leading-none tabular-nums text-white">
                  {formatSnapshotMoney(actualSpend.currency, actualSpend.total)}
                </p>
                <p className="mt-3 text-sm leading-6 text-white/62">
                  {guideBudgetScopeLabel(actualSpend.scope, actualSpend.traveller_count)}
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm sm:grid-cols-4">
                {actualSpend.traveller_count && actualSpend.scope !== 'unspecified' ? (
                  <div>
                    <dt className="flex items-center gap-1.5 text-white/42"><Users className="h-3.5 w-3.5" />人数</dt>
                    <dd className="mt-1 font-medium text-white">{actualSpend.traveller_count} 人</dd>
                  </div>
                ) : null}
                {days ? (
                  <div>
                    <dt className="flex items-center gap-1.5 text-white/42"><CalendarDays className="h-3.5 w-3.5" />旅程天数</dt>
                    <dd className="mt-1 font-medium text-white">{days} 天</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="flex items-center gap-1.5 text-white/42"><ReceiptText className="h-3.5 w-3.5" />交易笔数</dt>
                  <dd className="mt-1 font-medium text-white">{actualSpend.transaction_count} 笔</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-white/42"><RefreshCw className="h-3.5 w-3.5" />最后同步</dt>
                  <dd className="mt-1 font-medium text-white">{formatDate(actualSpend.received_at)}</dd>
                </div>
              </dl>
            </div>
            <p className="mt-5 border-t border-white/8 pt-4 text-xs text-white/45">
              根据 MoneyBot 记账整理
            </p>
          </div>

          {actualCategories.length ? (
            <div className="mt-3">
              <CategoryGrid
                categories={actualCategories}
                currency={actualSpend.currency}
                total={actualTotal}
                tone="actual"
              />
            </div>
          ) : null}
          <p className="mt-4 border-l border-emerald-300/35 pl-4 text-sm leading-7 text-white/58">
            实际花费根据当次旅程记账整理，金额会因人数、汇率、消费习惯和记录范围不同。
          </p>
        </div>
      ) : null}

      {hasEstimated ? (
        <div className={actualSpend ? 'mt-10 border-t border-white/10 pt-8' : 'mt-6'}>
          {actualSpend ? <h3 className="mb-4 text-xl font-semibold text-white">原有预算</h3> : null}
          <div className="border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.13),transparent_38%),#0b111d] p-5 md:p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-100/70">
                  {estimatedScopeLabel(guide.budgetScope)}
                </p>
                {guide.budget ? (
                  <p className="mt-3 text-[clamp(1.9rem,4vw,3.1rem)] font-semibold leading-none tabular-nums text-white">
                    {formatEstimatedMoney(guide.budget)}
                  </p>
                ) : null}
              </div>
              <p className="max-w-md text-sm leading-6 text-white/48">
                预算用于行前规划，不代表 MoneyBot 同步的实际记账金额。
              </p>
            </div>
          </div>
          {estimatedItems.length ? (
            <div className="mt-3">
              <CategoryGrid categories={estimatedItems} currency="RM" total={estimatedTotal} tone="estimated" />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
