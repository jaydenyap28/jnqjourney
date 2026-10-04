'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  ChevronRight,
  Hotel,
  Luggage,
  Maximize2,
  Plane,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'

import FallbackImage from '@/components/FallbackImage'
import WhatsAppButton from '@/components/WhatsAppButton'
import { getDeviceType, trackEvent } from '@/lib/analytics'
import type { TravelPackage, TravelPackageImage } from '@/lib/server/travel-packages'

const RELATED_SPOTS: Record<string, { name: string; slug: string }> = {
  '461': { name: '南山文化旅游区', slug: 'nan-shan-wen-hua-jing-hainan' },
  '466': { name: '亚龙湾海底世界餐厅', slug: 'ya-long-wan-hai-di-hainan-cuisine' },
  '471': { name: '槟榔谷黎苗文化旅游区', slug: 'bin-lang-gu-hainan' },
  '477': { name: '天涯小镇', slug: 'tian-ya-xiao-zhen-hainan' },
}

function normalizeGallery(item: TravelPackage) {
  return (item.gallery || [])
    .map((image, index) =>
      typeof image === 'string'
        ? { url: image, alt: '', caption: '', sort_order: index }
        : { ...image, sort_order: image.sort_order ?? index },
    )
    .filter((image) => image.url)
    .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0))
}

function isBrochureImage(image: TravelPackageImage) {
  return /原封面|配套图|brochure/i.test(`${image.caption || ''} ${image.alt || ''}`)
}

function isJnqPhoto(image: TravelPackageImage) {
  return /JnQ Journey 海南实拍/i.test(image.caption || '')
}

