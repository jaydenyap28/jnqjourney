import { GUIDE_TRIP_COST_CATEGORIES } from './guide-trip-cost-categories.ts'

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
