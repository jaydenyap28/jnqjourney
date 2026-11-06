import { spotSeo } from '@/lib/spot-content'
import { relatedGuidesForSpot, relatedPackagesForSpot } from '@/lib/spot-relations'
import { spotDescriptionExcerpt } from '@/lib/spot-description'
import { notesForSpot, toRelatedNoteCard } from '@/lib/content-relations'
import type { Metadata } from 'next'
import { chineseLocalizedAlternates } from '@/lib/server/localized-seo'
import { notFound, redirect } from 'next/navigation'
import SpotPageView from '@/components/SpotPageView'
import { buildPublicCanonicalLocationPath } from '@/lib/server/location-slugs-store'
import { fetchRelatedLocations } from '@/lib/server/public-location-data'
import { getPublicSpotBySlug } from '@/lib/server/public-spot-resolver'
import { readPublicGuides, readPublicNotes } from '@/lib/server/public-content-store'
import { absoluteUrl } from '@/lib/site'
import { buildRegionPath } from '@/lib/region-routing'
import { formatOpeningHoursDisplay } from '@/lib/opening-hours'
import { buildOpenGraphData, buildTwitterCardData } from '@/lib/seo'
import { readPublishedPackages } from '@/lib/server/travel-packages'

export const revalidate = 600
export const dynamic = 'force-static'

interface PageProps {
  params: {
    slug: string
  }
}

function getCoverImage(location: { image_url?: string | null; images?: string[] | null }) {
  return location.image_url || location.images?.[0] || null
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolved = await getPublicSpotBySlug(params.slug)
  const location = resolved?.spot

  if (!location) {
    notFound()
  }

  const { title: seoTitle, description } = spotSeo(location, 'zh')
  const canonicalPath = await buildPublicCanonicalLocationPath(location.name, location.id)
  const coverImage = getCoverImage(location)

  return {
    title: { absolute: seoTitle },
    description,
    alternates: await chineseLocalizedAlternates(canonicalPath, 'spot', location.id, {...location,title:location.name}),
    openGraph: buildOpenGraphData(seoTitle, description, canonicalPath, coverImage, 'article'),
    twitter: buildTwitterCardData(seoTitle, description, coverImage),
    robots: resolved.quality.indexable && resolved.source !== 'static-fallback'
      ? { index: true, follow: true }
      : { index: false, follow: true, googleBot: { index: false, follow: true } },
  }
}

export default async function SpotPage({ params }: PageProps) {
  const resolved = await getPublicSpotBySlug(params.slug)
  const location = resolved?.spot

  if (!location) {
    notFound()
  }

  const canonicalPath = await buildPublicCanonicalLocationPath(location.name, location.id)
  if (params.slug !== canonicalPath.replace('/spot/', '')) {
    redirect(canonicalPath)
  }

  const [relatedLocations, allGuides, allPackages, allNotes] = await Promise.all([
    fetchRelatedLocations(location, 6),
    readPublicGuides(),
    readPublishedPackages(),
    readPublicNotes(),
  ])
  const relatedGuides = relatedGuidesForSpot(location, allGuides).map(({ slug, title, shortTitle, duration }) => ({ slug, title, shortTitle, duration }))
  const relatedPackages = relatedPackagesForSpot(location, allPackages, relatedGuides.map(guide => guide.slug))

  const baseType = location.category === 'food' ? 'Restaurant' : location.category === 'accommodation' ? 'Hotel' : 'TouristAttraction'
  const structuredData: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': baseType,
    name: location.name_cn || location.name,
    alternateName: location.name_cn ? location.name : undefined,
    description: spotDescriptionExcerpt(location.description || location.review) || undefined,
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
    <SpotPageView location={location} relatedNotes={notesForSpot(location, allNotes).map(toRelatedNoteCard)} relatedLocations={relatedLocations} relatedGuides={relatedGuides} relatedPackages={relatedPackages} dataSource={resolved.source}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbData).replace(/</g, '\\u003c') }} />

    </SpotPageView>
  )
}
