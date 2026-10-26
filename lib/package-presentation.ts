import type { TravelPackage, TravelPackageOption } from './server/travel-packages'

export const packagePriceUnits = { person: '每人', room: '每房', package: '每配套', group: '每团' } as const
export function safePackageImageUrl(value: string) {
  try { const url=new URL(value,'https://www.jnqjourney.com'); return ['http:','https:'].includes(url.protocol) && !url.username && !url.password ? value : null } catch {return null}
}
export function isHainanPackage(item: {slug: string; destination?: string | null; title_zh?: string}) { return /^(?:china-)?hainan(?:-|$)/i.test(item.slug) || /^(?:海南(?:省|岛)?|Hainan(?: Island)?)$/i.test(item.destination || '') }
export function packageUsesOptions(item: {slug: string; destination?: string | null; title_zh?: string}) { return item.slug === 'tioman-3d2n' || isHainanPackage(item) }
export function optionPrice(option: Pick<TravelPackageOption, 'price_display' | 'price_from' | 'price_currency'>) {
  if (option.price_display?.trim()) return option.price_display.trim()
  const amount = option.price_from
  const currency = String(option.price_currency || '').toUpperCase()
  if (amount == null || !Number.isFinite(amount) || amount < 0 || !/^[A-Z]{3}$/.test(currency)) return '请查询最新报价'
  return `${currency} ${amount.toLocaleString('en-MY')} 起`
}
export function packageHeadlinePrice(item: Pick<TravelPackage,'price_display'>, options: TravelPackageOption[]) {
  const people = options.filter(o => o.status === 'active' && o.price_unit === 'person' && o.price_from != null && Number.isFinite(o.price_from) && o.price_from >= 0 && o.price_currency)
  if (!people.length || new Set(people.map(o => o.price_currency?.toUpperCase())).size !== 1) return { text: item.price_display || '请查询最新报价', source: '' }
  const cheapest = [...people].sort((a,b) => a.price_from! - b.price_from!)[0]
  return { text: optionPrice(cheapest), source: cheapest.name_zh }
}
export function packageCanonicalUrl(item: Pick<TravelPackage,'slug'|'canonical_url'>, siteUrl: string) {
  const fallback = new URL(`/packages/${encodeURIComponent(item.slug)}`,siteUrl)
  try {
    const candidate = new URL(item.canonical_url || fallback.href,siteUrl)
    if (!['http:','https:'].includes(candidate.protocol) || candidate.origin !== fallback.origin || candidate.username || candidate.password || candidate.pathname.replace(/\/+$/,'') !== fallback.pathname) return fallback.href
    candidate.search = ''; candidate.hash = ''; candidate.pathname = candidate.pathname.replace(/\/+$/,'')
    return candidate.href
  } catch { return fallback.href }
}
export function packageUploadCountry(destination: string, slug: string, regionCountry?: string) {
  if (regionCountry?.trim()) return regionCountry.trim()
  if (/hainan|海南/i.test(`${slug} ${destination}`)) return 'China'
  if (/tioman|刁曼/i.test(`${slug} ${destination}`)) return 'Malaysia'
  if (/batam|巴淡/i.test(`${slug} ${destination}`)) return 'Indonesia'
  return ''
}
