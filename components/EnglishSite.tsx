/* eslint-disable @next/next/no-html-link-for-pages -- Language boundaries use full document navigation so the server-rendered html language remains correct across App and Pages Router. */
import Head from 'next/head'
import dynamic from 'next/dynamic'
import GuideVideoCard from './GuideVideoCard'
import EntityName from './EntityName'
import LanguageSwitcher from './LanguageSwitcher'
import PublicSearch from './PublicSearch'
import FallbackImage from './FallbackImage'
import type { EnglishPageData } from '@/lib/server/english-page-data'
import type { GuideAttractionRef, GuideDayPlan, GuideItineraryRoute, GuideItinerarySegment } from '@/lib/guides'
import type { PublicLocation } from '@/lib/public-data'
import { ui, localizedPath } from '@/lib/locale'
import { localizedAlternates, localizedRobots } from '@/lib/localized-metadata'
import { absoluteUrl } from '@/lib/site'
import { formatGuideBudgetCents } from '@/lib/guide-budget'
import { orderedGuideAttractions } from '@/lib/guide-attractions'
import { resolveEntityDisplayName } from '@/lib/entity-display-name'
import { parsePriceInfo } from '@/lib/price-utils'

const t=(key:Parameters<typeof ui>[1])=>ui('en',key)
const panel='min-w-0 rounded-2xl border border-white/10 bg-white/[0.025] p-5 md:p-7'
const EnglishRouteMap = dynamic(() => import('./GuideRouteMapCanvas'), { ssr: false, loading: () => <div className="h-[330px] rounded-2xl bg-white/5 p-5 text-sm text-white/50 md:h-[450px]">Loading map…</div> })
function Text({children}:{children?:string|null}) { return children ? <p className="mt-3 whitespace-pre-line text-sm leading-7 text-white/65 [overflow-wrap:anywhere]">{children}</p>:null }
function Heading({id,children}:{id?:string;children:React.ReactNode}) { return <h2 id={id} className="mb-6 scroll-mt-24 font-display text-4xl text-white md:text-5xl">{children}</h2> }
function Picture({src,alt,hero=false}:{src?:string|null;alt:string;hero?:boolean}) {
  return src ? <div className={`relative overflow-hidden rounded-2xl bg-white/5 ${hero?'aspect-[16/10] md:aspect-[21/9]':'aspect-[4/3]'}`}><FallbackImage src={src} alt={alt} fill priority={hero} sizes={hero?'(max-width: 1280px) 100vw, 1200px':'(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw'} className="object-cover"/></div> : null
}
function PlaceCard({spot,description}:{spot:PublicLocation;description?:string}) {
  return <a data-spot-id={spot.id} href={`/en/spot/${spot.slug}`} className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.025] p-3 transition hover:border-amber-200/40">
    <Picture src={spot.thumbnail} alt={resolveEntityDisplayName(spot,'en').primary}/><h3 className="px-2 pt-4 text-lg"><EntityName entity={spot} locale="en"/></h3>{description?<div className="px-2 pb-3"><Text>{description}</Text></div>:null}
  </a>
}
function Places({locations}:{locations:PublicLocation[]}) { return <div className="grid min-w-0 gap-5 sm:grid-cols-2 lg:grid-cols-3">{locations.map(s=><PlaceCard key={s.id} spot={s}/>)}</div> }
function Bullets({items}:{items?:string[]}) { return items?.length ? <ul className="mt-4 space-y-3 pl-5 text-sm leading-7 text-white/65 list-disc">{items.map((s,i)=><li key={i}>{s}</li>)}</ul>:null }
function Video({url,title}:{url?:string;title:string}) {
  if(!url) return null
  let videoId=''
  try {
    const parsed=new URL(url)
    if(parsed.hostname==='youtu.be') videoId=parsed.pathname.slice(1)
    if(['www.youtube.com','youtube.com','m.youtube.com'].includes(parsed.hostname)) videoId=parsed.searchParams.get('v') || parsed.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1] || ''
  } catch { /* Keep existing non-YouTube video links. */ }
  if(/^[\w-]{11}$/.test(videoId)) return <GuideVideoCard locale="en" videoId={videoId} title={title} guideSlug={title}/>
  return <a href={url} target="_blank" rel="noreferrer" className="mt-5 inline-flex min-h-11 items-center rounded-full border border-amber-200/30 px-5 text-sm text-amber-200" aria-label={`${t('playVideo')}: ${title}`}>▶ {t('playVideo')} — {title}</a>
}
function AttractionList({source,locations}:{source:{attractions?:GuideAttractionRef[];linkedSpots?:string[]};locations:PublicLocation[]}) {
  const references=orderedGuideAttractions(source)
  return <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2">
    {references.map((ref,index)=>{
      const spot=locations.find(s=>s.id===ref.spotId || s.slug===ref.spotSlug || (!ref.spotId && !ref.spotSlug && [resolveEntityDisplayName(s,'en').primary,resolveEntityDisplayName(s,'zh').primary].includes(ref.displayName || '')))
      return <article key={`${ref.spotId || ref.spotSlug || 'legacy'}:${index}`} className={panel} data-spot-id={ref.spotId} data-display-order={ref.displayOrder}>
        {spot ? <a href={`/en/spot/${spot.slug}`}><Picture src={spot.thumbnail} alt={ref.displayName || resolveEntityDisplayName(spot,'en').primary}/><h4 className="mt-4 text-lg"><EntityName entity={/\p{Script=Han}/u.test(resolveEntityDisplayName(spot,'en').primary) && ref.displayName ? {name:ref.displayName,name_cn:spot.name} : spot} locale="en"/></h4></a>:<h4 className="text-lg">{ref.displayName}</h4>}
        <Text>{ref.guideSummary}</Text><Text>{ref.routeNote}</Text><Text>{ref.tips}</Text>
      </article>
    })}
  </div>
}
function Gallery({images,title}:{images:Array<{url:string;alt?:string;caption?:string}>;title:string}) {
  if(!images.length) return null
  return <section className="mt-8"><h3 className="mb-4 text-xl">{t('gallery')}</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{images.map((image,i)=><a key={`${image.url}:${i}`} href={image.url} target="_blank" rel="noreferrer" aria-label={`${t('gallery')}: ${title} ${i+1}`}><Picture src={image.url} alt={image.alt || `${title} ${i+1}`}/>{image.caption?<Text>{image.caption}</Text>:null}</a>)}</div></section>
}
function Day({day,locations}:{day:GuideDayPlan;locations:PublicLocation[]}) {
  const stay=locations.find(s=>[resolveEntityDisplayName(s,'en').primary,resolveEntityDisplayName(s,'zh').primary].includes(day.stay || ''))
  return <article className="min-w-0 border-t border-white/10 py-8"><p className="text-xs uppercase tracking-widest text-amber-200">{day.dayLabel}{day.date?` · ${day.date}`:''}</p><h3 className="mt-3 font-display text-3xl">{day.title}</h3><Text>{day.summary}</Text><Bullets items={day.highlights}/><AttractionList source={day} locations={locations}/>
    {day.transport?<><h4 className="mt-5 text-lg">{t('transport')}</h4><Text>{day.transport}</Text><Text>{day.transportPrice}</Text></>:null}
    {day.stay?<div className="mt-5"><h4 className="text-lg">{t('stay')}</h4>{stay?<a href={`/en/spot/${stay.slug}`} className="mt-3 block text-amber-200"><EntityName entity={stay} locale="en"/></a>:<Text>{day.stay}</Text>}<Text>{day.stayNote}</Text></div>:null}
    <Text>{day.reminder}</Text><Video url={day.videoUrl} title={day.title}/><Gallery images={day.gallery || []} title={day.title}/>
  </article>
}
function SegmentRoute({route,locations}:{route:GuideItineraryRoute;locations:PublicLocation[]}) { return <div className="mt-6 border-t border-white/10 pt-5"><h4 className="text-xl">{route.title}</h4><Text>{route.summary}</Text><AttractionList source={route} locations={locations}/></div> }
function Segment({segment,locations}:{segment:GuideItinerarySegment;locations:PublicLocation[]}) {
  return <article className="min-w-0 border-t border-white/10 py-8"><p className="text-xs tracking-widest text-amber-200">{segment.dateStart} – {segment.dateEnd}</p><h3 className="mt-3 font-display text-3xl">{segment.title}</h3><Text>{segment.summary}</Text>
    {segment.verifiedRoutes.map((r,i)=><SegmentRoute key={i} route={r} locations={locations}/>)}
    {segment.referenceRoutes?.length?<section className="mt-6 rounded-xl border border-dashed border-white/20 p-4"><h4 className="text-lg">{t('reference')}</h4>{segment.referenceRoutes.map((r,i)=><div key={i}><h5 className="mt-3">{r.title}</h5><Text>{r.summary}</Text></div>)}</section>:null}
    {(segment.accommodationStays||[]).map((stay,i)=>{const spot=locations.find(s=>s.id===stay.accommodationId);return <div key={i} className="mt-5"><h4>{t('stay')} · Day {stay.dayStart}–{stay.dayEnd}</h4>{spot?<a href={`/en/spot/${spot.slug}`}><EntityName entity={spot} locale="en"/></a>:null}<Text>{stay.note}</Text></div>})}
    <Text>{segment.accommodation}</Text><Text>{segment.accommodationNote}</Text><Text>{segment.transport}</Text>
    <Bullets items={segment.practicalTips}/><Bullets items={segment.actualExperiences}/>
    {segment.pendingItems?.length?<div className="mt-5"><h4 className="text-amber-200">{t('pending')}</h4><Bullets items={segment.pendingItems}/></div>:null}
    {segment.media?.map((m,i)=><Video key={i} url={m.url} title={m.label}/>)}
  </article>
}
function GuideBody({data}:{data:EnglishPageData}) {
  const guide=data.guide!,cost=data.tripCost
  return <>
    <nav aria-label="Guide sections" className="my-8 flex flex-wrap gap-2">{[['route',t('route')],['budget',t('cost')],['itinerary',guide.itineraryMode==='unassigned'?t('visited'):t('itinerary')],['stays',t('stay')],['notes',t('notes')]].map(([id,label])=><a key={id} href={`#${id}`} className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-4 text-sm text-white/70">{label}</a>)}</nav>
    <section className="py-8"><Heading id="route">{t('route')}</Heading><EnglishRouteMap locale="en" guideSlug={guide.slug} showCards={false} connectPoints={guide.itineraryMode !== 'unassigned'} emptyMessage="Map coordinates have not been recorded for this route." points={guide.route.filter(r=>Number.isFinite(r.latitude)&&Number.isFinite(r.longitude)).map((r,i)=>({id:i,label:r.name,stopLabel:r.stopLabel,latitude:r.latitude!,longitude:r.longitude!}))}/><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{guide.route.map((r,i)=><article key={i} className={panel}><p className="text-xs text-amber-200">{r.stopLabel}</p><h3 className="mt-2 text-xl">{r.name}</h3><Text>{r.summary}</Text>{Number.isFinite(r.latitude)&&Number.isFinite(r.longitude)?<a href={`https://www.google.com/maps/search/?api=1&query=${r.latitude},${r.longitude}`} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center text-sm text-amber-200">{t('map')}</a>:null}</article>)}</div></section>
    {cost && cost.source!=='hidden'?<section className="py-8"><Heading id="budget">{t('cost')}</Heading><div className={panel}><p className="text-sm text-white/55">{cost.source==='published_actual'?'Actual Spending':'Budget'} · {t('totalCost')}</p><p className="mt-3 text-4xl tabular-nums">{formatGuideBudgetCents(cost.currency,cost.totalCents)}</p>{cost.perPersonCents!==null?<Text>{`${t('perPerson')}: ${formatGuideBudgetCents(cost.currency,cost.perPersonCents)}`}</Text>:null}<Text>{t('historicalCost')}</Text></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cost.categories.map(c=><div key={c.key} className={panel}><p className="text-sm text-white/60">{c.key}</p><p className="mt-3 text-xl">{formatGuideBudgetCents(cost.currency,c.amountCents)}</p><Text>{guide.budgetItems.find(b=>b.label===c.key)?.note}</Text></div>)}</div></section>:null}
    <section className="py-8" data-itinerary-mode={guide.itineraryMode || 'daily'}><Heading id="itinerary">{guide.itineraryMode==='unassigned'?t('visited'):t('itinerary')}</Heading>
      {guide.itineraryMode==='unassigned'?<><Text>These are places we visited. Their day-by-day grouping remains to be confirmed.</Text><AttractionList source={guide} locations={data.locations}/></>:guide.itineraryMode==='segment'?(guide.itinerarySegments||[]).map(s=><Segment key={s.id} segment={s} locations={data.locations}/>):guide.days.map((day,i)=><Day key={i} day={day} locations={data.locations}/>)}</section>
    <section className="py-8"><Heading id="stays">{t('stay')}</Heading>{guide.accommodationStays?.map((stay,i)=>{const spot=data.locations.find(s=>s.id===stay.accommodationId);return <div key={i} className="mb-4"><p className="text-white/60">{stay.note}</p>{spot?<div className="mt-4 max-w-sm"><PlaceCard spot={spot}/></div>:null}</div>})}<Bullets items={guide.bestFor}/></section>
    <section className="py-8"><Heading id="notes">{t('notes')}</Heading><Bullets items={guide.notes}/><Video url={guide.videoUrl} title={guide.title}/>{guide.facebookUrl?<Video url={guide.facebookUrl} title={guide.title}/>:null}</section>
  </>
}
function OpeningHours({value}:{value?:string|null}) {
  if(!value) return null
  try { const hours=JSON.parse(value);return <><Text>{hours.is24Hours?'Open 24 hours':hours.isUnknown?'Opening hours not confirmed':hours.open&&hours.close?`${hours.open}–${hours.close}`:''}</Text>{hours.closedDays?.length?<Text>{`Closed: ${hours.closedDays.map((n:number)=>['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][n]).join(', ')}`}</Text>:null}<Text>{hours.remarks}</Text></> } catch { return <Text>{value}</Text> }
}
function PracticalPrices({value}:{value:unknown}) {
  const price=parsePriceInfo(value)
  const items=[['Admission — Adult',price.admissionAdult,price.admissionAdultSecondary],['Admission — Child',price.admissionChild,price.admissionChildSecondary],['Admission — Local Adult',price.admissionLocalAdult,price.admissionLocalAdultSecondary],['Admission — Local Child',price.admissionLocalChild,price.admissionLocalChildSecondary],['Admission — Foreign Adult',price.admissionForeignAdult,price.admissionForeignAdultSecondary],['Admission — Foreign Child',price.admissionForeignChild,price.admissionForeignChildSecondary],[t('stay'),price.accommodationBudget,price.accommodationBudgetSecondary],['Food',price.mealBudget,price.mealBudgetSecondary],[t('parking'),price.parkingBudget,price.parkingBudgetSecondary],[t('transport'),price.transportBudget,price.transportBudgetSecondary]]
  return <>{price.isFree?<Text>Free admission</Text>:null}<dl className="mt-5 space-y-4">{items.filter(([,amount])=>amount).map(([label,amount,secondary])=><div key={label}><dt className="text-sm text-white/50">{label}</dt><dd className="mt-1 text-sm">{price.currency} {amount}{secondary?` / ${price.secondaryCurrency} ${secondary}`:''}</dd></div>)}{price.customItems.map((item,i)=><div key={i}><dt>{item.labelEn || item.label}</dt><dd>{price.currency} {item.value}{item.valueSecondary?` / ${price.secondaryCurrency} ${item.valueSecondary}`:''}</dd><Text>{item.note}</Text></div>)}</dl><Text>{price.notes}</Text></>
}
export default function EnglishSite({data}:{data:EnglishPageData}) {
  const alternates=localizedAlternates(data.path,'en',data.status),robots=localizedRobots('en',data.status)
  const image=data.guide?.coverImage || data.spot?.image_url || data.region?.thumbnail
  const description=data.description.slice(0,180)
  return <>
    <Head><title>{data.title} | JnQ Journey</title><meta name="description" content={description}/><meta name="robots" content={`${robots.index?'index':'noindex'},follow`}/><link rel="canonical" href={absoluteUrl(alternates.canonical)}/>{Object.entries(alternates.languages||{}).map(([lang,path])=><link key={lang} rel="alternate" hrefLang={lang} href={absoluteUrl(path)}/>)}<meta property="og:title" content={data.title}/><meta property="og:description" content={description}/><meta property="og:url" content={absoluteUrl(alternates.canonical)}/><meta property="og:locale" content="en_US"/>{image?<meta property="og:image" content={image}/>:null}<link rel="icon" href="/icon.png?v=3"/></Head>
    <div className="min-h-screen bg-[#070c14] text-white [overflow-wrap:anywhere]">
      <header className="border-b border-white/10 bg-[#080d16]"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4"><a href="/en" className="text-lg font-semibold tracking-wide">JnQ Journey</a><LanguageSwitcher initialPath={localizedPath(data.path,'en')}/><nav aria-label="Main navigation" className="flex w-full flex-wrap gap-x-5 gap-y-1 text-xs text-white/65 md:w-auto md:text-sm">{[['/',t('home')],['/region',t('regions')],['/guide',t('guides')],['/search',t('search')],['/about',t('about')]].map(([path,label])=><a key={path} href={localizedPath(path,'en')} className="inline-flex min-h-11 items-center hover:text-amber-200">{label}</a>)}</nav></div></header>
      <main className="mx-auto max-w-7xl px-5 pb-20 pt-10 md:px-8 md:pt-16" data-translation-status={data.status}>
        <p className="text-xs uppercase tracking-[.25em] text-amber-200">Jayden & Qing · JnQ Journey</p>
        <h1 className="mt-5 max-w-5xl font-display text-5xl leading-[1.1] md:text-7xl">{data.spot?<EntityName locale="en" entity={data.spot.title!==data.spot.name?{name:data.spot.title,name_cn:data.spot.name_cn || data.spot.name}:data.spot}/>:data.region?<EntityName entity={data.region} locale="en"/>:data.title}</h1>
        {data.status!=='complete' && !['home','regions','guides','search'].includes(data.kind)?<p className="mt-5 rounded-xl border border-amber-200/20 p-4 text-xs leading-6 text-amber-100/70" role="status">{t('fallback')}</p>:null}
        <div className="max-w-3xl"><Text>{data.description}</Text></div>{data.kind === 'fallback' ? <a className="mt-6 inline-flex min-h-11 items-center text-amber-200" href={data.path}>Read the original Chinese page →</a> : null}
        {data.guide?<><p className="my-5 text-sm text-amber-200">{data.guide.duration} · {data.guide.travelStyle}</p><Bullets items={data.guide.heroBullets}/></>:null}
        {image?<div className="mt-8"><Picture src={image} alt={data.title} hero/></div>:null}
        {data.kind==='home'||data.kind==='search'?<div className="py-10"><PublicSearch locations={data.searchLocations || data.locations} regions={data.regions} guides={data.guides}/></div>:null}
        {data.kind==='home'||data.kind==='regions'?<section className="py-10"><Heading>{t('regions')}</Heading><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{(data.kind==='home'?data.regions.filter(r=>[1,2,78,79,92].includes(r.id)):data.regions).map(r=><a key={r.id} href={`/en/region/${r.slug}`} className={panel}><Picture src={r.thumbnail} alt={resolveEntityDisplayName(r,'en').primary}/><h3 className="mt-4 text-xl"><EntityName entity={r} locale="en"/></h3></a>)}</div></section>:null}
        {['home','guides','spot'].includes(data.kind)&&data.guides.length?<section className="py-10"><Heading>{data.kind==='spot'?t('relatedGuides'):t('guides')}</Heading><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{data.guides.map(g=><a key={g.slug} href={`/en/guide/${g.slug}`} className={panel} data-translation-status={g.translationStatus}><Picture src={g.coverImage} alt={g.title}/><h3 className="mt-4 font-display text-2xl">{g.title}</h3><p className="mt-3 text-xs text-amber-200">{g.duration}</p>{g.translationStatus==='complete'?<Text>{g.tagline}</Text>:<Text>{t('fallback')}</Text>}</a>)}</div></section>:null}
        {data.kind==='guide'?<GuideBody data={data}/>:null}
        {data.spot?<><section className="py-8"><Heading>{t('practical')}</Heading><div className={panel}>{data.spot.address?<><h3>{t('address')}</h3><Text>{data.spot.address}</Text></>:null}{data.spot.opening_hours?<><h3 className="mt-6">{t('hours')}</h3><OpeningHours value={data.spot.opening_hours}/></>:null}<PracticalPrices value={data.spot.price_info}/><a className="mt-5 inline-flex min-h-11 items-center text-amber-200" href={`https://www.google.com/maps/search/?api=1&query=${data.spot.latitude},${data.spot.longitude}`} target="_blank" rel="noreferrer">{t('map')}</a></div></section><Gallery title={data.title} images={(data.spot.images || []).map(url=>({url}))}/><Video url={data.spot.video_url || data.spot.facebook_video_url || undefined} title={data.title}/></>:null}
        {['region','spot'].includes(data.kind) && data.locations.length?<section className="py-10"><Heading>{data.kind==='spot'?t('nearby'):t('places')}</Heading><Places locations={data.locations}/></section>:null}
        {data.kind==='about'?<section className="max-w-3xl py-8"><Text>JnQ Journey is by Jayden & Qing. We share travel in Malaysia and beyond through our own photos, videos, place notes, route guides and experiences.</Text><a className="mt-6 inline-flex min-h-11 items-center text-amber-200" href="/about">中文 — About JnQ Journey</a></section>:null}
      </main>
      <footer className="border-t border-white/10 px-5 py-12"><div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-8"><div><p className="font-display text-3xl">Jayden & Qing</p><p className="mt-2 text-sm text-white/55">{t('intro')}</p></div><nav aria-label="Footer" className="flex flex-wrap gap-5 text-sm text-white/55"><a href="/en/about">{t('about')}</a><a href="/en/guide">{t('guides')}</a><a href="/en/region">{t('regions')}</a><a href="/en/search">{t('search')}</a></nav></div></footer>
    </div>
  </>
}
