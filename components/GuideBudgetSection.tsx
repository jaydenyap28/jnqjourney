'use client'

import { BedDouble, Calculator, CircleEllipsis, Plane, ReceiptText, RefreshCw, ShoppingBag, Sparkles, Ticket, TrainFront, Users, Utensils, Wallet, Wifi } from 'lucide-react'
import type { ReactNode } from 'react'
import type { TravelGuide } from '@/lib/guides'
import { canonicalGuideBudgetItems, divideSnapshotMoney, formatGuideBudgetCents, guideBudgetMoneyToCents, type GuideBudgetDisplaySnapshot } from '@/lib/guide-budget'

type TripCostSnapshot = Omit<GuideBudgetDisplaySnapshot, 'source_project_name'> & { source_project_name?: string }
const ICONS = { Flights: Plane, Transportation: TrainFront, Accommodation: BedDouble, 'Food & Dining': Utensils, 'Tickets & Entrance Fees': Ticket, Activities: Sparkles, 'Internet & Communication': Wifi, Shopping: ShoppingBag, Other: CircleEllipsis }

function estimatedScopeLabel(scope?: string) {
  return ({ per_person: '每人预算', per_room: '每房预算', per_group: '每组预算', total_trip: '预算总额' } as Record<string, string>)[scope || ''] || '预算总额'
}
function formatDate(value: string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(date) : ''
}
function CategoryGrid({ categories, currency, totalCents, tone }: { categories: ReturnType<typeof canonicalGuideBudgetItems>['categories']; currency: string; totalCents: number; tone: 'estimated' | 'actual' }) {
  return <div className="grid min-w-0 grid-cols-1 gap-3 min-[360px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
    {categories.map((item) => {
      const Icon = ICONS[item.key as keyof typeof ICONS] || CircleEllipsis
      const percentage = totalCents > 0 ? Math.min(100, Math.max(0, (item.amountCents / totalCents) * 100)) : 0
      return <article key={item.key} className="min-w-0 border border-white/10 bg-[#0b111d] px-4 py-4 md:px-5">
        <p className="flex items-center gap-2 break-words text-xs font-medium leading-5 text-white/62"><Icon className="h-3.5 w-3.5 shrink-0" />{item.label}</p>
        <p className="mt-2 break-words text-lg font-semibold leading-tight tabular-nums text-white md:text-xl">{formatGuideBudgetCents(currency, item.amountCents)}</p>
        <p className="mt-3 text-[10px] font-medium uppercase tracking-[0.16em] tabular-nums text-white/42">{percentage.toFixed(1)}% of total</p>
        <div className="mt-2 h-1 overflow-hidden bg-white/8" aria-hidden="true"><div className={tone === 'actual' ? 'h-full bg-emerald-300/75' : 'h-full bg-amber-300/75'} style={{ width: `${percentage ? Math.max(2, percentage) : 0}%` }} /></div>
        {item.note ? <p className="mt-3 text-xs leading-5 text-white/48">{item.note}</p> : null}
      </article>
    })}
  </div>
}
function SummaryMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="min-w-0 border-t border-white/10 pt-3 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0"><dt className="flex items-center gap-1.5 text-xs text-white/42">{icon}{label}</dt><dd className="mt-1.5 break-words text-sm font-medium tabular-nums text-white">{value}</dd></div>
}
export default function GuideBudgetSection({ guide, actualSpend, showAdminSourceNote = false }: { guide: Pick<TravelGuide, 'budget' | 'budgetItems' | 'budgetScope'>; actualSpend: TripCostSnapshot | null; showAdminSourceNote?: boolean }) {
  const estimated = canonicalGuideBudgetItems(guide.budgetItems)
  const actual = actualSpend ? canonicalGuideBudgetItems(Object.entries(actualSpend.categories).map(([label, amount]) => ({ label, amount }))) : null
  if (!actualSpend && !estimated.categories.length) return null
  const categories = actual?.categories || estimated.categories
  const totalCents = actual?.totalCents ?? estimated.totalCents
  const currency = actualSpend?.currency || 'RM'
  const average = actualSpend?.traveller_count && actualSpend.traveller_count > 0 ? divideSnapshotMoney(actualSpend.total, actualSpend.traveller_count) : null
  return <section id="budget" className="scroll-mt-24"><div className="border-b border-white/10 pb-5"><h2 className="font-display text-4xl leading-none text-white md:text-5xl">Trip Cost <span className="text-white/42">/ 旅程花费</span></h2></div><div className="mt-6"><div className={`border p-5 md:p-6 ${actualSpend ? 'border-emerald-200/16 bg-[#0b111d]' : 'border-amber-200/14 bg-[#0b111d]'}`}><span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold tracking-[0.16em] ${actualSpend ? 'border-emerald-200/20 bg-emerald-300/[0.08] text-emerald-100/80' : 'border-amber-200/20 bg-amber-300/[0.08] text-amber-100/80'}`}>{actualSpend ? '实际花费' : '预算'}</span><div className="mt-5 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1.85fr)] lg:items-end"><div className="min-w-0"><div className={actualSpend ? 'text-emerald-100/75' : 'text-amber-100/75'}><div className="flex items-center gap-2"><Wallet className="h-4 w-4" /><p className="text-xs font-semibold uppercase tracking-[0.22em]">{actualSpend ? '实际总支出' : estimatedScopeLabel(guide.budgetScope)}</p></div></div><p className="mt-3 break-words text-[clamp(2rem,5vw,3.7rem)] font-semibold leading-none tabular-nums text-white">{formatGuideBudgetCents(currency, totalCents)}</p></div>{actualSpend ? <dl className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{actualSpend.traveller_count && actualSpend.scope !== 'unspecified' ? <SummaryMetric icon={<Users className="h-3.5 w-3.5" />} label="旅客人数" value={`${actualSpend.traveller_count} 位`} /> : null}{average ? <SummaryMetric icon={<Calculator className="h-3.5 w-3.5" />} label="平均每人" value={`${formatGuideBudgetCents(currency, guideBudgetMoneyToCents(average) || 0)}／人`} /> : null}<SummaryMetric icon={<ReceiptText className="h-3.5 w-3.5" />} label="记录数量" value={`${actualSpend.transaction_count} 笔`} /><SummaryMetric icon={<RefreshCw className="h-3.5 w-3.5" />} label="最后同步" value={formatDate(actualSpend.received_at)} /></dl> : <p className="max-w-lg border-t border-white/10 pt-4 text-sm leading-6 text-white/48 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">金额会因人数、汇率与消费习惯不同而变化。</p>}</div>{showAdminSourceNote && actualSpend?.source_project_name ? <p className="mt-5 border-t border-white/8 pt-4 text-xs text-white/45">实际花费根据 MoneyBot 项目整理。</p> : null}</div>{categories.length ? <div className="mt-3"><CategoryGrid categories={categories} currency={currency} totalCents={totalCents} tone={actualSpend ? 'actual' : 'estimated'} /></div> : null}</div></section>
}
