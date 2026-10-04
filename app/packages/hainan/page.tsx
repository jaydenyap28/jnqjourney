import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import HainanPackagesHub from '@/components/HainanPackagesHub'
import SiteFooter from '@/components/SiteFooter'
import { readPublishedPackagesUncached } from '@/lib/server/travel-packages'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: '海南旅游配套｜4天3夜 / 5天4夜比较',
  description: '比较 JnQ Journey 海南 4天3夜与 5天4夜旅游配套的价格、行程、住宿、行李与重点体验。',
  alternates: { canonical: '/packages/hainan' },
}

export default async function HainanPackagesPage() {
  const packages = (await readPublishedPackagesUncached()).filter((item) => item.slug.startsWith('hainan-'))
  if (!packages.length) notFound()

  return (
    <>
      <HainanPackagesHub packages={packages} />
      <SiteFooter />
    </>
  )
}
