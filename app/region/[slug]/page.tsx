import { resolveEntityDisplayName } from '@/lib/entity-display-name'
import { chineseLocalizedAlternates } from '@/lib/server/localized-seo'
import EntityName from '@/components/EntityName'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import FallbackImage from '@/components/FallbackImage'
import { Route } from 'lucide-react'
import SiteFooter from '@/components/SiteFooter'
import { Badge } from '@/components/ui/badge'
import { getDisplayTitle, getSpotDescription } from '@/lib/content-display'
import { buildLocationPath } from '@/lib/location-routing'
import { buildRegionPath } from '@/lib/region-routing'
import { fetchLocationsByRegion, fetchRegionBySlug } from '@/lib/server/public-location-data'
import { readPublicGuides } from '@/lib/server/public-content-store'
import { absoluteUrl } from '@/lib/site'
import { getVisibleLocationTags } from '@/lib/tag-utils'
import TravelPackageCard from '@/components/TravelPackageCard'
import TiomanPackageComparison from '@/components/TiomanPackageComparison'
import { readPublishedPackages } from '@/lib/server/travel-packages'

import { buildCanonicalUrl, buildOpenGraphData, buildTwitterCardData } from '@/lib/seo'


import RegionPageView from '@/components/RegionPageView'
export const revalidate=3600
interface PageProps {
  params: {
    slug: string
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const region = await fetchRegionBySlug(params.slug)

  if (!region) {
    return {
      title: 'Region not found',
    }
  }

  const readableName = resolveEntityDisplayName(region).primary
  const seoTitle = `${readableName} Travel Guide - Spots, Food, Stays and Routes`
  const description = `Explore ${readableName} with JnQ Journey: travel spots, food finds, stays, route ideas, maps, photos, and practical notes for planning your trip.`
  
  const canonicalPath = buildRegionPath(region.name, region.id)
  const canonicalUrl = buildCanonicalUrl(canonicalPath)

  return {
    title: seoTitle,
    description,
    alternates: await chineseLocalizedAlternates(canonicalPath, 'region', region.id, {shortSummary:region.description}),
    openGraph: buildOpenGraphData(seoTitle, description, canonicalPath, region.image_url, 'website'),
    twitter: buildTwitterCardData(seoTitle, description, region.image_url),
  }
}
export default async function RegionPage({params}:PageProps) {
 const region=await fetchRegionBySlug(params.slug);if(!region) notFound();
 const [locations,packages,allGuides]=await Promise.all([fetchLocationsByRegion(region.id,100),readPublishedPackages(),readPublicGuides()]);
 return <RegionPageView region={region} locations={locations} relatedPackages={packages.filter(p=>p.region_id===region.id)} allGuides={allGuides}/>
}
