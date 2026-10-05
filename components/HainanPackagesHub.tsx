'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, ChevronRight, Hotel, Luggage, MapPinned, Plane, Sparkles } from 'lucide-react'

import FallbackImage from '@/components/FallbackImage'
import WhatsAppButton from '@/components/WhatsAppButton'
import { getDeviceType, trackEvent } from '@/lib/analytics'
import type { TravelPackage } from '@/lib/server/travel-packages'

function findIncluded(item: TravelPackage, matcher: RegExp) {
  return (item.included_items || []).find((entry) => matcher.test(entry)) || '—'
}

function routeSummary(item: TravelPackage) {
  const days = item.itinerary_days || []
  if (!days.length) return '—'
  return days.map((day) => day.title).join(' · ')
}

function highlightSummary(item: TravelPackage) {
  const highlights = (item.highlights || []).filter((text) => !text.includes('直升机'))
  return highlights.slice(0, 4)
}

function hainanDetailHref(item: TravelPackage) {
  return `/packages/hainan/${item.slug.replace(/^hainan-/, '')}`
}

export default function HainanPackagesHub({ packages }: { packages: TravelPackage[] }) {
  const options = [...packages].sort((a, b) => {
    const da = Number.parseInt(a.duration || '', 10) || 999
    const db = Number.parseInt(b.duration || '', 10) || 999
    return da - db
  })
  const hero = options.find((item) => item.slug.includes('5d4n')) || options[0]
  const lowestPrice = options
    .map((item) => Number((item.price_display || '').replace(/,/g, '').match(/RM\s*([0-9]+)/i)?.[1] || ''))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b)[0]

  useEffect(() => {
    trackEvent('package_comparison_view', {
      page_path: window.location.pathname,
      page_type: 'package_hub',
      package_name: '海南旅游配套',
      option_count: options.length,
      device_type: getDeviceType(),
    })
  }, [options.length])

  const trackOptionSelect = (item: TravelPackage, position: string) => {
    trackEvent('package_option_select', {
      page_path: window.location.pathname,
      page_type: 'package_hub',
      package_id: item.id,
      package_name: item.title_zh,
      option_slug: item.slug,
      option_duration: item.duration,
      price_from: item.price_display,
      position,
      device_type: getDeviceType(),
    })
  }

  return (
    <main className="min-h-screen bg-[#050816] pb-20 text-white">
      <section className="relative flex min-h-[68svh] items-end overflow-hidden">
        {hero?.cover_image ? (
          <FallbackImage src={hero.cover_image} alt="海南旅游配套" fill priority sizes="100vw" className="object-cover" />
        ) : (
          <div className="absolute inset-0 bg-[#08101d]" />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,8,22,0.94)_0%,rgba(5,8,22,0.70)_50%,rgba(5,8,22,0.30)_100%)]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050816] via-transparent to-black/15" />
        <div className="relative mx-auto w-full max-w-6xl px-5 pb-14 pt-32 md:px-8 md:pb-20">
          <nav className="mb-7 flex items-center gap-2 text-xs text-white/55">
            <Link href="/">首页</Link>
            <ChevronRight className="h-3 w-3" />
            <Link href="/packages">旅游配套</Link>
          </nav>
          <p className="text-xs uppercase tracking-[0.2em] text-amber-200/80">Hainan · China</p>
          <h1 className="mt-4 max-w-4xl text-5xl font-semibold leading-[1.05] md:text-7xl">海南旅游配套</h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-white/70 md:text-lg">
            目前有 {options.length} 个方案可选，先比较天数、价格与行程，再进入单个配套查看完整内容。
          </p>
          <div className="mt-7 flex flex-wrap gap-3 text-sm">
            <span className="rounded-full border border-amber-200/25 bg-amber-200/10 px-4 py-2 text-amber-50">{options.length} 个方案可选</span>
            {lowestPrice ? <span className="rounded-full border border-white/15 bg-black/25 px-4 py-2">RM{lowestPrice.toLocaleString('en-MY')}++ 起 / 人</span> : null}
            <span className="rounded-full border border-white/15 bg-black/25 px-4 py-2">吉隆坡直飞琼海</span>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-16 px-5 py-14 md:px-8 md:py-20">
        <section>
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/70">Package options</p>
            <h2 className="mt-2 text-3xl font-semibold md:text-4xl">选择适合你的海南行程</h2>
            <p className="mt-4 leading-7 text-white/55">两个配套各自保留独立详情页，资料不会混在一起。</p>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            {options.map((item) => {
              const highlights = highlightSummary(item)
              return (
                <article key={item.id} className="overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.04]">
                  {item.cover_image ? (
                    <div className="relative aspect-[16/9] overflow-hidden">
                      <FallbackImage src={item.cover_image} alt={item.title_zh} fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover transition duration-500 hover:scale-[1.02]" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent" />
                      <div className="absolute bottom-4 left-4 flex flex-wrap gap-2">
                        <span className="rounded-full border border-white/15 bg-black/55 px-3 py-1 text-xs backdrop-blur">{item.duration}</span>
                        {item.price_display ? <span className="rounded-full border border-amber-200/20 bg-amber-200/15 px-3 py-1 text-xs text-amber-50 backdrop-blur">{item.price_display}</span> : null}
                      </div>
                    </div>
                  ) : null}
                  <div className="p-6 md:p-7">
                    <div className="flex items-center gap-2 text-xs text-amber-200/70">
                      <MapPinned className="h-4 w-4" /> Hainan, China
                    </div>
                    <h3 className="mt-3 text-2xl font-semibold leading-tight md:text-3xl">{item.title_zh}</h3>
                    {item.title_en ? <p className="mt-2 text-sm text-white/38">{item.title_en}</p> : null}
                    {item.short_description ? <p className="mt-5 leading-7 text-white/62">{item.short_description}</p> : null}

                    {highlights.length ? (
                      <ul className="mt-5 grid gap-2">
                        {highlights.map((text) => (
                          <li key={text} className="flex gap-3 text-sm leading-6 text-white/68">
                            <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-300" />
                            <span>{text}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    <div className="mt-7 flex flex-wrap gap-3">
                      <Link href={hainanDetailHref(item)} onClick={() => trackOptionSelect(item, 'hainan_hub_card')} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black">
                        查看完整行程 <ArrowRight className="h-4 w-4" />
                      </Link>
                      <WhatsAppButton
                        pageType="package"
                        packageName={item.title_zh}
                        packageId={item.id}
                        regionName={item.destination || undefined}
                        priceFrom={item.price_display || undefined}
                        source={item.source_code || undefined}
                        message={item.whatsapp_message || undefined}
                        label="WhatsApp 查询"
                        position="hainan_hub_card"
                      />
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        {options.length >= 2 ? (
          <section>
            <div className="max-w-3xl">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/70">Quick comparison</p>
              <h2 className="mt-2 text-3xl font-semibold md:text-4xl">一张表看 4天3夜 / 5天4夜差别</h2>
              <p className="mt-4 text-sm leading-7 text-white/50">这里只比较现有配套资料，不额外改写或推测行程内容。</p>
            </div>

            <div className="mt-7 overflow-x-auto overscroll-x-contain rounded-[28px] border border-white/10 bg-white/[0.025]">
              <table className="min-w-[760px] w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="sticky left-0 z-10 w-[150px] bg-[#090d1b] px-5 py-4 text-xs uppercase tracking-[0.16em] text-white/35">比较项目</th>
                    {options.map((item) => (
                      <th key={item.id} className="min-w-[300px] px-5 py-4 align-top">
                        <p className="text-lg font-semibold text-white">{item.duration}</p>
                        <p className="mt-1 text-sm text-amber-100">{item.price_display}</p>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.07] text-sm">
                  {[
                    { label: '参考价格', values: options.map((item) => item.price_display || '—') },
                    { label: '行程天数', values: options.map((item) => item.duration || '—') },
                    { label: '主要路线', values: options.map(routeSummary) },
                    { label: '住宿', values: options.map((item) => findIncluded(item, /酒店|住宿/)) },
                    { label: '行李', values: options.map((item) => findIncluded(item, /KG|行李/i)) },
                  ].map((row) => (
                    <tr key={row.label}>
                      <th className="sticky left-0 z-10 bg-[#090d1b] px-5 py-4 font-medium text-white/55">{row.label}</th>
                      {row.values.map((value, index) => <td key={index} className="px-5 py-4 leading-7 text-white/68">{value}</td>)}
                    </tr>
                  ))}
                  <tr>
                    <th className="sticky left-0 z-10 bg-[#090d1b] px-5 py-4 font-medium text-white/55">重点体验</th>
                    {options.map((item) => (
                      <td key={item.id} className="px-5 py-4 align-top">
                        <ul className="space-y-2">
                          {highlightSummary(item).map((text) => (
                            <li key={text} className="flex gap-2 leading-6 text-white/68">
                              <Sparkles className="mt-1 h-3.5 w-3.5 shrink-0 text-amber-200" />
                              <span>{text}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th className="sticky left-0 z-10 bg-[#090d1b] px-5 py-4 font-medium text-white/55">查看详情</th>
                    {options.map((item) => (
                      <td key={item.id} className="px-5 py-5">
                        <Link href={hainanDetailHref(item)} onClick={() => trackOptionSelect(item, 'hainan_comparison_table')} className="inline-flex items-center gap-2 text-sm font-semibold text-amber-100">
                          打开 {item.duration} 配套 <ArrowRight className="h-4 w-4" />
                        </Link>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-white/35 md:hidden">← 左右滑动查看两个方案 →</p>
          </section>
        ) : null}

        <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-6 md:p-8">
          <div className="grid gap-5 sm:grid-cols-3">
            <div className="flex gap-3"><Plane className="h-5 w-5 shrink-0 text-amber-200" /><div><p className="font-medium">航班</p><p className="mt-1 text-sm leading-6 text-white/48">以各配套详情页列出的航班资料为准</p></div></div>
            <div className="flex gap-3"><Luggage className="h-5 w-5 shrink-0 text-amber-200" /><div><p className="font-medium">行李</p><p className="mt-1 text-sm leading-6 text-white/48">两个方案目前资料均列有 23KG 托运行李</p></div></div>
            <div className="flex gap-3"><Hotel className="h-5 w-5 shrink-0 text-amber-200" /><div><p className="font-medium">住宿</p><p className="mt-1 text-sm leading-6 text-white/48">住宿安排与晚数请进入各方案详情查看</p></div></div>
          </div>
        </section>
      </div>
    </main>
  )
}
