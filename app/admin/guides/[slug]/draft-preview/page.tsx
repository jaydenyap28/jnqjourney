import type { Metadata } from 'next'

import AdminGuideDraftPreview from '@/components/AdminGuideDraftPreview'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Guide draft preview', robots: { index: false, follow: false, nocache: true } }

export default async function GuideDraftPreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <AdminGuideDraftPreview guideSlug={slug} />
}
