import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import SiteFooter from '@/components/SiteFooter'
import SpotContent from '@/components/SpotContent'
import { buildCanonicalLocationPath } from '@/lib/server/location-slugs-store'
import { fetchLocationBySlug, fetchRelatedLocations } from '@/lib/server/public-location-data'
import { getActiveKlookWidgetsForTargets } from '@/lib/server/klook-widgets-store'
import { absoluteUrl } from '@/lib/site'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface PageProps {
  params: {
    slug: string
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const location = await fetchLocationBySlug(params.slug)

  if (!location) {
    return {
      title: '景点不存在 | JnQ Journey',
    }
  }

  const readableName = location.name_cn ? `${location.name_cn} / ${location.name}` : location.name
  const categoryLabel =
    location.category === 'food' ? '美食' : location.category === 'accommodation' ? '住宿' : '景点'
  const description =
    location.description ||
    location.review ||
    `${readableName} 的${categoryLabel}资料、地图位置、图片和导航信息。`

  const canonicalPath = await buildCanonicalLocationPath(location.name, location.id)
  const coverImage = location.image_url || location.images?.[0] || null

  return {
    title: readableName,
    description: String(description).slice(0, 160),
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      type: 'article',
      title: readableName,
      description: String(description).slice(0, 160),
      url: absoluteUrl(canonicalPath),
      images: coverImage ? [{ url: coverImage }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: readableName,
      description: String(description).slice(0, 160),
      images: coverImage ? [coverImage] : undefined,
    },
  }
}

export default async function SpotPage({ params }: PageProps) {
  const location = await fetchLocationBySlug(params.slug)

  if (!location) {
    notFound()
  }

  const canonicalPath = await buildCanonicalLocationPath(location.name, location.id)
  if (params.slug !== canonicalPath.replace('/spot/', '')) {
    redirect(canonicalPath)
  }

  const relatedLocations = await fetchRelatedLocations(location, 6)
  const klookWidgets = await getActiveKlookWidgetsForTargets({
    locationId: location.id,
    regionId: location.region_id,
  })
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': location.category === 'food' ? 'Restaurant' : location.category === 'accommodation' ? 'Hotel' : 'TouristAttraction',
    name: location.name,
    alternateName: location.name_cn || undefined,
    description: location.description || location.review || undefined,
    image: location.image_url || location.images || undefined,
    url: absoluteUrl(canonicalPath),
    address: location.address || undefined,
    geo: {
      '@type': 'GeoCoordinates',
      latitude: location.latitude,
      longitude: location.longitude,
    },
    touristType: location.tags || undefined,
    isAccessibleForFree: true,
    inLanguage: ['zh-CN', 'en'],
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.15),transparent_22%),linear-gradient(180deg,#111827_0%,#020617_48%,#000000_100%)] text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <SpotContent location={location} mode="page" relatedLocations={relatedLocations} externalKlookWidgets={klookWidgets} />
      <SiteFooter />
    </main>
  )
}
