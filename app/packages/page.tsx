import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Compass, MapPinned } from 'lucide-react'

import FallbackImage from '@/components/FallbackImage'
import SiteFooter from '@/components/SiteFooter'
import WhatsAppButton from '@/components/WhatsAppButton'
import WhatsAppFloatingButton from '@/components/WhatsAppFloatingButton'
import { readPublishedPackagesUncached } from '@/lib/server/travel-packages'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const metadata: Metadata = {
  title: '旅游配套',
  description: '查看 JnQ Journey 已发布的旅游配套，并通过 WhatsApp 查询日期与最新价格。',
  alternates: { canonical: '/packages' },
}

export default async function PackagesPage() {
  const packages = await readPublishedPackagesUncached()
  const hainanPackages = packages.filter((item) => item.slug.startsWith('hainan-'))
  const regularPackages = packages.filter((item) => !item.slug.startsWith('hainan-'))
  const hainanCover = hainanPackages.find((item) => item.slug.includes('5d4n'))?.cover_image || hainanPackages[0]?.cover_image || ''
  const hainanLowestPrice = hainanPackages
    .map((item) => Number((item.price_display || '').replace(/,/g, '').match(/RM\s*([0-9]+)/i)?.[1] || ''))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b)[0]
  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <section className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <p className="text-xs uppercase text-amber-200/70">Travel packages / 旅游配套</p>
        <h1 className="mt-3 text-4xl font-semibold md:text-6xl">从真实旅行内容，走到可以出发的安排。</h1>
        <p className="mt-5 max-w-3xl leading-8 text-white/65">这里仅显示资料已完成并正式发布的配套。价格与可出发日期以 WhatsApp 最新确认为准。</p>

        {packages.length ? (
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {regularPackages.map((item) => (
              <article key={item.id} className="overflow-hidden rounded-[28px] border border-white/10 bg-white/5">
                {item.cover_image ? <div className="relative aspect-[16/9]"><FallbackImage src={item.cover_image} alt={item.title_zh} fill className="object-cover" /></div> : null}
                <div className="p-6">
                  <div className="flex items-center gap-2 text-xs text-amber-200/75"><MapPinned className="h-4 w-4" />{item.destination || 'JnQ Journey'}</div>
                  <h2 className="mt-3 text-2xl font-semibold">{item.title_zh}</h2>
                  {item.title_en ? <p className="mt-1 text-sm text-white/45">{item.title_en}</p> : null}
                  <p className="mt-4 leading-7 text-white/65">{item.short_description}</p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Link href={`/packages/${item.slug}`} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black">查看详情 <ArrowRight className="h-4 w-4" /></Link>
                    <WhatsAppButton pageType="package" packageName={item.title_zh} source={item.source_code || undefined} message={item.whatsapp_message || undefined} label="WhatsApp 咨询" position="inline" />
                  </div>
                </div>
              </article>
            ))}
            {hainanPackages.length ? (
              <article className="overflow-hidden rounded-[28px] border border-white/10 bg-white/5">
                {hainanCover ? <div className="relative aspect-[16/9]"><FallbackImage src={hainanCover} alt="海南岛旅游配套" fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" /></div> : null}
                <div className="p-6">
                  <div className="flex items-center gap-2 text-xs text-amber-200/75"><MapPinned className="h-4 w-4" />Hainan, China</div>
                  <h2 className="mt-3 text-2xl font-semibold">海南岛旅游配套</h2>
                  <p className="mt-1 text-sm text-white/45">4天3夜 / 5天4夜 · {hainanPackages.length} 个方案可选</p>
                  <p className="mt-4 leading-7 text-white/65">先比较两个海南方案的价格、天数和行程，再进入单个配套查看完整内容。</p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/55">
                    {hainanPackages
                      .slice()
                      .sort((a, b) => (Number.parseInt(a.duration || '', 10) || 99) - (Number.parseInt(b.duration || '', 10) || 99))
                      .map((item) => (
                        <span key={item.id} className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">{item.duration} · {item.price_display}</span>
                      ))}
                  </div>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Link href="/packages/hainan" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black">比较海南方案 <ArrowRight className="h-4 w-4" /></Link>
                    <WhatsAppButton pageType="package" packageName="海南岛旅游配套" source="JNQ-HAINAN-HUB" label="WhatsApp 咨询" position="inline" />
                  </div>
                </div>
              </article>
            ) : null}
          </div>
        ) : (
          <div className="mt-12 border-y border-white/10 py-10 md:py-14">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-amber-200/20 bg-amber-200/10 text-amber-100"><Compass className="h-5 w-5" /></div>
            <h2 className="mt-5 text-2xl font-semibold md:text-3xl">旅游配套正在整理中</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/60 md:text-base">Jayden &amp; Qing 正在整理实拍行程、住宿和交通资料，完整配套确认后会陆续上线。</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <WhatsAppButton
                pageType="package"
                source="JNQ-PACKAGES-EMPTY"
                message={'你好，我从 JnQ Journey 网站看到你们，想咨询旅游配套。\n\n预计日期：\n人数：\n目的地：\n其他要求：\n\n来源：JNQ-PACKAGES-EMPTY'}
                label="WhatsApp 咨询旅行配套"
                position="empty_state"
              />
              <Link href="/guide" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10">浏览旅游攻略 <ArrowRight className="h-4 w-4" /></Link>
            </div>
          </div>
        )}
      </section>
      <WhatsAppFloatingButton pageType="package" source="JNQ-PACKAGES-FLOATING" />
      <SiteFooter />
    </main>
  )
}
