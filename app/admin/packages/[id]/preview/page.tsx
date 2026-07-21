import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import AdminPackagePreviewClient from '@/components/AdminPackagePreviewClient'

export const metadata: Metadata = {
  title: '旅游配套草稿预览',
  robots: { index: false, follow: false, nocache: true },
}

export default function AdminPackagePreviewPage({ params }: { params: { id: string } }) {
  const packageId = Number(params.id)
  if (!Number.isInteger(packageId) || packageId <= 0) notFound()
  return <AdminPackagePreviewClient packageId={packageId} />
}
