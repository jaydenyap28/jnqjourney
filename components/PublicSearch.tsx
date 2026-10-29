'use client'
import { useEffect, useMemo, useState } from 'react'
import EntityName from './EntityName'
import FallbackImage from './FallbackImage'
import SpotSearchControls from './SpotSearchControls'
import { localizedPath, ui, type Locale } from '@/lib/locale'
import type { PublicRegion } from '@/lib/public-data'
import { createSpotSearch, EMPTY_SPOT_FILTERS, normalizeSearch, readSpotFilters, writeSpotFilters, type SearchableSpot, type SpotFilters } from '@/lib/spot-search'

export type SearchLocation = SearchableSpot & { thumbnail?: string | null }

export default function PublicSearch({locations,regions,guides,locale='en',browse=false}:{locations:SearchLocation[];regions:PublicRegion[];guides:Array<{slug:string;title:string}>;locale?:Locale;browse?:boolean}) {
  const [filters, setFilters] = useState<SpotFilters>(EMPTY_SPOT_FILTERS)
  const [limit, setLimit] = useState(24)
  const limitKey = () => `jnq-search-limit:${window.location.pathname}${window.location.search}`
  useEffect(() => {
    const restore = () => {
      setFilters(readSpotFilters(window.location.search))
      let saved = 24
      try { saved = Number(sessionStorage.getItem(limitKey())) || 24 } catch {}
      setLimit(Math.min(5000, Math.max(24, saved)))
    }
    restore()
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [])
  const changeFilters = (next: SpotFilters) => {
    setFilters(next); setLimit(24); writeSpotFilters(next)
    try { sessionStorage.setItem(limitKey(), '24') } catch {}
  }
  const search = useMemo(() => createSpotSearch(locations), [locations])
  const otherIndex = useMemo(() => [
    ...regions.map(item => ({ key: 'region:'+item.id, entity: item, text: normalizeSearch(item.name+' '+(item.shortSummary || '')+' '+(item.country || '')), href: '/region/'+item.slug, thumbnail: null as string | null })),
    ...guides.map(item => ({ key: 'guide:'+item.slug, entity: { name: item.title }, text: normalizeSearch(item.title), href: '/guide/'+item.slug, thumbnail: null as string | null })),
  ], [regions, guides])
  const active = browse || Object.values(filters).some(Boolean)
  const results = useMemo(() => {
    if (!active) return []
    const spots = search(filters).map(item => ({ key: 'spot:'+item.id, entity: item, href: '/spot/'+item.slug, thumbnail: item.thumbnail }))
    const query = normalizeSearch(filters.q)
    return [...spots, ...(!filters.country && !filters.region && !filters.category && query ? otherIndex.filter(item => item.text.includes(query)) : [])]
  }, [active, filters, search, otherIndex])
  const en = locale === 'en'
  return <section className="min-w-0 space-y-4" aria-label={ui(locale,'search')}>
    <form onSubmit={event=>event.preventDefault()} className="flex flex-col gap-3 sm:flex-row">
      <label className="sr-only" htmlFor="public-search">{ui(locale,'searchPlaceholder')}</label>
      <input id="public-search" type="search" value={filters.q} onChange={event=>changeFilters({...filters,q:event.target.value})} placeholder={ui(locale,'searchPlaceholder')} className="min-h-12 min-w-0 flex-1 rounded-full border border-white/20 bg-white/5 px-5 text-base text-white focus:outline-amber-200"/>
      <button className="min-h-12 rounded-full border border-amber-200/30 px-6 text-sm text-amber-200" type="submit">{ui(locale,'search')}</button>
    </form>
    <SpotSearchControls spots={locations} value={filters} onChange={changeFilters} locale={locale} />
    <p role="status" aria-live="polite" className="text-sm text-white/80">{active ? results.length ? results.length+' '+(en ? 'results' : '个结果') : ui(locale,'noResults') : en ? 'Search by place name, region or country.' : '输入景点名称，或按地区、国家与分类探索。'}</p>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {results.slice(0,limit).map(item=><a key={item.key} href={localizedPath(item.href,locale)} className="min-w-0 overflow-hidden rounded-xl border border-white/10 text-white hover:border-amber-200/40 focus-visible:outline-amber-200">
        {browse && item.thumbnail ? <div className="relative aspect-[4/3]"><FallbackImage src={item.thumbnail} alt={item.entity.name || ''} fill sizes="(max-width: 639px) 92vw, (max-width: 1023px) 45vw, 320px" className="object-cover" /></div> : null}
        <div className="p-4"><EntityName entity={item.entity} locale={locale}/>{browse && 'shortSummary' in item.entity && item.entity.shortSummary ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/70">{String(item.entity.shortSummary)}</p> : null}</div>
      </a>)}
    </div>
    {limit < results.length ? <button type="button" onClick={()=>{
      const next = limit + 24; setLimit(next)
      try { sessionStorage.setItem(limitKey(), String(next)) } catch {}
    }} className="min-h-11 rounded-full border border-white/30 px-5 text-sm text-white">{en ? 'Show more' : '显示更多'} ({Math.min(limit,results.length)} / {results.length})</button> : null}
  </section>
}
