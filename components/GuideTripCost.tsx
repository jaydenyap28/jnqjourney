
'use client'

import {PublicCopy} from '@/components/PublicLocale'
import {
  BedDouble,
  Calculator,
  CircleEllipsis,
  Plane,
  ReceiptText,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Ticket,
  TrainFront,
  Users,
  Utensils,
  Wallet,
  Wifi,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

import {
  formatConvertedGuideBudgetCents,
  formatGuideBudgetCents,
  formatGuideDisplayAmount,
  normalizeGuideDisplayCurrency,
  type GuideDisplayCurrency,
  type PublicGuideTripCost,
} from '@/lib/guide-budget'

const CURRENCY_PREFERENCE_KEY = 'jnq-guide-trip-cost-currency'

const ICONS = {
  Flights: Plane,
  Transportation: TrainFront,
  Accommodation: BedDouble,
  'Food & Dining': Utensils,
  'Tickets & Entrance Fees': Ticket,
  Activities: Sparkles,
  'Internet & Communication': Wifi,
  Shopping: ShoppingBag,
  Other: CircleEllipsis,
}

function currencyLabel(currency: string) {
  return currency.toUpperCase() === 'MYR' ? 'RM' : currency
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(date)
    : ''
}

function preferredCurrency(locale: string): GuideDisplayCurrency {
  const normalized = locale.toLowerCase()
  if (normalized === 'zh-cn') return 'CNY'
  if (normalized.startsWith('ja')) return 'JPY'
  if (normalized === 'en-us') return 'USD'
  if (normalized === 'en-sg' || normalized === 'zh-sg') return 'SGD'
  return 'MYR'
}

function SummaryMetric({ icon, label, value, converted }: { icon: ReactNode; label: string; value: string; converted?: string | null }) {
  return (
    <div className="min-w-0 border-t border-white/10 pt-3 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
      <dt className="flex items-center gap-1.5 text-xs text-white/42">{icon}<PublicCopy text={label}/></dt>
      <dd className="mt-1.5 break-words text-sm font-medium tabular-nums text-white"><PublicCopy text={value}/></dd>
      {converted ? <dd className="mt-1 break-words text-xs tabular-nums text-amber-100/62">≈ {converted}</dd> : null}
    </div>
  )
}

export default function GuideTripCost({ tripCost }: { tripCost: PublicGuideTripCost }) {
  if (tripCost.source === 'hidden') return null
  const sourceCurrency = normalizeGuideDisplayCurrency(tripCost.currency)
  const currency = currencyLabel(tripCost.currency)
  const originalAmount = (cents: number) => sourceCurrency
    ? formatGuideDisplayAmount(sourceCurrency, cents / 100)
    : formatGuideBudgetCents(currency, cents)
  const [displayCurrency, setDisplayCurrency] = useState<GuideDisplayCurrency>('MYR')
  const [rates, setRates] = useState<Record<string, number> | null>(null)
  const [fxDate, setFxDate] = useState('')
  const [fxUnavailable, setFxUnavailable] = useState(false)

  useEffect(() => {
    try {
      const saved = normalizeGuideDisplayCurrency(window.localStorage.getItem(CURRENCY_PREFERENCE_KEY))
      setDisplayCurrency(saved || preferredCurrency(window.navigator.language || ''))
    } catch {
      setDisplayCurrency(preferredCurrency(window.navigator.language || ''))
    }
  }, [])

  useEffect(() => {
    if (!sourceCurrency || displayCurrency === sourceCurrency) {
      setRates(null)
      setFxDate('')
      setFxUnavailable(false)
      return
    }
    let active = true
    setRates(null)
    setFxDate('')
    setFxUnavailable(false)
    fetch(`/api/fx?base=${sourceCurrency}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('FX unavailable')
        const payload = await response.json() as { date?: unknown; rates?: Record<string, unknown> }
        const rate = Number(payload.rates?.[displayCurrency])
        if (!Number.isFinite(rate) || rate <= 0 || !String(payload.date || '')) throw new Error('Invalid FX payload')
        if (active) {
          setRates({ [displayCurrency]: rate })
          setFxDate(String(payload.date))
        }
      })
      .catch(() => { if (active) setFxUnavailable(true) })
    return () => { active = false }
  }, [displayCurrency, sourceCurrency])

  const convertedAmount = (cents: number) => {
    if (!sourceCurrency || displayCurrency === sourceCurrency) return null
    return formatConvertedGuideBudgetCents(cents, rates?.[displayCurrency] ?? Number.NaN, displayCurrency)
  }

  const chooseCurrency = (nextCurrency: GuideDisplayCurrency) => {
    setDisplayCurrency(nextCurrency)
    try { window.localStorage.setItem(CURRENCY_PREFERENCE_KEY, nextCurrency) } catch {}
  }
  const receivedAt = tripCost.receivedAt ? formatDate(tripCost.receivedAt) : ''
  const metrics = [
    tripCost.travellers ? <SummaryMetric key="travellers" icon={<Users className="h-3.5 w-3.5" />} label="旅客人数" value={`${tripCost.travellers} 位`} /> : null,
    tripCost.perPersonCents !== null ? <SummaryMetric key="per-person" icon={<Calculator className="h-3.5 w-3.5" />} label="平均每人" value={`${originalAmount(tripCost.perPersonCents)}／人`} converted={convertedAmount(tripCost.perPersonCents) ? `${convertedAmount(tripCost.perPersonCents)}／人` : null} /> : null,
    tripCost.transactionCount !== null ? <SummaryMetric key="transactions" icon={<ReceiptText className="h-3.5 w-3.5" />} label="记录数量" value={`${tripCost.transactionCount} 笔`} /> : null,
    receivedAt ? <SummaryMetric key="received" icon={<RefreshCw className="h-3.5 w-3.5" />} label="最后同步" value={receivedAt} /> : null,
  ].filter(Boolean)

  return (
    <section id="budget" className="min-w-0 scroll-mt-24">
      <div className="border-b border-white/10 pb-5">
        <h2 className="font-display text-4xl leading-none text-white md:text-5xl">
          Trip Cost <span className="text-white/42"><PublicCopy text={"/ 旅程花费"}/></span>
        </h2>
      </div>

      <div className="mt-6">
        <div className="border border-amber-200/14 bg-[#0b111d] p-5 md:p-6">
          <span className="inline-flex rounded-full border border-amber-200/20 bg-amber-300/[0.08] px-3 py-1 text-[10px] font-semibold tracking-[0.16em] text-amber-100/80">
            <PublicCopy text={tripCost.source === 'published_actual' ? '实际花费' : '预算'}/>
          </span>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-y border-white/8 py-2.5">
            <span className="mr-1 text-[10px] font-semibold tracking-[0.16em] text-amber-100/55">参考币种</span>
            {(['MYR', 'CNY', 'USD', 'JPY', 'SGD'] as GuideDisplayCurrency[]).map((item) => (
              <button key={item} type="button" onClick={() => chooseCurrency(item)} aria-pressed={displayCurrency === item}
                className={`border px-2 py-1 text-[10px] font-semibold tracking-[0.08em] transition-colors focus:outline-none focus:ring-2 focus:ring-amber-200/60 ${displayCurrency === item ? 'border-amber-200/50 bg-amber-300/15 text-amber-100' : 'border-white/12 text-white/52 hover:border-amber-100/35 hover:text-amber-50'}`}>
                {item}
              </button>
            ))}
          </div>
          <div className="mt-5 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1.85fr)] lg:items-end">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-amber-100/75">
                <Wallet className="h-4 w-4" />
                <p className="text-xs font-semibold uppercase tracking-[0.22em]">
                  {tripCost.source === 'published_actual' ? '实际总支出' : '预算总额'}
                </p>
              </div>
              <p className="mt-3 break-words text-[clamp(2rem,5vw,3.7rem)] font-semibold leading-none tabular-nums text-white">
                {originalAmount(tripCost.totalCents)}
              </p>
              {convertedAmount(tripCost.totalCents) ? <p className="mt-2 text-sm tabular-nums text-amber-100/68">≈ {convertedAmount(tripCost.totalCents)}</p> : null}
            </div>
            {metrics.length ? (
              <dl className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{metrics}</dl>
            ) : (
              <p className="max-w-lg border-t border-white/10 pt-4 text-sm leading-6 text-white/48 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0"><PublicCopy text={"\n                金额会因人数、汇率与消费习惯不同而变化。\n              "}/></p>
            )}
          </div>
        </div>

        <p className="mt-3 text-[11px] leading-5 text-white/42">
          {fxUnavailable ? '汇率暂不可用' : sourceCurrency && displayCurrency !== sourceCurrency && fxDate ? `换算金额仅供参考，实际汇率以付款时为准 · 汇率日期 ${fxDate}` : '换算金额仅供参考，实际汇率以付款时为准'}
        </p>

        <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 min-[360px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {tripCost.categories.map((item) => {
            const Icon = ICONS[item.key] || CircleEllipsis
            const percentage = tripCost.totalCents > 0 ? (item.amountCents / tripCost.totalCents) * 100 : 0
            return (
              <article key={item.key} className="min-w-0 border border-white/10 bg-[#0b111d] px-4 py-4 md:px-5">
                <p className="flex items-center gap-2 break-words text-xs font-medium leading-5 text-white/62">
                  <Icon className="h-3.5 w-3.5 shrink-0" /><PublicCopy text={item.label}/>
                </p>
                <p className="mt-2 break-words text-lg font-semibold leading-tight tabular-nums text-white md:text-xl">
                  {originalAmount(item.amountCents)}
                </p>
                {convertedAmount(item.amountCents) ? <p className="mt-1 text-xs tabular-nums text-amber-100/62">≈ {convertedAmount(item.amountCents)}</p> : null}
                <p className="mt-3 text-[10px] font-medium uppercase tracking-[0.16em] tabular-nums text-white/42">
                  {percentage.toFixed(1)}% of total
                </p>
                <div className="mt-2 h-1 overflow-hidden bg-white/8" aria-hidden="true">
                  <div className="h-full bg-amber-300/75" style={{ width: `${percentage ? Math.max(2, percentage) : 0}%` }} />
                </div>
                {item.note ? <p className="mt-3 text-xs leading-5 text-white/48">{item.note}</p> : null}
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