export default function HainanPackageDetail({
  item,
  preview = false,
}: {
  item: TravelPackage
  preview?: boolean
}) {
  const gallery = useMemo(() => normalizeGallery(item), [item])
  const brochure = gallery.find(isBrochureImage) || null
  const travelPhotos = gallery.filter((image) => !isBrochureImage(image))
  const [activeImage, setActiveImage] = useState<TravelPackageImage | null>(null)

  const quickFacts = useMemo(() => {
    const included = item.included_items || []
    return [
      item.duration || '',
      included.find((entry) => entry.includes('往返机票')) || '',
      included.find((entry) => entry.includes('23KG')) || '',
      included.find((entry) => entry.includes('4 晚')) || '',
    ].filter(Boolean)
  }, [item.duration, item.included_items])

  const relatedSpots = (item.related_location_ids || [])
    .map((id) => RELATED_SPOTS[String(id)])
    .filter(Boolean)

  const featuredHighlights = item.highlights || []

  useEffect(() => {
    if (!activeImage) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveImage(null)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [activeImage])

  const openImage = (image: TravelPackageImage) => {
    setActiveImage(image)
    if (preview) return
    trackEvent(isBrochureImage(image) ? 'package_brochure_view' : 'package_gallery_open', {
      page_path: window.location.pathname,
      page_type: 'package',
      package_id: item.id,
      package_name: item.title_zh,
      region_name: item.destination,
      price_from: item.price_display,
      device_type: getDeviceType(),
      source_code: item.source_code,
      image_caption: image.caption,
    })
  }

  const cta = (label: string, position: string, className = '') => (
    <WhatsAppButton
      pageType="package"
      packageName={item.title_zh}
      packageId={item.id}
      regionName={item.destination || undefined}
      priceFrom={item.price_display || undefined}
      source={item.source_code || undefined}
      message={item.whatsapp_message || undefined}
      label={label}
      position={position}
      track={!preview}
      className={className}
    />
  )

  return (
    <main className="min-h-screen bg-[#050816] pb-32 text-white md:pb-0">
      <section className="relative flex min-h-[82svh] items-end overflow-hidden">
        {item.cover_image ? (
          <FallbackImage
            src={item.cover_image}
            alt={item.title_zh}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-[#08101d]" />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,8,22,0.92)_0%,rgba(5,8,22,0.68)_48%,rgba(5,8,22,0.20)_100%)]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050816] via-transparent to-black/15" />

        <div className="relative mx-auto w-full max-w-6xl px-5 pb-14 pt-32 md:px-8 md:pb-20">
          <nav className="mb-7 flex items-center gap-2 text-xs text-white/55">
            <Link href="/">首页</Link>
            <ChevronRight className="h-3 w-3" />
            <Link href="/packages">旅游配套</Link>
          </nav>

          <p className="text-xs uppercase tracking-[0.2em] text-amber-200/80">
            {item.destination} · {item.duration}
          </p>

          <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-[1.08] md:text-7xl">
            {item.title_zh}
          </h1>
          {item.title_en ? <p className="mt-3 text-base text-white/50 md:text-lg">{item.title_en}</p> : null}
          {item.short_description ? (
            <p className="mt-6 max-w-3xl text-base leading-8 text-white/72">{item.short_description}</p>
          ) : null}

          <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-white/40">参考价格</p>
              <p className="mt-1 text-3xl font-semibold text-amber-100 md:text-4xl">{item.price_display || '查询最新价格'}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {cta('查询这个海南配套', 'hainan_hero')}
              <a
                href="#itinerary"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/20 bg-black/25 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
              >
                查看 5 天行程
              </a>
            </div>
          </div>

          {quickFacts.length ? (
            <div className="mt-8 grid max-w-4xl gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {quickFacts.map((fact, index) => {
                const Icon = index === 1 ? Plane : index === 2 ? Luggage : index === 3 ? Hotel : Sparkles
                return (
                  <div key={fact} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 backdrop-blur-sm">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
                    <span className="text-sm leading-6 text-white/72">{fact}</span>
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-16 px-5 py-14 md:px-8 md:py-20">
        {item.full_description ? (
          <section className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:gap-14">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/70">Package overview</p>
              <h2 className="mt-2 text-3xl font-semibold md:text-4xl">先看懂这趟旅程</h2>
            </div>
            <div className="whitespace-pre-line text-base leading-8 text-white/68">{item.full_description}</div>
          </section>
        ) : null}

        {featuredHighlights.length ? (
          <section>
            <div className="max-w-3xl">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/70">Highlights</p>
              <h2 className="mt-2 text-3xl font-semibold md:text-4xl">配套亮点</h2>
            </div>
            <div className="mt-7 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {featuredHighlights.map((text, index) => (
                <div key={text} className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-200/20 bg-amber-200/10 text-sm font-semibold text-amber-100">
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <p className="mt-4 leading-7 text-white/75">{text}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {travelPhotos.length ? (
          <section>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/70">JnQ Journey</p>
                <h2 className="mt-2 text-3xl font-semibold md:text-4xl">海南实拍</h2>
              </div>
              <p className="max-w-xl text-sm leading-6 text-white/45">图片说明沿用目前配套资料，不额外改写景点内容。</p>
            </div>

            <div className="mt-7 grid gap-4 md:grid-cols-2">
              {travelPhotos.map((image, index) => (
                <button
                  key={`${image.url}-${index}`}
                  type="button"
                  onClick={() => openImage(image)}
                  className={`group relative overflow-hidden rounded-[26px] border border-white/10 bg-black/25 text-left transition hover:border-white/25 ${index === 0 ? 'md:col-span-2' : ''}`}
                >
                  <div className={`relative ${index === 0 ? 'aspect-[16/8.4]' : 'aspect-[4/3]'}`}>
                    <FallbackImage
                      src={image.url}
                      alt={image.alt || item.title_zh}
                      fill
                      sizes={index === 0 ? '(max-width: 768px) 100vw, 1100px' : '(max-width: 768px) 100vw, 550px'}
                      className="object-cover transition duration-500 group-hover:scale-[1.02]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                    {isJnqPhoto(image) ? (
                      <span className="absolute left-4 top-4 rounded-full border border-white/15 bg-black/55 px-3 py-1 text-[11px] font-medium tracking-[0.08em] text-white/85 backdrop-blur">
                        JnQ 实拍
                      </span>
                    ) : null}
                    <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-black/55 px-3 py-1 text-xs text-white/80 backdrop-blur">
                      <Maximize2 className="h-3.5 w-3.5" /> 查看
                    </span>
                    {image.caption ? (
                      <span className="absolute bottom-0 left-0 right-0 p-5 text-sm leading-6 text-white/90">
                        {image.caption}
                      </span>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {brochure ? (
          <section className="grid gap-6 overflow-hidden rounded-[30px] border border-amber-200/15 bg-amber-200/[0.045] p-6 md:grid-cols-[0.78fr_1.22fr] md:p-8">
            <button
              type="button"
              onClick={() => openImage(brochure)}
              className="group relative aspect-[4/3] overflow-hidden rounded-[22px] border border-white/10 bg-black/30"
            >
              <FallbackImage
                src={brochure.url}
                alt={brochure.alt || item.title_zh}
                fill
                sizes="(max-width: 768px) 100vw, 440px"
                className="object-contain p-2"
              />
              <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/65 px-3 py-1 text-xs text-white/85">
                <Maximize2 className="h-3.5 w-3.5" /> 查看全图
              </span>
            </button>
            <div className="flex flex-col justify-center">
              <p className="text-xs uppercase tracking-[0.2em] text-amber-200/70">Package artwork</p>
              <h2 className="mt-2 text-3xl font-semibold">完整配套图</h2>
              {brochure.caption ? <p className="mt-4 text-sm leading-7 text-white/60">{brochure.caption}</p> : null}
              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => openImage(brochure)}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-amber-200/25 bg-amber-200/10 px-5 py-2.5 text-sm font-medium text-amber-50 transition hover:bg-amber-200/15"
                >
                  打开完整图片
                </button>
              </div>
            </div>
          </section>
        ) : null}

        <section id="itinerary" className="scroll-mt-24">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/70">5D4N itinerary</p>
            <h2 className="mt-2 text-3xl font-semibold md:text-4xl">5 天行程</h2>
          </div>

          <div className="mt-8 space-y-5">
            {(item.itinerary_days || []).map((day, index) => (
              <article
                key={`${day.title}-${index}`}
                className="grid gap-5 rounded-[28px] border border-white/10 bg-white/[0.03] p-5 md:grid-cols-[8rem_1fr] md:p-7"
              >
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-amber-200/70">Day {index + 1}</p>
                  <p className="mt-2 text-sm text-white/38">{item.duration}</p>
                </div>
                <div>
                  <h3 className="text-2xl font-semibold leading-tight">{day.title}</h3>
                  {day.summary ? <p className="mt-3 leading-7 text-white/62">{day.summary}</p> : null}
                  {day.items?.length ? (
                    <ul className="mt-5 grid gap-2 md:grid-cols-2">
                      {day.items.map((entry) => (
                        <li key={entry} className="flex gap-3 rounded-xl bg-black/18 px-3 py-2.5 text-sm leading-6 text-white/68">
                          <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-300" />
                          <span>{entry}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </article>
            ))}
          </div>

          <div className="mt-8">{cta('WhatsApp 确认日期与价格', 'hainan_after_itinerary')}</div>
        </section>

        {(item.included_items?.length || item.excluded_items?.length) ? (
          <section>
            <div className="max-w-3xl">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/70">What is included</p>
              <h2 className="mt-2 text-3xl font-semibold md:text-4xl">包含与不包含</h2>
            </div>
            <div className="mt-7 grid gap-5 md:grid-cols-2">
              <div className="rounded-[28px] border border-emerald-200/15 bg-emerald-300/[0.04] p-6">
                <h3 className="text-xl font-semibold">配套包含</h3>
                <ul className="mt-5 space-y-3">
                  {item.included_items?.map((text) => (
                    <li key={text} className="flex gap-3 text-sm leading-7 text-white/72">
                      <Check className="mt-1.5 h-4 w-4 shrink-0 text-emerald-300" />
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-[28px] border border-rose-200/12 bg-rose-300/[0.025] p-6">
                <h3 className="text-xl font-semibold">配套不包含</h3>
                <ul className="mt-5 space-y-3">
                  {item.excluded_items?.map((text) => (
                    <li key={text} className="flex gap-3 text-sm leading-7 text-white/72">
                      <X className="mt-1.5 h-4 w-4 shrink-0 text-rose-300" />
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        ) : null}

        {item.suitable_for?.length ? (
          <section>
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/70">Suitable for</p>
            <h2 className="mt-2 text-3xl font-semibold md:text-4xl">适合谁</h2>
            <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {item.suitable_for.map((text) => (
                <div key={text} className="rounded-[22px] border border-white/10 bg-white/[0.035] p-5 text-sm leading-7 text-white/68">
                  {text}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {item.notes?.length ? (
          <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 md:p-8">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-amber-200" />
              <h2 className="text-2xl font-semibold">确认前请留意</h2>
            </div>
            <ul className="mt-5 space-y-3">
              {item.notes.map((text) => (
                <li key={text} className="text-sm leading-7 text-white/62">• {text}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {relatedSpots.length ? (
          <section>
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/70">Explore Hainan</p>
            <h2 className="mt-2 text-3xl font-semibold md:text-4xl">行程里的海南地点</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {relatedSpots.map((spot) => (
                <Link
                  key={spot.slug}
                  href={`/spot/${spot.slug}`}
                  className="group rounded-[22px] border border-white/10 bg-white/[0.035] p-5 transition hover:-translate-y-1 hover:border-amber-200/25 hover:bg-white/[0.055]"
                >
                  <p className="text-sm font-medium leading-6 text-white/82">{spot.name}</p>
                  <p className="mt-2 text-xs text-white/38">查看 JnQ 景点资料 →</p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-[32px] border border-amber-200/20 bg-[linear-gradient(135deg,rgba(251,191,36,0.10),rgba(255,255,255,0.035))] p-6 md:p-9">
          <div className="grid gap-7 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-amber-200/70">Price & confirmation</p>
              <h2 className="mt-2 text-3xl font-semibold md:text-4xl">价格与确认</h2>
              {item.price_display ? <p className="mt-5 text-3xl font-semibold text-amber-100">{item.price_display}</p> : null}
              {item.price_note ? <p className="mt-4 max-w-3xl leading-7 text-white/62">{item.price_note}</p> : null}
            </div>
            <div>{cta('查询最新出发日期和价格', 'hainan_page_bottom')}</div>
          </div>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-[70] border-t border-white/10 bg-[#050816]/94 px-4 py-3 backdrop-blur-xl md:hidden">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.14em] text-white/35">参考价格</p>
            <p className="truncate text-sm font-semibold text-amber-100">{item.price_display || '查询最新价格'}</p>
          </div>
          {cta('查询日期与价格', 'hainan_mobile_sticky', 'shrink-0 px-4')}
        </div>
      </div>

      {activeImage ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/92 p-4 md:p-8"
          role="dialog"
          aria-modal="true"
          aria-label={activeImage.alt || item.title_zh}
          onMouseDown={() => setActiveImage(null)}
        >
          <div className="relative flex h-full w-full max-w-6xl flex-col" onMouseDown={(event) => event.stopPropagation()}>
            <div className="relative min-h-0 flex-1">
              <FallbackImage
                src={activeImage.url}
                alt={activeImage.alt || item.title_zh}
                fill
                priority
                className="object-contain"
              />
            </div>
            <div className="flex shrink-0 items-center justify-between gap-4 pt-3">
              <p className="text-sm text-white/70">{activeImage.caption || item.title_zh}</p>
              <button
                type="button"
                onClick={() => setActiveImage(null)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 bg-black/40 text-white transition hover:bg-white/10"
                aria-label="关闭完整图片"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
