import Head from 'next/head'
import type { EnglishPageData } from '@/lib/server/english-page-data'
import { PublicLocaleProvider } from './PublicLocale'
import LanguageSwitcher from './LanguageSwitcher'
import HomePageClient from './HomePageClient'
import RegionPageView from './RegionPageView'
import RegionIndexView from './RegionIndexView'
import GuidePageView from './GuidePageView'
import GuideIndexView from './GuideIndexView'
import SpotPageView from './SpotPageView'
import SearchPageView from './SearchPageView'
import AboutPageView from './AboutPageView'
import PolicyPageLayout from './PolicyPageLayout'
import { publicSpotFromLocationSummary } from '@/lib/public-spot'
import { localizedAlternates, localizedRobots } from '@/lib/localized-metadata'
import { localizedPath, ui } from '@/lib/locale'
import { absoluteUrl } from '@/lib/site'

/** Route/SEO adapter only: every public body uses the Chinese production renderer. */
export default function EnglishRouteAdapter({data}:{data:EnglishPageData}) {
  const alternates=localizedAlternates(data.path,'en',data.status),robots=localizedRobots('en',data.status)
  const image=data.guide?.coverImage || data.spot?.image_url || data.region?.thumbnail
  const description=data.description.slice(0,180)
  const fullGuides=data.fullGuides || []
  const packages=data.packages || []
  let body
  switch(data.kind) {
    case 'home': body=<HomePageClient initialLocations={data.locations} initialRegions={data.regions} initialGuides={fullGuides} initialNotes={data.notes || []} initialPackages={packages.slice(0,3)}/>;break
    case 'regions': body=<RegionIndexView regions={data.regions.filter(r=>!r.parentId).map(r=>({...r,image_url:r.thumbnail,description:r.shortSummary}))}/>;break
    case 'region': body=<RegionPageView locale="en" region={{...data.region,image_url:data.region?.thumbnail,description:data.region?.shortSummary}} locations={data.locations.map(publicSpotFromLocationSummary)} allGuides={fullGuides} relatedPackages={packages.filter(p=>p.region_id===data.region?.id)}/>;break
    case 'guides': body=<GuideIndexView guides={fullGuides}/>;break
    case 'guide': body=data.guide&&data.tripCost?<GuidePageView locale="en" guide={data.guide} publicData={{locations:data.locations}} publicTripCost={data.tripCost} approvedPriceHighlights={data.priceHighlights || []} relatedPackages={packages.filter(p=>p.related_guide_slugs?.includes(data.guide!.slug))} allGuides={fullGuides}/>:null;break
    case 'spot': body=data.spot?<SpotPageView location={data.spot} relatedLocations={data.locations.map(publicSpotFromLocationSummary)} relatedGuides={data.guides} relatedPackages={packages.filter(p=>p.region_id===data.spot!.region_id)} dataSource="public-snapshot"/>:null;break
    case 'search': body=<SearchPageView locale="en" locations={data.searchLocations || data.locations} regions={data.regions} guides={data.guides}/>;break
    case 'about': body=<AboutPageView/>;break
    default: body=<PolicyPageLayout title={data.title} eyebrow="JnQ Journey" introduction={<a href={data.path}>Read the original Chinese page →</a>} sections={[]}/>
  }
  return <PublicLocaleProvider locale="en">
    <Head><title>{`${data.title} | JnQ Journey`}</title><meta name="description" content={description}/><meta name="robots" content={`${robots.index?'index':'noindex'},follow`}/><link rel="canonical" href={absoluteUrl(alternates.canonical)}/>{Object.entries(alternates.languages||{}).map(([lang,path])=><link key={lang} rel="alternate" hrefLang={lang} href={absoluteUrl(path)}/>)}<meta property="og:title" content={data.title}/><meta property="og:description" content={description}/><meta property="og:url" content={absoluteUrl(alternates.canonical)}/><meta property="og:locale" content="en_US"/>{image?<meta property="og:image" content={image}/>:null}<link rel="icon" href="/icon.png?v=3"/></Head>
    {data.kind!=='home'?<div className="flex justify-end border-b border-white/5 bg-[#080d16] px-4 py-2 md:px-8"><LanguageSwitcher initialPath={localizedPath(data.path,'en')}/></div>:null}
    <div data-translation-status={data.status}>
      {data.status!=='complete' && !['home','regions','guides','search'].includes(data.kind)?<p className="bg-[#080d16] px-5 py-2 text-center text-xs text-white/60" role="status">{ui('en','fallback')}</p>:null}
      {body}
    </div>
  </PublicLocaleProvider>
}
