import Fuse from 'fuse.js'

export interface SearchableSpot {
  id: number
  name: string
  slug: string
  name_cn?: string | null
  category?: string | null
  shortSummary?: string | null
  region?: { id?: number; name: string; country?: string | null } | null
}
export interface SpotFilters { q: string; country: string; region: string; category: string }
export const EMPTY_SPOT_FILTERS: SpotFilters = { q: '', country: '', region: '', category: '' }
export const normalizeSearch = (value: unknown) => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, ' ').trim()

export function readSpotFilters(search: string): SpotFilters {
  const params = new URLSearchParams(search)
  return Object.fromEntries(Object.keys(EMPTY_SPOT_FILTERS).map(key => [key, params.get(key) || ''])) as unknown as SpotFilters
}

export function writeSpotFilters(filters: SpotFilters) {
  const url = new URL(window.location.href)
  for (const key of Object.keys(EMPTY_SPOT_FILTERS) as Array<keyof SpotFilters>) {
    if (filters[key]) url.searchParams.set(key, filters[key]); else url.searchParams.delete(key)
  }
  // Next 14 copies its internals for native URL changes. Passing __NA/_N back
  // bypasses that synchronization and makes the next navigation lose the query.
  const { __NA, _N, ...state } = window.history.state || {}
  window.history.replaceState({ ...state, jnqSpotDock: null }, '', `${url.pathname}${url.search}${url.hash}`)
}

// Reuse the existing Fuse index, normalized once per collection. Exact name
// matches rank first; fuzzy matches remain available for existing searches.
export function createSpotSearch<T extends SearchableSpot>(spots: T[]) {
  const records = spots.map(item => ({ item, name: normalizeSearch(`${item.name} ${item.name_cn || ''}`),
    region: normalizeSearch(item.region?.name), country: normalizeSearch(item.region?.country),
    category: normalizeSearch(`${item.category || ''} ${item.category === 'food' ? '餐厅 美食 restaurant food' : item.category === 'accommodation' ? '住宿 酒店 stay hotel accommodation' : '景点 attraction spot'}`),
    summary: normalizeSearch(item.shortSummary) }))
  const fuse = new Fuse(records, { threshold: 0.3, keys: [
    { name: 'name', weight: 1 }, { name: 'region', weight: .8 }, { name: 'country', weight: .7 },
    { name: 'category', weight: .6 }, { name: 'summary', weight: .5 },
  ] })
  return (filters: SpotFilters): T[] => {
    const query = normalizeSearch(filters.q)
    const exact = query ? records.filter(record => [record.name, record.region, record.country, record.category, record.summary].some(text => text.includes(query))) : records
    const matches = exact.length || !query ? exact : fuse.search(query).map(result => result.item)
    const filtered = matches.filter(({ item }) => (!filters.country || item.region?.country === filters.country)
      && (!filters.region || String(item.region?.id) === filters.region)
      && (!filters.category || item.category === filters.category))
    return (query ? filtered.sort((a, b) => Number(b.name.includes(query)) - Number(a.name.includes(query))) : filtered).map(record => record.item)
  }
}
