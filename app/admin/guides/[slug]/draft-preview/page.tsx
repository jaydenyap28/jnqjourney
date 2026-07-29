import type { Metadata } from 'next'

import AdminGuideDraftPreview from '@/components/AdminGuideDraftPreview'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Guide draft preview', robots: { index: false, follow: false, nocache: true } }

export default async function GuideDraftPreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <main className="min-h-screen bg-[#050816] px-4 py-8 text-white md:px-8 md:py-12"><div className="mx-auto max-w-6xl"><AdminGuideDraftPreview guideSlug={slug} /></div></main>
}
