import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import SiteFooter from '@/components/SiteFooter'
import SpotContent from '@/components/SpotContent'
import { buildCanonicalLocationPath } from '@/lib/server/location-slugs-store'
import { fetchLocationBySlug, fetchRelatedLocations } from '@/lib/server/public-location-data'
import { readGuides } from '@/lib/server/guides-store'
import { absoluteUrl } from '@/lib/site'
import { buildRegionPath } from '@/lib/region-routing'
import { formatOpeningHoursDisplay } from '@/lib/opening-hours'
import { buildCanonicalUrl, buildMetaDescription, buildOpenGraphData, buildPageTitle, buildTwitterCardData } from '@/lib/seo'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface PageProps {
  params: {
    slug: string
  }
}

function normalizeGuideMatch(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function getCoverImage(location: { image_url?: string | null; images?: string[] | null }) {
  return location.image_url || location.images?.[0] || null
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const location = await fetchLocationBySlug(params.slug)

  if (!location) {
    return {
      title: buildPageTitle('Spot not found'),
    }
  }

  const regionName = location.regions?.name_cn || location.regions?.name || ''
  const readableName = location.name_cn ? `${location.name_cn} / ${location.name}` : location.name
  const categoryLabel =
    location.category === 'food' ? 'food spot' : location.category === 'accommodation' ? 'stay' : 'travel spot'
  const seoTitle = regionName ? `${readableName} in ${regionName} - ${categoryLabel} guide` : `${readableName} ${categoryLabel} guide`
  const fallbackDesc = `Plan your visit to ${readableName}${regionName ? ` in ${regionName}` : ''} with photos, address, map location, opening hours, travel notes, and booking references from JnQ Journey.`
  const description = buildMetaDescription(location.description || location.review, fallbackDesc)
  const canonicalPath = await buildCanonicalLocationPath(location.name, location.id)
  const coverImage = getCoverImage(location)

  return {
    title: seoTitle,
    description,
    alternates: {
      canonical: buildCanonicalUrl(canonicalPath),
    },
    openGraph: buildOpenGraphData(seoTitle, description, canonicalPath, coverImage, 'article'),
    twitter: buildTwitterCardData(seoTitle, description, coverImage),
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

  const [relatedLocations, allGuides] = await Promise.all([
    fetchRelatedLocations(location, 6),
    readGuides(),
  ])

  const locationNames = new Set([
    normalizeGuideMatch(location.name),
    normalizeGuideMatch(location.name_cn),
  ].filter(Boolean))
  const relatedGuides = allGuides
    .filter((guide) => {
      const guideNames = new Set(
        [
          ...guide.route.map((item) => item.mapSpotName || item.name),
          ...(guide.featuredSpotNames || []),
          ...guide.days.flatMap((day) => day.linkedSpots || []),
        ]
          .map(normalizeGuideMatch)
          .filter(Boolean)
      )
      for (const name of locationNames) {
        if (guideNames.has(name)) return true
      }
      return false
    })
    .slice(0, 3)
    .map((guide) => ({
      slug: guide.slug,
      title: guide.title,
      shortTitle: guide.shortTitle,
      duration: guide.duration,
    }))

  const baseType = location.category === 'food' ? 'Restaurant' : location.category === 'accommodation' ? 'Hotel' : 'TouristAttraction'
  const structuredData: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': baseType,
    name: location.name_cn || location.name,
    alternateName: location.name_cn ? location.name : undefined,
    description: location.description || location.review || undefined,
    image: getCoverImage(location) || undefined,
    url: absoluteUrl(canonicalPath),
  }

  if (location.address) structuredData.address = location.address
  if (location.latitude && location.longitude) {
    structuredData.geo = {
      '@type': 'GeoCoordinates',
      latitude: location.latitude,
      longitude: location.longitude,
    }
  }

  const openingHours = formatOpeningHoursDisplay(location.opening_hours)
  if (openingHours.visible) {
    structuredData.openingHoursSpecification = {
      '@type': 'OpeningHoursSpecification',
      description: openingHours.plainText,
    }
  }

  const sameAsLinks = [location.facebook_video_url, location.video_url].filter(Boolean)
  if (sameAsLinks.length > 0) {
    structuredData.sameAs = sameAsLinks
  }

  const regionPath = location.regions?.id && location.regions?.name ? buildRegionPath(location.regions.name, location.regions.id) : null
  const breadcrumbData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: absoluteUrl('/'),
      },
      ...(regionPath ? [{
        '@type': 'ListItem',
        position: 2,
        name: location.regions?.name_cn || location.regions?.name || 'Region',
        item: absoluteUrl(regionPath),
      }] : []),
      {
        '@type': 'ListItem',
        position: regionPath ? 3 : 2,
        name: location.name_cn || location.name,
        item: absoluteUrl(canonicalPath),
      },
    ],
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.15),transparent_22%),linear-gradient(180deg,#111827_0%,#020617_48%,#000000_100%)] text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbData) }} />
      <SpotContent
        location={location}
        mode="page"
        relatedLocations={relatedLocations}
        relatedGuides={relatedGuides}
      />
      <SiteFooter />
    </main>
  )
}
