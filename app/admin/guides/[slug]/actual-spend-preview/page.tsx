import type { Metadata } from 'next'

import AdminReviewedActualSpendPreview from '@/components/AdminReviewedActualSpendPreview'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Reviewed actual-spend preview',
  robots: { index: false, follow: false, nocache: true },
}

export default async function ReviewedActualSpendPreviewPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white md:px-8 md:py-12">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 border-b border-white/10 pb-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-200/70">Admin only / Reviewed snapshot</p>
          <h1 className="mt-2 font-display text-3xl leading-none text-white md:text-4xl">实际支出预览</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/58">此页面仅用于后台审核；未发布的实际支出不会写入公开 Guide。</p>
        </header>
        <AdminReviewedActualSpendPreview guideSlug={slug} />
      </div>
    </main>
  )
}
