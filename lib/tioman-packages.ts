import type { TravelPackage } from '@/lib/server/travel-packages'

export const TIOMAN_PACKAGE_SLUGS = [
  'tioman-aman-resort-3d2n',
  'tioman-paya-beach-resort-3d2n',
  'tioman-barat-resort-3d2n',
] as const

export type TiomanPackageSlug = typeof TIOMAN_PACKAGE_SLUGS[number]

export type TiomanComparison = {
  resortName: string
  priceFrom: string
  priceUnit: string
  ferry: string
  accommodation: string
  meals: string
  snorkeling: string
  jettyTransfer: string
  suitableFor: string
  pricePeriod: string
}

const TIOMAN_COMPARISON: Record<TiomanPackageSlug, TiomanComparison> = {
  'tioman-aman-resort-3d2n': {
    resortName: 'Aman Tioman Resort',
    priceFrom: 'RM690',
    priceUnit: '每人起',
    ferry: 'Mersing / Tanjung Gemok 来回船票包含',
    accommodation: '2 晚冷气住宿',
    meals: '2 早餐、2 晚餐、1 午餐',
    snorkeling: '第 2 天出海浮潜',
    jettyTransfer: '船票已包含',
    suitableFor: '想住得更舒适一点',
    pricePeriod: '价格有效至 15 Nov 2026',
  },
  'tioman-paya-beach-resort-3d2n': {
    resortName: 'Paya Beach Resort',
    priceFrom: 'RM509',
    priceUnit: '每人起',
    ferry: 'Mersing / Tanjung Gemok 来回船票包含',
    accommodation: '2 晚冷气住宿',
    meals: '2 早餐、2 晚餐、1 午餐',
    snorkeling: 'Renggis Island 与 Marine Park 浮潜',
    jettyTransfer: '船票已包含',
    suitableFor: '预算型海岛小旅行',
    pricePeriod: '价格有效至 14 Nov 2026',
  },
  'tioman-barat-resort-3d2n': {
    resortName: 'The Barat Tioman',
    priceFrom: 'RM1,440',
    priceUnit: '每房起（双人房）',
    ferry: '船票另计',
    accommodation: '2 晚冷气住宿',
    meals: '2 早餐券、2 晚餐券、1 午餐券',
    snorkeling: '1 次出海浮潜',
    jettyTransfer: 'Tekek Jetty 来回接送',
    suitableFor: '房型选择较多的情侣、家庭与朋友团体',
    pricePeriod: 'Peak Season 2026',
  },
}

export function isTiomanPackageSlug(value: string | null | undefined): value is TiomanPackageSlug {
  return TIOMAN_PACKAGE_SLUGS.includes(String(value || '') as TiomanPackageSlug)
}

export function getTiomanComparison(value: Pick<TravelPackage, 'slug'> | string | null | undefined) {
  const slug = typeof value === 'string' ? value : value?.slug
  return isTiomanPackageSlug(slug) ? TIOMAN_COMPARISON[slug] : null
}

export function isTiomanRegion(region?: { name?: string | null; name_cn?: string | null; country?: string | null } | null) {
  return Boolean(
    String(region?.country || '').toLowerCase() === 'malaysia'
    && (String(region?.name || '').toLowerCase() === 'pulau tioman' || String(region?.name_cn || '') === '刁曼岛')
  )
}
