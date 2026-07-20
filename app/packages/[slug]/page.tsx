import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Check, ChevronRight, X } from 'lucide-react'

import FallbackImage from '@/components/FallbackImage'
import PackageViewTracker from '@/components/PackageViewTracker'
import SiteFooter from '@/components/SiteFooter'
import WhatsAppButton from '@/components/WhatsAppButton'
import { absoluteUrl } from '@/lib/site'
import { readPublishedPackage } from '@/lib/server/travel-packages'

export const revalidate = 600

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const item = await readPublishedPackage(params.slug)
  if (!item) return { title: '旅游配套未找到' }
  const title = item.seo_title || item.title_zh
  const description = item.seo_description || item.short_description || 'JnQ Journey 旅游配套详情。'
  const canonical = item.canonical_url || `/packages/${item.slug}`
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, images: item.cover_image ? [item.cover_image] : undefined },
    twitter: { card: 'summary_large_image', title, description, images: item.cover_image ? [item.cover_image] : undefined },
  }
}

export default async function PackagePage({ params }: { params: { slug: string } }) {
  const item = await readPublishedPackage(params.slug)
  if (!item) notFound()
  const canonicalPath = item.canonical_url || `/packages/${item.slug}`
  const cta = (label: string, position: string) => (
    <WhatsAppButton pageType="package" packageName={item.title_zh} source={item.source_code || undefined} message={item.whatsapp_message || undefined} label={label} position={position} />
  )
  const jsonLd = [
    { '@context': 'https://schema.org', '@type': 'TouristTrip', name: item.title_zh, description: item.short_description, image: item.cover_image || undefined, url: absoluteUrl(canonicalPath), touristType: item.suitable_for || undefined },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'JnQ Journey', item: absoluteUrl('/') },
      { '@type': 'ListItem', position: 2, name: '旅游配套', item: absoluteUrl('/packages') },
      { '@type': 'ListItem', position: 3, name: item.title_zh, item: absoluteUrl(canonicalPath) },
    ] },
  ]

  return (
    <main className="min-h-screen bg-[#050816] text-white pb-20 md:pb-0">
      <PackageViewTracker packageId={item.id} packageName={item.title_zh} sourceCode={item.source_code} />
      {jsonLd.map((data, index) => <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />)}
      <section className="relative flex min-h-[78svh] items-end overflow-hidden">
        {item.cover_image ? <FallbackImage src={item.cover_image} alt={item.title_zh} fill priority className="object-cover" /> : <div className="absolute inset-0 bg-[linear-gradient(135deg,#122238,#08101d_55%,#050816)]" />}
        <div className="absolute inset-0 bg-gradient-to-t from-[#050816] via-[#050816]/55 to-black/15" />
        <div className="relative mx-auto w-full max-w-6xl px-5 pb-14 pt-36 md:px-8 md:pb-20">
          <nav className="mb-7 flex items-center gap-2 text-xs text-white/55"><Link href="/">首页</Link><ChevronRight className="h-3 w-3" /><Link href="/packages">旅游配套</Link></nav>
          <p className="text-xs uppercase text-amber-200/75">{item.destination} · {item.duration}</p>
          <h1 className="mt-3 max-w-4xl text-4xl font-semibold leading-tight md:text-7xl">{item.title_zh}</h1>
          {item.title_en ? <p className="mt-3 text-lg text-white/55">{item.title_en}</p> : null}
          <p className="mt-6 max-w-3xl text-base leading-8 text-white/72">{item.short_description}</p>
          <div className="mt-8 flex flex-wrap gap-3">{cta('WhatsApp 查询最新价格', 'hero')}<Link href={item.related_guide_slugs?.[0] ? `/guide/${item.related_guide_slugs[0]}` : '/guide'} className="inline-flex min-h-11 items-center rounded-full border border-white/20 bg-black/20 px-5 py-2.5 text-sm">查看相关旅游攻略</Link></div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-16 px-5 py-14 md:px-8 md:py-20">
        {item.highlights?.length ? <section><h2 className="text-3xl font-semibold">配套亮点</h2><div className="mt-6 grid gap-3 md:grid-cols-2">{item.highlights.map((text) => <div key={text} className="flex gap-3 rounded-2xl border border-white/10 bg-white/5 p-4"><Check className="mt-1 h-4 w-4 shrink-0 text-emerald-300" /><span className="leading-7 text-white/72">{text}</span></div>)}</div><div className="mt-7">{cta('查询巴淡岛配套价格', 'inline')}</div></section> : null}
        {item.suitable_for?.length ? <section><h2 className="text-3xl font-semibold">适合谁</h2><div className="mt-5 flex flex-wrap gap-2">{item.suitable_for.map((text) => <span key={text} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70">{text}</span>)}</div></section> : null}
        {item.itinerary_days?.length ? <section><h2 className="text-3xl font-semibold">行程摘要</h2><div className="mt-7 space-y-4">{item.itinerary_days.map((day, index) => <article key={`${day.title}-${index}`} className="grid gap-4 border-l border-amber-200/30 pl-5 md:grid-cols-[7rem_1fr]"><p className="text-sm font-semibold text-amber-200">Day {index + 1}</p><div><h3 className="text-xl font-semibold">{day.title}</h3>{day.summary ? <p className="mt-2 leading-7 text-white/65">{day.summary}</p> : null}{day.items?.length ? <ul className="mt-3 space-y-2 text-sm text-white/60">{day.items.map((entry) => <li key={entry}>· {entry}</li>)}</ul> : null}</div></article>)}</div><div className="mt-8">{cta('WhatsApp 确认日期', 'after_itinerary')}</div></section> : null}
        {(item.included_items?.length || item.excluded_items?.length) ? <section className="grid gap-6 md:grid-cols-2"><div><h2 className="text-2xl font-semibold">配套包含</h2><ul className="mt-5 space-y-3">{item.included_items?.map((text) => <li key={text} className="flex gap-3 text-white/70"><Check className="mt-1 h-4 w-4 text-emerald-300" />{text}</li>)}</ul></div><div><h2 className="text-2xl font-semibold">配套不包含</h2><ul className="mt-5 space-y-3">{item.excluded_items?.map((text) => <li key={text} className="flex gap-3 text-white/70"><X className="mt-1 h-4 w-4 text-rose-300" />{text}</li>)}</ul></div></section> : null}
        <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 md:p-8"><h2 className="text-2xl font-semibold">价格与确认</h2>{item.price_display ? <p className="mt-4 text-2xl text-amber-100">{item.price_display}</p> : null}<p className="mt-3 max-w-3xl leading-7 text-white/65">{item.price_note || '最新价格会根据出发日期、人数、房型及出发码头调整，请通过 WhatsApp 查询。'}</p><div className="mt-6">{cta('查看是否有位', 'page_bottom')}</div></section>
      </div>
      <SiteFooter />
    </main>
  )
}
