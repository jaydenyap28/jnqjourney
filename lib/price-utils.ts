export interface StructuredPriceCustomItem {
  label: string
  labelEn: string
  value: string
  valueSecondary: string
  note: string
}

export interface StructuredPriceInfo {
  currency: string
  secondaryCurrency: string
  isFree: boolean
  admissionLocalAdult: string
  admissionLocalAdultSecondary: string
  admissionLocalChild: string
  admissionLocalChildSecondary: string
  admissionForeignAdult: string
  admissionForeignAdultSecondary: string
  admissionForeignChild: string
  admissionForeignChildSecondary: string
  admissionAdult: string
  admissionAdultSecondary: string
  admissionChild: string
  admissionChildSecondary: string
  mealBudget: string
  mealBudgetSecondary: string
  mealPartySize: number
  parkingBudget: string
  parkingBudgetSecondary: string
  transportBudget: string
  transportBudgetSecondary: string
  customItems: StructuredPriceCustomItem[]
  infoImages: string[]
  priceSource: string
  lastCheckedAt: string
  notes: string
}

export function createDefaultPriceInfo(): StructuredPriceInfo {
  return {
    currency: '',
    secondaryCurrency: '',
    isFree: false,
    admissionLocalAdult: '',
    admissionLocalAdultSecondary: '',
    admissionLocalChild: '',
    admissionLocalChildSecondary: '',
    admissionForeignAdult: '',
    admissionForeignAdultSecondary: '',
    admissionForeignChild: '',
    admissionForeignChildSecondary: '',
    admissionAdult: '',
    admissionAdultSecondary: '',
    admissionChild: '',
    admissionChildSecondary: '',
    mealBudget: '',
    mealBudgetSecondary: '',
    mealPartySize: 2,
    parkingBudget: '',
    parkingBudgetSecondary: '',
    transportBudget: '',
    transportBudgetSecondary: '',
    customItems: [],
    infoImages: [],
    priceSource: '',
    lastCheckedAt: '',
    notes: '',
  }
}

export function parsePriceInfo(value: unknown): StructuredPriceInfo {
  const fallback = createDefaultPriceInfo()

  if (!value) return fallback

  let parsed = value

  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      return {
        ...fallback,
        notes: value.trim(),
      }
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return fallback
  }

  const source = parsed as Partial<StructuredPriceInfo>

  return {
    currency: String(source.currency || '').trim(),
    secondaryCurrency: String((source as any).secondaryCurrency || '').trim(),
    isFree: Boolean(source.isFree),
    admissionLocalAdult: String((source as any).admissionLocalAdult || '').trim(),
    admissionLocalAdultSecondary: String((source as any).admissionLocalAdultSecondary || '').trim(),
    admissionLocalChild: String((source as any).admissionLocalChild || '').trim(),
    admissionLocalChildSecondary: String((source as any).admissionLocalChildSecondary || '').trim(),
    admissionForeignAdult: String((source as any).admissionForeignAdult || '').trim(),
    admissionForeignAdultSecondary: String((source as any).admissionForeignAdultSecondary || '').trim(),
    admissionForeignChild: String((source as any).admissionForeignChild || '').trim(),
    admissionForeignChildSecondary: String((source as any).admissionForeignChildSecondary || '').trim(),
    admissionAdult: String(source.admissionAdult || '').trim(),
    admissionAdultSecondary: String((source as any).admissionAdultSecondary || '').trim(),
    admissionChild: String(source.admissionChild || '').trim(),
    admissionChildSecondary: String((source as any).admissionChildSecondary || '').trim(),
    mealBudget: String(source.mealBudget || '').trim(),
    mealBudgetSecondary: String((source as any).mealBudgetSecondary || '').trim(),
    mealPartySize: Number(source.mealPartySize) > 0 ? Number(source.mealPartySize) : 2,
    parkingBudget: String((source as any).parkingBudget || '').trim(),
    parkingBudgetSecondary: String((source as any).parkingBudgetSecondary || '').trim(),
    transportBudget: String(source.transportBudget || '').trim(),
    transportBudgetSecondary: String((source as any).transportBudgetSecondary || '').trim(),
    customItems: Array.isArray((source as any).customItems)
      ? (source as any).customItems.map((item: any) => ({
          label: String(item?.label || '').trim(),
          labelEn: String(item?.labelEn || '').trim(),
          value: String(item?.value || '').trim(),
          valueSecondary: String(item?.valueSecondary || '').trim(),
          note: String(item?.note || '').trim(),
        })).filter((item: StructuredPriceCustomItem) => item.label || item.labelEn || item.value || item.valueSecondary || item.note)
      : [],
    infoImages: Array.isArray((source as any).infoImages)
      ? (source as any).infoImages.map((item: any) => String(item || '').trim()).filter(Boolean)
      : [],
    priceSource: String(source.priceSource || '').trim(),
    lastCheckedAt: String(source.lastCheckedAt || '').trim(),
    notes: String(source.notes || '').trim(),
  }
}

export function serializePriceInfo(value: StructuredPriceInfo) {
  return JSON.stringify(value)
}

export function hasPriceInfo(value: StructuredPriceInfo) {
  return Boolean(
      value.isFree ||
      value.admissionLocalAdult ||
      value.admissionLocalAdultSecondary ||
      value.admissionLocalChild ||
      value.admissionLocalChildSecondary ||
      value.admissionForeignAdult ||
      value.admissionForeignAdultSecondary ||
      value.admissionForeignChild ||
      value.admissionForeignChildSecondary ||
      value.currency ||
      value.secondaryCurrency ||
      value.admissionAdult ||
      value.admissionAdultSecondary ||
      value.admissionChild ||
      value.admissionChildSecondary ||
      value.mealBudget ||
      value.mealBudgetSecondary ||
      value.parkingBudget ||
      value.parkingBudgetSecondary ||
      value.transportBudget ||
      value.transportBudgetSecondary ||
      value.customItems.length ||
      value.infoImages.length ||
      value.priceSource ||
      value.lastCheckedAt ||
      value.notes
  )
}
