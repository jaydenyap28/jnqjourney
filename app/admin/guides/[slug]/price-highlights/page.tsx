import type { Metadata } from 'next'

import AdminGuidePriceHighlightsReview from '@/components/AdminGuidePriceHighlightsReview'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Guide price highlights review',
  robots: { index: false, follow: false, nocache: true },
}

export default async function GuidePriceHighlightsReviewPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white md:px-8 md:py-12">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 border-b border-white/10 pb-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-200/70">
            Admin only / Price evidence
          </p>
          <h1 className="mt-2 font-display text-3xl leading-none text-white md:text-5xl">
            重点价格审核
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/58">
            核对金额、单位、日期、来源与冲突。只有明确批准且字段完整的记录才会进入公开 Guide。
          </p>
        </header>

        <AdminGuidePriceHighlightsReview guideSlug={slug} />
      </div>
    </main>
  )
}
