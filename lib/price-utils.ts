export interface StructuredPriceCustomItem {
  label: string
  labelEn: string
  value: string
  note: string
}

export interface StructuredPriceInfo {
  currency: string
  isFree: boolean
  admissionLocalAdult: string
  admissionLocalChild: string
  admissionForeignAdult: string
  admissionForeignChild: string
  admissionAdult: string
  admissionChild: string
  mealBudget: string
  mealPartySize: number
  parkingBudget: string
  transportBudget: string
  customItems: StructuredPriceCustomItem[]
  infoImages: string[]
  priceSource: string
  lastCheckedAt: string
  notes: string
}

export function createDefaultPriceInfo(): StructuredPriceInfo {
  return {
    currency: '',
    isFree: false,
    admissionLocalAdult: '',
    admissionLocalChild: '',
    admissionForeignAdult: '',
    admissionForeignChild: '',
    admissionAdult: '',
    admissionChild: '',
    mealBudget: '',
    mealPartySize: 2,
    parkingBudget: '',
    transportBudget: '',
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
    isFree: Boolean(source.isFree),
    admissionLocalAdult: String((source as any).admissionLocalAdult || '').trim(),
    admissionLocalChild: String((source as any).admissionLocalChild || '').trim(),
    admissionForeignAdult: String((source as any).admissionForeignAdult || '').trim(),
    admissionForeignChild: String((source as any).admissionForeignChild || '').trim(),
    admissionAdult: String(source.admissionAdult || '').trim(),
    admissionChild: String(source.admissionChild || '').trim(),
    mealBudget: String(source.mealBudget || '').trim(),
    mealPartySize: Number(source.mealPartySize) > 0 ? Number(source.mealPartySize) : 2,
    parkingBudget: String((source as any).parkingBudget || '').trim(),
    transportBudget: String(source.transportBudget || '').trim(),
    customItems: Array.isArray((source as any).customItems)
      ? (source as any).customItems.map((item: any) => ({
          label: String(item?.label || '').trim(),
          labelEn: String(item?.labelEn || '').trim(),
          value: String(item?.value || '').trim(),
          note: String(item?.note || '').trim(),
        })).filter((item: StructuredPriceCustomItem) => item.label || item.labelEn || item.value || item.note)
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
      value.admissionLocalChild ||
      value.admissionForeignAdult ||
      value.admissionForeignChild ||
      value.currency ||
      value.admissionAdult ||
      value.admissionChild ||
      value.mealBudget ||
      value.parkingBudget ||
      value.transportBudget ||
      value.customItems.length ||
      value.infoImages.length ||
      value.priceSource ||
      value.lastCheckedAt ||
      value.notes
  )
}
