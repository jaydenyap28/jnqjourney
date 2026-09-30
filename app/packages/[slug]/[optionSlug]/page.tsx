import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import BatamPackageOptionDetail from '@/components/BatamPackageOptionDetail'
import PackageViewTracker from '@/components/PackageViewTracker'
import SiteFooter from '@/components/SiteFooter'
import WhatsAppFloatingButton from '@/components/WhatsAppFloatingButton'
import { absoluteUrl } from '@/lib/site'
import { readPublishedPackage, readPublishedPackageOption } from '@/lib/server/travel-packages'

export const revalidate = 3600

const LEGACY_BATAM_OPTION_SLUGS: Record<string, string> = {
  'value-499': 'amazing-promo-499',
  'new-classic-599': 'new-version-599',
}

function resolveOptionSlug(slug: string) {
  return LEGACY_BATAM_OPTION_SLUGS[slug] || slug
}

export async function generateMetadata({ params }: { params: { slug: string; optionSlug: string } }): Promise<Metadata> {
  const item = await readPublishedPackage(params.slug)
  if (!item || item.slug !== 'batam-3d2n') notFound()
  const option = await readPublishedPackageOption(item.id, resolveOptionSlug(params.optionSlug))
  if (!option) notFound()

  const title = `${option.name_zh}｜巴淡岛3天2夜配套｜JnQ Journey`
  const description = option.short_description || `${option.name_zh} 巴淡岛3天2夜配套详情、价格、住宿、行程与包含项目。`
  const canonical = `/packages/${item.slug}/${option.slug}`

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, images: item.cover_image ? [item.cover_image] : undefined },
    twitter: { card: 'summary_large_image', title, description, images: item.cover_image ? [item.cover_image] : undefined },
  }
}

export default async function BatamOptionPage({ params }: { params: { slug: string; optionSlug: string } }) {
  const item = await readPublishedPackage(params.slug)
  if (!item || item.slug !== 'batam-3d2n') notFound()
  const resolvedOptionSlug = resolveOptionSlug(params.optionSlug)
  const option = await readPublishedPackageOption(item.id, resolvedOptionSlug)
  if (!option) notFound()
  if (resolvedOptionSlug !== params.optionSlug) redirect(`/packages/${item.slug}/${resolvedOptionSlug}`)

  const canonicalPath = `/packages/${item.slug}/${option.slug}`
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: option.name_zh,
      description: option.short_description,
      url: absoluteUrl(canonicalPath),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'TouristTrip',
      name: option.name_zh,
      description: option.short_description,
      url: absoluteUrl(canonicalPath),
      touristType: option.suitable_for || undefined,
      offers: option.price_from ? {
        '@type': 'Offer',
        priceCurrency: option.price_currency || 'MYR',
        price: Number(option.price_from),
        url: absoluteUrl(canonicalPath),
      } : undefined,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'JnQ Journey', item: absoluteUrl('/') },
        { '@type': 'ListItem', position: 2, name: '旅游配套', item: absoluteUrl('/packages') },
        { '@type': 'ListItem', position: 3, name: item.title_zh, item: absoluteUrl(`/packages/${item.slug}`) },
        { '@type': 'ListItem', position: 4, name: option.name_zh, item: absoluteUrl(canonicalPath) },
      ],
    },
  ]

  return (
    <>
      <PackageViewTracker packageId={item.id} packageName={`${item.title_zh}｜${option.name_zh}`} sourceCode={option.source_code || item.source_code} />
      {jsonLd.map((data, index) => <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />)}
      <BatamPackageOptionDetail item={item} option={option} />
      <WhatsAppFloatingButton
        pageType="package"
        packageName={item.title_zh}
        packageId={item.id}
        source={`${option.source_code || item.source_code || `JNQ-PACKAGE-${item.id}`}-FLOATING`}
        message={option.whatsapp_message || item.whatsapp_message || undefined}
      />
      <SiteFooter />
    </>
  )
}
