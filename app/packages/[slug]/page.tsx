import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import PackageViewTracker from '@/components/PackageViewTracker'
import SiteFooter from '@/components/SiteFooter'
import TravelPackageDetail from '@/components/TravelPackageDetail'
import { absoluteUrl } from '@/lib/site'
import { readPublishedPackage } from '@/lib/server/travel-packages'

export const revalidate = 600

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const item = await readPublishedPackage(params.slug)
  if (!item) notFound()
  const title = item.seo_title || item.title_zh
  const description = item.seo_description || item.short_description || 'JnQ Journey 旅游配套详情。'
  const canonical = item.canonical_url || `/packages/${item.slug}`
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, images: item.cover_image ? [item.cover_image] : undefined },
    twitter: { card: 'summary_large_image', title, description, images: item.cover_image ? [item.cover_image] : undefined },
  }
}

export default async function PackagePage({ params }: { params: { slug: string } }) {
  const item = await readPublishedPackage(params.slug)
  if (!item) notFound()
  const canonicalPath = item.canonical_url || `/packages/${item.slug}`
  const jsonLd = [
    { '@context': 'https://schema.org', '@type': 'WebPage', name: item.title_zh, description: item.short_description, url: absoluteUrl(canonicalPath), primaryImageOfPage: item.cover_image ? { '@type': 'ImageObject', url: item.cover_image } : undefined },
    { '@context': 'https://schema.org', '@type': 'TouristTrip', name: item.title_zh, description: item.short_description, image: item.cover_image || undefined, url: absoluteUrl(canonicalPath), touristType: item.suitable_for || undefined },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'JnQ Journey', item: absoluteUrl('/') },
      { '@type': 'ListItem', position: 2, name: '旅游配套', item: absoluteUrl('/packages') },
      { '@type': 'ListItem', position: 3, name: item.title_zh, item: absoluteUrl(canonicalPath) },
    ] },
  ]

  return (
    <>
      <PackageViewTracker packageId={item.id} packageName={item.title_zh} sourceCode={item.source_code} />
      {jsonLd.map((data, index) => <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />)}
      <TravelPackageDetail item={item} />
      <SiteFooter />
    </>
  )
}
