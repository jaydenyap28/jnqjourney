export const GUIDE_BUDGET_SCOPES = [
  'per_person',
  'per_room',
  'per_group',
  'total_trip',
  'unspecified',
] as const

export type GuideBudgetScope = (typeof GUIDE_BUDGET_SCOPES)[number]

export const GUIDE_BUDGET_REVIEW_STATUSES = [
  'imported',
  'reviewed',
  'published',
  'rejected',
] as const

export type GuideBudgetReviewStatus = (typeof GUIDE_BUDGET_REVIEW_STATUSES)[number]

export interface MoneyBotBudgetSnapshot {
  event_key: string
  guide_slug: string
  title: string
  currency: string
  scope: GuideBudgetScope
  traveller_count: number | null
  total: string
  categories: Record<string, string>
  transaction_count: number
  date_from: string
  date_to: string
  generated_at: string
  confirmed_at: string
  source: 'moneybot'
  snapshot_version: number
  checksum: string
}

export interface GuideBudgetSnapshotRecord {
  id: string
  guide_slug: string
  source: 'moneybot'
  source_event_key: string
  snapshot_version: number
  currency: string
  scope: GuideBudgetScope
  traveller_count: number | null
  total: string
  categories: Record<string, string>
  unclassified_amount: string
  transaction_count: number
  trip_date_from: string
  trip_date_to: string
  generated_at: string
  confirmed_at: string
  received_at: string
  review_status: GuideBudgetReviewStatus
  published_at: string | null
  checksum: string
}

export const PUBLIC_BUDGET_CATEGORIES = [
  'Flights',
  'Transportation',
  'Accommodation',
  'Food & Dining',
  'Tickets & Entrance Fees',
  'Activities',
  'Shopping',
  'Internet & Communication',
  'Insurance',
  'Other',
] as const

export const PUBLIC_BUDGET_CATEGORY_LABELS: Record<string, string> = {
  Flights: '机票',
  Transportation: '交通',
  Accommodation: '住宿',
  'Food & Dining': '饮食',
  'Tickets & Entrance Fees': '门票',
  Activities: '活动',
  Shopping: '购物',
  'Internet & Communication': '通讯',
  Insurance: '保险',
  Other: '其他',
}

export function guideBudgetScopeLabel(scope: GuideBudgetScope, travellerCount?: number | null) {
  switch (scope) {
    case 'per_person':
      return '每人实际花费'
    case 'per_room':
      return '每房实际花费'
    case 'per_group':
      return '每组实际花费'
    case 'total_trip':
      return travellerCount ? `本次旅程共 ${travellerCount} 人` : '整趟旅程总花费'
    default:
      return '本次旅程实际总花费'
  }
}

export function formatSnapshotMoney(currency: string, value: string | number) {
  const amount = Number(value)
  const formatted = Number.isFinite(amount)
    ? new Intl.NumberFormat('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
    : String(value)
  return `${currency} ${formatted}`
}
