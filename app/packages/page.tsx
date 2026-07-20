import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, MapPinned } from 'lucide-react'

import FallbackImage from '@/components/FallbackImage'
import SiteFooter from '@/components/SiteFooter'
import WhatsAppButton from '@/components/WhatsAppButton'
import { readPublishedPackages } from '@/lib/server/travel-packages'

export const revalidate = 600
export const metadata: Metadata = {
  title: '旅游配套',
  description: '查看 JnQ Journey 已发布的旅游配套，并通过 WhatsApp 查询日期与最新价格。',
  alternates: { canonical: '/packages' },
}

export default async function PackagesPage() {
  const packages = await readPublishedPackages()
  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <section className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <p className="text-xs uppercase text-amber-200/70">Travel packages / 旅游配套</p>
        <h1 className="mt-3 text-4xl font-semibold md:text-6xl">从真实旅行内容，走到可以出发的安排。</h1>
        <p className="mt-5 max-w-3xl leading-8 text-white/65">这里仅显示资料已完成并正式发布的配套。价格与可出发日期以 WhatsApp 最新确认为准。</p>

        {packages.length ? (
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {packages.map((item) => (
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
          </div>
        ) : (
          <div className="mt-12 rounded-2xl border border-white/10 bg-white/5 p-6">
            <p className="font-semibold">配套资料正在整理中</p>
            <p className="mt-2 text-sm leading-7 text-white/60">在行程、包含项目和照片确认之前，我们不会公开不完整的配套页面。</p>
          </div>
        )}
      </section>
      <SiteFooter />
    </main>
  )
}
