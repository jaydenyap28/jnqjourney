import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import HainanPackageDetail from '@/components/HainanPackageDetail'
import PackageViewTracker from '@/components/PackageViewTracker'
import SiteFooter from '@/components/SiteFooter'
import { absoluteUrl } from '@/lib/site'
import { packageFromOption, readPublishedPackage, readPublishedPackageOption } from '@/lib/server/travel-packages'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function packageSlug(optionSlug: string) {
  return `hainan-${optionSlug}`
}

async function readHainanOption(optionSlug: string) {
  const parent = await readPublishedPackage('hainan')
  if (parent) {
    const option = await readPublishedPackageOption(parent.id, optionSlug)
    if (option) return packageFromOption(parent, option)
  }
  return readPublishedPackage(packageSlug(optionSlug))
}

export async function generateMetadata({ params }: { params: { optionSlug: string } }): Promise<Metadata> {
  const item = await readHainanOption(params.optionSlug)
  if (!item) notFound()

  const title = item.seo_title || item.title_zh
  const description = item.seo_description || item.short_description || 'JnQ Journey 海南岛旅游配套详情。'
  const canonical = `/packages/hainan/${params.optionSlug}`

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, images: item.cover_image ? [item.cover_image] : undefined },
    twitter: { card: 'summary_large_image', title, description, images: item.cover_image ? [item.cover_image] : undefined },
  }
}

export default async function HainanOptionPage({ params }: { params: { optionSlug: string } }) {
  const item = await readHainanOption(params.optionSlug)
  if (!item) notFound()

  const canonicalPath = `/packages/hainan/${params.optionSlug}`
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: item.title_zh,
      description: item.short_description,
      url: absoluteUrl(canonicalPath),
      primaryImageOfPage: item.cover_image ? { '@type': 'ImageObject', url: item.cover_image } : undefined,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'TouristTrip',
      name: item.title_zh,
      description: item.short_description,
      image: item.cover_image || undefined,
      url: absoluteUrl(canonicalPath),
      touristType: item.suitable_for || undefined,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'JnQ Journey', item: absoluteUrl('/') },
        { '@type': 'ListItem', position: 2, name: '旅游配套', item: absoluteUrl('/packages') },
        { '@type': 'ListItem', position: 3, name: '海南岛旅游配套', item: absoluteUrl('/packages/hainan') },
        { '@type': 'ListItem', position: 4, name: item.title_zh, item: absoluteUrl(canonicalPath) },
      ],
    },
  ]

  return (
    <>
      <PackageViewTracker packageId={item.id} packageName={item.title_zh} sourceCode={item.source_code} />
      {jsonLd.map((data, index) => (
        <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
      ))}
      <HainanPackageDetail item={item} />
      <SiteFooter />
    </>
  )
}
