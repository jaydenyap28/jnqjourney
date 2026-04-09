import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowRight, CalendarDays, Wallet } from 'lucide-react'
import SiteFooter from '@/components/SiteFooter'
import { readGuides } from '@/lib/server/guides-store'

export const metadata: Metadata = {
  title: '完整旅程攻略 | JnQ Journey',
  description: '浏览 Jayden & Qing 一起看世界的完整旅程路线、预算拆解与自由行攻略。',
  alternates: {
    canonical: '/guide',
  },
  openGraph: {
    title: '完整旅程攻略 | JnQ Journey',
    description: '浏览 Jayden & Qing 一起看世界的完整旅程路线、预算拆解与自由行攻略。',
    url: '/guide',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '完整旅程攻略 | JnQ Journey',
    description: '浏览 Jayden & Qing 一起看世界的完整旅程路线、预算拆解与自由行攻略。',
  },
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function GuideIndexPage() {
  const guides = await readGuides()

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.12),transparent_20%),linear-gradient(180deg,#0f172a_0%,#020617_45%,#000000_100%)] text-white">
      <div className="mx-auto max-w-7xl px-4 py-10 md:px-8 md:py-12">
        <div className="rounded-[32px] border border-white/10 bg-white/5 p-6 md:p-8">
          <p className="section-kicker text-xs text-amber-300/80">Travel Guides</p>
          <h1 className="font-display mt-4 text-5xl leading-none text-white md:text-6xl">完整旅程攻略</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-gray-300 md:text-base">
            不只是单个景点，而是一整趟路线。这里会把天数、预算、交通、住宿和每日安排串起来，也会逐步把攻略里的重点景点连到你已经整理好的独立景点页。
          </p>
        </div>

        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          {guides.map((guide) => (
            <Link
              key={guide.slug}
              href={`/guide/${guide.slug}`}
              className="group overflow-hidden rounded-[32px] border border-white/10 bg-white/5 transition hover:-translate-y-1 hover:bg-white/10"
            >
              <div className={`relative overflow-hidden p-6 md:p-8 ${guide.coverAccent}`}>
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
                <div className="relative z-10">
                  <p className="text-sm uppercase tracking-[0.28em] text-amber-100/80">{guide.travelStyle}</p>
                  <h2 className="font-display mt-4 text-4xl leading-none text-white md:text-5xl">{guide.shortTitle}</h2>
                  <p className="mt-4 max-w-xl text-sm leading-7 text-white/78 md:text-base">{guide.tagline}</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {guide.highlightTags.slice(0, 4).map((tag) => (
                      <span key={tag} className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-white/90">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid gap-4 p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <div>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-white/70">
                    <span className="inline-flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-amber-200" />
                      {guide.duration}
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-amber-200" />
                      {guide.budget}
                    </span>
                  </div>
                  <p className="mt-4 text-sm leading-7 text-gray-300">{guide.summary}</p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition group-hover:bg-amber-50">
                  打开攻略
                  <ArrowRight className="h-4 w-4" />
                </div>
              </div>
            </Link>
          ))}
        </section>
      </div>

      <SiteFooter />
    </main>
  )
}
