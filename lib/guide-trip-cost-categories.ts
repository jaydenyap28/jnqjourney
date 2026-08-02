/** Shared public taxonomy for all Guide budgets and actual-spend snapshots. */
export const GUIDE_TRIP_COST_CATEGORIES = [
  { key: 'Flights', nameEn: 'Flights', nameZh: '机票', icon: 'Plane', displayOrder: 1, description: 'Airfare and flight-related fees', aliases: ['flight', 'airfare', 'air ticket', 'flights & airfare', '机票', '航空', '机票 international flight', '机票 / jr / 国内交通', '机票 / 高铁'] },
  { key: 'Transportation', nameEn: 'Transportation', nameZh: '交通', icon: 'TrainFront', displayOrder: 2, description: 'Ground, rail, ferry and airport transport', aliases: ['transport', 'local transport', 'intercity transport', 'ground transportation', '交通', '当地交通', '城际交通', '交通 transportation'] },
  { key: 'Accommodation', nameEn: 'Accommodation', nameZh: '住宿', icon: 'BedDouble', displayOrder: 3, description: 'Stays and directly related charges', aliases: ['accommodation', 'hotel', 'stay', '住宿', '酒店', '住宿 accommodation'] },
  { key: 'Food & Dining', nameEn: 'Food & Dining', nameZh: '餐饮', icon: 'Utensils', displayOrder: 4, description: 'Meals, drinks and ready-to-eat food', aliases: ['food', 'dining', 'meals', '餐饮', '饮食', '吃喝', '饮食 food & dining', '吃喝 food & dining'] },
  { key: 'Tickets & Entrance Fees', nameEn: 'Tickets & Entrance Fees', nameZh: '门票', icon: 'Ticket', displayOrder: 5, description: 'Admission and entrance tickets', aliases: ['ticket', 'tickets', 'entrance fee', 'entrance fees', 'admission', 'attractions', '门票', '入场票', '门票 tickets / entrance fees', '门票 / 体验', '门票 / 体验 tickets / entrance fees', '门票 & 套票'] },
  { key: 'Activities', nameEn: 'Activities', nameZh: '活动', icon: 'Sparkles', displayOrder: 6, description: 'Experiences, tours and activities', aliases: ['activities', 'activity', 'experience', 'experiences', 'tour', 'tours', '活动', '体验', '活动 activities'] },
  { key: 'Internet & Communication', nameEn: 'Internet & Communication', nameZh: '通讯', icon: 'Wifi', displayOrder: 7, description: 'SIM, data and roaming', aliases: ['internet', 'sim', 'sim card', 'esim', 'e-sim', 'mobile data', 'communication', '通讯', '通信', '网络', '通讯 internet & communication'] },
  { key: 'Shopping', nameEn: 'Shopping', nameZh: '购物', icon: 'ShoppingBag', displayOrder: 8, description: 'Personal shopping and souvenirs', aliases: ['shopping', 'shop', '购物', '纪念品', '购物 shopping'] },
  { key: 'Other', nameEn: 'Other', nameZh: '其他', icon: 'CircleEllipsis', displayOrder: 9, description: 'Confirmed travel spend not otherwise classifiable', aliases: ['other', 'others', 'miscellaneous', 'misc', '保险', '其他', '其他 others', '其他花费 others'] },
] as const

export type GuideTripCostCategoryKey = (typeof GUIDE_TRIP_COST_CATEGORIES)[number]['key']
export type GuideTripCostCategory = (typeof GUIDE_TRIP_COST_CATEGORIES)[number]

function normalizeCategoryText(value: unknown) {
  return String(value ?? '').trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}

const categoryByKey = new Map<string, GuideTripCostCategory>(GUIDE_TRIP_COST_CATEGORIES.map((category) => [category.key, category]))
const categoryByAlias = new Map<string, GuideTripCostCategory>(
  GUIDE_TRIP_COST_CATEGORIES.flatMap((category) => [category.key, category.nameEn, category.nameZh, ...category.aliases]
    .map((alias) => [normalizeCategoryText(alias), category] as const))
)

export function canonicalTripCostCategory(value: unknown): GuideTripCostCategoryKey | null {
  return categoryByAlias.get(normalizeCategoryText(value))?.key ?? null
}

export function getTripCostCategory(value: unknown): GuideTripCostCategory | null {
  const key = canonicalTripCostCategory(value)
  return key ? categoryByKey.get(key) ?? null : null
}

export function orderedTripCostCategoryEntries<T extends { key: string; amount: number }>(entries: T[]) {
  return [...entries].sort((left, right) => {
    const leftOrder = getTripCostCategory(left.key)?.displayOrder ?? Number.MAX_SAFE_INTEGER
    const rightOrder = getTripCostCategory(right.key)?.displayOrder ?? Number.MAX_SAFE_INTEGER
    return leftOrder - rightOrder || left.key.localeCompare(right.key)
  })
}
