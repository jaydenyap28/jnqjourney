import { GUIDE_TRIP_COST_CATEGORIES, canonicalTripCostCategory, getTripCostCategory, orderedTripCostCategoryEntries, type GuideTripCostCategoryKey } from './guide-trip-cost-categories.ts'

export {
  GUIDE_TRIP_COST_CATEGORIES,
  canonicalTripCostCategory,
  getTripCostCategory,
  orderedTripCostCategoryEntries,
  type GuideTripCostCategory,
  type GuideTripCostCategoryKey,
} from './guide-trip-cost-categories.ts'

export const GUIDE_BUDGET_SCOPES = ['per_person', 'per_room', 'per_group', 'total_trip', 'unspecified'] as const
export type GuideBudgetScope = (typeof GUIDE_BUDGET_SCOPES)[number]

export const GUIDE_BUDGET_REVIEW_STATUSES = ['imported', 'reviewed', 'published', 'rejected'] as const
export type GuideBudgetReviewStatus = (typeof GUIDE_BUDGET_REVIEW_STATUSES)[number]

export interface MoneyBotBudgetSnapshot {
  source: 'moneybot_project'
  source_project_key: string
  source_project_name: string
  guide_slug: string
  currency: string
  scope: GuideBudgetScope
  traveller_count: number | null
  total: string
  categories: Record<string, string>
  transaction_count: number
  generated_at: string
  confirmed_at: string
  snapshot_version: number
  checksum: string
}

export interface GuideBudgetSnapshotRecord {
  id: string
  guide_slug: string
  source: 'moneybot_project'
  source_project_key: string
  source_project_name: string
  snapshot_version: number
  currency: string
  scope: GuideBudgetScope
  traveller_count: number | null
  total: string
  categories: Record<string, string>
  unclassified_amount: string
  transaction_count: number
  generated_at: string
  confirmed_at: string
  received_at: string
  review_status: GuideBudgetReviewStatus
  published_at: string | null
  checksum: string
}

/** The only actual-spend shape available to reader-facing components. */
export interface GuideBudgetDisplaySnapshot {
  source_project_name: string
  currency: string
  scope: GuideBudgetScope
  traveller_count: number | null
  total: string
  categories: Record<string, string>
  transaction_count: number
  received_at: string
}

export const PUBLIC_BUDGET_CATEGORIES = GUIDE_TRIP_COST_CATEGORIES.map((category) => category.key)
export const PUBLIC_BUDGET_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  GUIDE_TRIP_COST_CATEGORIES.map((category) => [category.key, category.nameZh])
)

export function guideBudgetScopeLabel(scope: GuideBudgetScope, travellerCount?: number | null) {
  switch (scope) {
    case 'per_person': return '每人实际花费'
    case 'per_room': return '每房实际花费'
    case 'per_group': return '每组实际花费'
    case 'total_trip': return travellerCount ? `本次旅程共 ${travellerCount} 人` : '整趟旅程总花费'
    default: return '实际总支出'
  }
}

export function formatSnapshotMoney(currency: string, value: string | number) {
  const amount = Number(value)
  const formatted = Number.isFinite(amount)
    ? new Intl.NumberFormat('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
    : String(value)
  return `${currency} ${formatted}`
}

export function guideBudgetMoneyToCents(value: unknown) {
  const text = String(value ?? '').trim()
  if (!text) return null
  const normalized = text
    .replace(/^(?:RM|MYR|CNY|JPY|THB|IDR|USD|RMB)\s*/i, '')
    .replace(/[￥¥$]/g, '')
    .replace(/,/g, '')
    .trim()
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized)) return null
  const negative = normalized.startsWith('-')
  const unsigned = negative ? normalized.slice(1) : normalized
  const [whole, fraction = ''] = unsigned.split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents)) return null
  return negative ? -cents : cents
}

export function guideBudgetCentsToMoney(cents: number) {
  const negative = cents < 0
  const absolute = Math.abs(cents)
  const whole = Math.floor(absolute / 100).toLocaleString('en-MY')
  const fraction = String(absolute % 100).padStart(2, '0')
  return `${negative ? '-' : ''}${whole}.${fraction}`
}

export function formatGuideBudgetCents(currency: string, cents: number) {
  return `${currency} ${guideBudgetCentsToMoney(cents)}`
}

export interface CanonicalGuideBudgetItem {
  key: GuideTripCostCategoryKey
  label: string
  amountCents: number
  note?: string
}

export type PublicGuideTripCostSource = 'published_actual' | 'guide_budget' | 'hidden'

export interface PublicGuideTripCost {
  source: PublicGuideTripCostSource
  categories: CanonicalGuideBudgetItem[]
  totalCents: number
}

export function canonicalGuideBudgetItems(items: Array<{ label: string; amount: string; note?: string }>) {
  const merged = new Map<GuideTripCostCategoryKey, { amountCents: number; notes: string[] }>()
  for (const item of items || []) {
    const key = canonicalTripCostCategory(item.label)
    const amountCents = guideBudgetMoneyToCents(item.amount)
    if (!key || amountCents === null || amountCents <= 0) continue
    const current = merged.get(key) || { amountCents: 0, notes: [] }
    current.amountCents += amountCents
    const note = String(item.note || '').trim()
    if (note && !current.notes.includes(note)) current.notes.push(note)
    merged.set(key, current)
  }
  const ordered = orderedTripCostCategoryEntries(
    Array.from(merged, ([key, value]) => {
      const category = getTripCostCategory(key)!
      return { key, label: `${category.nameEn} / ${category.nameZh}`, amount: value.amountCents, note: value.notes.join(' / ') || undefined }
    })
  )
  const categories: CanonicalGuideBudgetItem[] = ordered.map((item) => ({ key: item.key as GuideTripCostCategoryKey, label: item.label, amountCents: item.amount, note: item.note }))
  return { categories, totalCents: categories.reduce((total, item) => total + item.amountCents, 0) }
}

/**
 * Reader-facing Trip Cost has one precedence rule: a published actual-spend
 * snapshot always wins over the Guide's saved/static estimate.
 */
export function resolvePublicGuideTripCost(
  actualSpend: Pick<GuideBudgetDisplaySnapshot, 'categories'> | null,
  guideBudgetItems: Array<{ label: string; amount: string; note?: string }>
): PublicGuideTripCost {
  const source: Exclude<PublicGuideTripCostSource, 'hidden'> = actualSpend ? 'published_actual' : 'guide_budget'
  const sourceItems = actualSpend
    ? Object.entries(actualSpend.categories).map(([label, amount]) => ({ label, amount }))
    : guideBudgetItems
  const canonical = canonicalGuideBudgetItems(sourceItems)
  return canonical.categories.length
    ? { source, ...canonical }
    : { source: 'hidden', categories: [], totalCents: 0 }
}

export function divideSnapshotMoney(total: string | number, divisor: number) {
  if (!Number.isInteger(divisor) || divisor <= 0) return null
  const match = String(total).trim().match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/)
  if (!match) return null
  const sign = match[1] === '-' ? -1 : 1
  const cents = Number(match[2]) * 100 + Number((match[3] || '').padEnd(2, '0'))
  if (!Number.isSafeInteger(cents)) return null
  const roundedCents = Math.floor((cents * 2 + divisor) / (divisor * 2))
  const absolute = String(roundedCents).padStart(3, '0')
  const formatted = `${absolute.slice(0, -2)}.${absolute.slice(-2)}`
  return sign < 0 ? `-${formatted}` : formatted
}
