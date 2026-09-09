'use client'
import { useEffect, useMemo, useState } from 'react'
import EntityName from './EntityName'
import { localizedPath, ui, type Locale } from '@/lib/locale'
import type { PublicLocation, PublicRegion } from '@/lib/public-data'
export type SearchLocation=Pick<PublicLocation,'id'|'name'|'slug'> & {shortSummary?:string|null;region?:{name:string}|null}

export default function PublicSearch({locations,regions,guides,locale='en'}:{locations:SearchLocation[];regions:PublicRegion[];guides:Array<{slug:string;title:string}>;locale?:Locale}) {
  const [query,setQuery]=useState('')
  function changeQuery(value:string) {
    setQuery(value)
    const url=new URL(window.location.href)
    if(value) url.searchParams.set('q',value)
    else url.searchParams.delete('q')
    window.history.replaceState(null,'',`${url.pathname}${url.search}${url.hash}`)
  }
  useEffect(()=>setQuery(new URLSearchParams(window.location.search).get('q') || ''),[])
  const results=useMemo(()=>{
    const term=query.trim().toLocaleLowerCase()
    if(!term) return []
    return [
      ...locations.map(item=>({key:`spot:${item.id}`,entity:item,text:`${item.name} ${item.shortSummary} ${item.region?.name}`,href:`/spot/${item.slug}`})),
      ...regions.map(item=>({key:`region:${item.id}`,entity:item,text:`${item.name} ${item.shortSummary}`,href:`/region/${item.slug}`})),
      ...guides.map(item=>({key:`guide:${item.slug}`,entity:{name:item.title},text:item.title,href:`/guide/${item.slug}`})),
    ].filter(item=>item.text.toLocaleLowerCase().includes(term)).slice(0,60)
  },[locations,regions,guides,query])
  return <section className="min-w-0" aria-label={ui(locale,'search')}>
    <form onSubmit={event=>{event.preventDefault();window.history.replaceState(null,'',`${window.location.pathname}?q=${encodeURIComponent(query)}${window.location.hash}`)}} className="flex flex-col gap-3 sm:flex-row">
      <label className="sr-only" htmlFor="public-search">{ui(locale,'searchPlaceholder')}</label>
      <input id="public-search" type="search" value={query} onChange={event=>changeQuery(event.target.value)} placeholder={ui(locale,'searchPlaceholder')} className="min-h-12 min-w-0 flex-1 rounded-full border border-white/20 bg-white/5 px-5 text-sm text-white focus:outline-amber-200"/>
      <button className="min-h-12 rounded-full border border-amber-200/30 px-6 text-sm text-amber-200" type="submit">{ui(locale,'search')}</button>
    </form>
    <div aria-live="polite" className="mt-6 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {query.trim() && !results.length ? <p>{ui(locale,'noResults')}</p> : null}
      {results.map(item=><a key={item.key} href={localizedPath(item.href,locale)} className="min-w-0 rounded-xl border border-white/10 p-4 text-white hover:border-amber-200/40"><EntityName entity={item.entity} locale={locale}/></a>)}
    </div>
  </section>
}
