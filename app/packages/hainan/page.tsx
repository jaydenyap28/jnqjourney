import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import HainanPackagesHub from '@/components/HainanPackagesHub'
import SiteFooter from '@/components/SiteFooter'
import { absoluteUrl } from '@/lib/site'
import { readPublishedPackagesUncached } from '@/lib/server/travel-packages'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: '海南岛旅游配套｜4天3夜 / 5天4夜比较',
  description: '比较 JnQ Journey 海南 4天3夜与 5天4夜旅游配套的价格、行程、住宿、行李与重点体验。',
  alternates: { canonical: '/packages/hainan' },
}

export default async function HainanPackagesPage() {
  const packages = (await readPublishedPackagesUncached()).filter((item) => item.slug.startsWith('hainan-'))
  if (!packages.length) notFound()

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: '海南岛旅游配套',
      description: '比较 JnQ Journey 海南 4天3夜与 5天4夜旅游配套。',
      url: absoluteUrl('/packages/hainan'),
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: packages.map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: item.title_zh,
          url: absoluteUrl(`/packages/hainan/${item.slug.replace(/^hainan-/, '')}`),
        })),
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'JnQ Journey', item: absoluteUrl('/') },
        { '@type': 'ListItem', position: 2, name: '旅游配套', item: absoluteUrl('/packages') },
        { '@type': 'ListItem', position: 3, name: '海南岛旅游配套', item: absoluteUrl('/packages/hainan') },
      ],
    },
  ]

  return (
    <>
      {jsonLd.map((data, index) => <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />)}
      <HainanPackagesHub packages={packages} />
      <SiteFooter />
    </>
  )
}
