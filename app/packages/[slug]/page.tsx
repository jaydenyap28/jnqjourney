import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'

import PackageViewTracker from '@/components/PackageViewTracker'
import SiteFooter from '@/components/SiteFooter'
import TravelPackageDetail from '@/components/TravelPackageDetail'
import TiomanPackageDetail from '@/components/TiomanPackageDetail'
import WhatsAppFloatingButton from '@/components/WhatsAppFloatingButton'
import { absoluteUrl } from '@/lib/site'
import { readPublishedPackage, readPublishedPackageOptions } from '@/lib/server/travel-packages'
import { packageCanonicalUrl } from '@/lib/package-presentation'
import { packageRelatedLinks } from '@/lib/server/package-relations'

export const revalidate = 3600

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const item = await readPublishedPackage(params.slug)
  if (!item) notFound()
  const title = item.seo_title || item.title_zh
  const description = item.seo_description || item.short_description || 'JnQ Journey 旅游配套详情。'
  const canonical = packageCanonicalUrl(item,absoluteUrl('/'))
  return {
    title: {absolute:title.includes('JnQ Journey')?title:`${title} | JnQ Journey`},
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, images: item.cover_image ? [item.cover_image] : undefined },
    twitter: { card: 'summary_large_image', title, description, images: item.cover_image ? [item.cover_image] : undefined },
  }
}

export default async function PackagePage({ params }: { params: { slug: string } }) {
  const item = await readPublishedPackage(params.slug)
  if (!item) notFound()
  const [options,relatedLinks] = await Promise.all([readPublishedPackageOptions(item.id),packageRelatedLinks(item)])
  const canonicalPath = packageCanonicalUrl(item,absoluteUrl('/'))
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
      {jsonLd.map((data, index) => <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g,'\\u003c') }} />)}
      {item.slug === 'tioman-3d2n' ? <TiomanPackageDetail item={item} options={options} /> : <TravelPackageDetail item={item} options={options} />}
      {relatedLinks.length ? <section className="bg-[#050816] px-5 py-10 text-white" aria-label="相关旅行资讯"><div className="mx-auto max-w-6xl"><h2 className="text-2xl font-semibold">继续了解行程与目的地</h2><ul className="mt-5 grid gap-3 md:grid-cols-2">{relatedLinks.map(link=><li key={link.href}><Link className="inline-flex min-h-11 items-center break-words underline" href={link.href}>{link.title}</Link></li>)}</ul></div></section> : null}
      <WhatsAppFloatingButton
        pageType="package"
        packageName={item.title_zh}
        packageId={item.id}
        source={`${item.source_code || `JNQ-PACKAGE-${item.id}`}-FLOATING`}
        message={item.whatsapp_message || undefined}
      />
      <SiteFooter />
    </>
  )
}
