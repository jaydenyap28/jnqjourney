import EntityName from '@/components/EntityName'
import { chineseLocalizedAlternates } from '@/lib/server/localized-seo'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { ArrowRight, BedDouble, CalendarDays, Film, MapPin, MapPinned, Navigation } from 'lucide-react'
import SiteFooter from '@/components/SiteFooter'
import FallbackImage from '@/components/FallbackImage'
import GuideRouteMap from '@/components/GuideRouteMap'
import GuideQuickNav from '@/components/GuideQuickNav'
import GuideSegmentItinerarySection from '@/components/GuideSegmentItinerarySection'
import GuideUnassignedVisits from '@/components/GuideUnassignedVisits'
import GuideDayStayCard from '@/components/GuideDayStayCard'
import GuideVideoCard from '@/components/GuideVideoCard'
import GuideGallery from '@/components/GuideGallery'
import GuideTripCost from '@/components/GuideTripCost'
import GuidePriceHighlightsSection, { GuideDayCostNote, GuideSpotPriceHighlights } from '@/components/GuidePriceHighlightsSection'
import AffiliateCard from '@/components/AffiliateCard'
import KlookWidgetEmbed from '@/components/KlookWidgetEmbed'
import SupportSidebarCard from '@/components/SupportSidebarCard'
import AuthorTrustBlock from '@/components/AuthorTrustBlock'
import TravelPackageCard from '@/components/TravelPackageCard'
import { readPublicGuideBySlug, readPublicGuides } from '@/lib/server/public-content-store'
import { readPublicGuideTripCost } from '@/lib/server/public-guide-trip-cost'
import { readApprovedGuidePriceHighlights } from '@/lib/server/guide-price-highlights-store'
import { readPublishedPackages } from '@/lib/server/travel-packages'
import { formatGuideBudgetCents } from '@/lib/guide-budget'
import { attractionIdFromPriceSlug, isGuideDayCostPriceHighlight, matchesAttractionPriceHighlight } from '@/lib/guide-price-highlights'
import { absoluteUrl } from '@/lib/site'
import { buildLocationPath } from '@/lib/location-routing'
import { buildRegionPath } from '@/lib/region-routing'
import { guideAttractionMap, resolveGuideAttraction, type GuideSegmentSpot } from '@/lib/guide-segment-spots'
import { attractionKey, orderedGuideAttractions } from '@/lib/guide-attractions'
import { guideAttractionDisplayName } from '@/lib/guide-attraction-display'
import { resolveGuideMedia } from '@/lib/guide-media'
import { formatShortText } from '@/lib/short-text'
import { resolvePublicImage } from '@/lib/public-media'
import { resolvePublicData } from '@/lib/server/public-data-resolver'
import { resolveGuidePublicMedia, selectPublicSpotCards } from '@/lib/server/public-content-media'


import GuidePageView from '@/components/GuidePageView'
import { buildPageTitle, buildMetaDescription, buildCanonicalUrl, buildOpenGraphData, buildTwitterCardData } from '@/lib/seo'
export const revalidate=600
interface PageProps {
  params: {
    slug: string
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const [storedGuide, { locations }] = await Promise.all([readPublicGuideBySlug(params.slug), resolvePublicData()])
  const guide = storedGuide ? resolveGuidePublicMedia(storedGuide, locations) : null

  if (!guide) {
    return {
      title: buildPageTitle('Guide not found'),
    }
  }

  const daysText = guide.duration ? `${guide.duration}` : ''
  const hasBudgetOrStay = guide.budget || guide.days.some(d => d.stay)
  const baseTitle = `${guide.title}${daysText ? ` (${daysText})` : ''} Travel Guide`

  const description = buildMetaDescription(
    guide.summary || guide.tagline || guide.title, 
    `Plan ${guide.title} with a day-by-day route, linked spots, transport notes${hasBudgetOrStay ? ', stays, budget references' : ''}, photos, and practical travel details from JnQ Journey.`
  )
  const canonicalUrl = buildCanonicalUrl(`/guide/${guide.slug}`)
  const guideMedia = resolveGuideMedia(guide)

  return {
    title: baseTitle,
    description,
    alternates: await chineseLocalizedAlternates(`/guide/${guide.slug}`, 'guide', guide.slug, guide),
    openGraph: buildOpenGraphData(baseTitle, description, `/guide/${guide.slug}`, guideMedia.coverImage, 'article'),
    twitter: buildTwitterCardData(baseTitle, description, guideMedia.coverImage),
  }
}

export default async function GuideDetailPage({params}:PageProps) {
 const [storedGuide,publicData]=await Promise.all([readPublicGuideBySlug(params.slug),resolvePublicData()]);
 const guide=storedGuide?resolveGuidePublicMedia(storedGuide,publicData.locations):null;
 if(!guide) notFound();
 if(params.slug!==guide.slug) redirect(`/guide/${guide.slug}`);
 const [publicTripCost,approvedPriceHighlights,packages,guides]=await Promise.all([readPublicGuideTripCost(guide),readApprovedGuidePriceHighlights(guide.slug),readPublishedPackages(),readPublicGuides()]);
 return <GuidePageView guide={guide} publicData={publicData} publicTripCost={publicTripCost} approvedPriceHighlights={approvedPriceHighlights} relatedPackages={packages.filter(p=>p.related_guide_slugs?.includes(guide.slug))} allGuides={guides.map(g=>resolveGuidePublicMedia(g,publicData.locations))}/>
}
