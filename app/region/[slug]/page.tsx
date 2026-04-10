import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import FallbackImage from '@/components/FallbackImage'
import { ArrowLeft, Compass, MapPinned, Route } from 'lucide-react'
import SiteFooter from '@/components/SiteFooter'
import { Badge } from '@/components/ui/badge'
import { getDisplayTitle, getSpotDescription } from '@/lib/content-display'
import { buildLocationPath } from '@/lib/location-routing'
import { buildRegionPath } from '@/lib/region-routing'
import { fetchLocationsByRegion, fetchRegionBySlug } from '@/lib/server/public-location-data'
import { absoluteUrl } from '@/lib/site'
import { getVisibleLocationTags } from '@/lib/tag-utils'

interface PageProps {
  params: {
    slug: string
  }
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const region = await fetchRegionBySlug(params.slug)

  if (!region) {
    return {
      title: 'Region not found | JnQ Journey',
    }
  }

  const readableName = region.name_cn ? `${region.name_cn} / ${region.name}` : region.name
  const canonicalPath = buildRegionPath(region.name, region.id)

  return {
    title: readableName,
    description: `Spots, food, stays, maps, and travel ideas around ${readableName}.`,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      type: 'website',
      title: readableName,
      description: `Spots, food, stays, maps, and travel ideas around ${readableName}.`,
      url: absoluteUrl(canonicalPath),
      images: region.image_url ? [{ url: region.image_url }] : undefined,
    },
  }
}

export default async function RegionPage({ params }: PageProps) {
  const region = await fetchRegionBySlug(params.slug)

  if (!region) {
    notFound()
  }

  const locations = await fetchLocationsByRegion(region.id, 60)
  const readableName = region.name_cn ? `${region.name_cn} / ${region.name}` : region.name
  const regionTitle = getDisplayTitle(region.name, region.name_cn)

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.12),transparent_20%),linear-gradient(180deg,#0f172a_0%,#020617_45%,#000000_100%)] text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-12">
        <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-white/70 md:mb-6">
          <Link href="/" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 transition hover:bg-white/10">
            <ArrowLeft className="h-4 w-4" />
            Back to home map
          </Link>
          <Link href="/guide" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 transition hover:bg-white/10">
            <Route className="h-4 w-4" />
            View travel guides
          </Link>
          <Link href="/region" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 transition hover:bg-white/10">
            <Compass className="h-4 w-4" />
            View all regions
          </Link>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 md:p-8">
          <p className="text-xs uppercase tracking-[0.3em] text-amber-300/80">Region Hub / 区域页面</p>
          <div className="mt-4 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <h1 className="text-3xl font-bold text-white md:text-5xl">{regionTitle.primary}</h1>
              {regionTitle.secondary ? <p className="mt-2 text-lg text-gray-400 md:text-2xl">{regionTitle.secondary}</p> : null}
              <p className="mt-4 text-sm leading-7 text-gray-300">
                {region.description || `Spots, food, stays, and route ideas around ${readableName} are collected here for easier trip planning.`}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {region.country ? <Badge className="border border-white/10 bg-white/10 text-white">{region.country}</Badge> : null}
                <Badge className="border border-amber-400/20 bg-amber-400/10 text-amber-100">{locations.length} spots</Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/" className="inline-flex items-center justify-center gap-2 rounded-full border border-amber-300/20 bg-amber-400/10 px-4 py-2 text-sm text-amber-100 transition hover:bg-amber-400/15">
                <MapPinned className="h-4 w-4" />
                Home map
              </Link>
              <Link href="/guide" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white transition hover:bg-white/10">
                <Route className="h-4 w-4" />
                Travel guides
              </Link>
              <Link href="/region" className="inline-flex items-center justify-center rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white transition hover:bg-white/10">
                All regions
              </Link>
            </div>
          </div>
        </div>

        {locations.length > 0 ? (
          <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {locations.map((location) => {
              const coverImage = location.image_url || location.images?.[0] || '/placeholder-image.jpg'
              const title = getDisplayTitle(location.name, location.name_cn)
              return (
                <Link
                  key={location.id}
                  href={buildLocationPath(location.name, location.id)}
                  className="group overflow-hidden rounded-3xl border border-white/10 bg-white/5 transition hover:-translate-y-1 hover:bg-white/10"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-white/5">
                    <FallbackImage src={coverImage} alt={title.primary} fill className="object-cover transition duration-500 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                    {location.category ? (
                      <div className="absolute left-4 top-4">
                        <Badge className="border border-white/10 bg-black/50 text-white">
                          {location.category === 'food' ? 'Food' : location.category === 'accommodation' ? 'Stay' : 'Spot'}
                        </Badge>
                      </div>
                    ) : null}
                  </div>
                  <div className="space-y-3 p-5">
                    <div>
                      <h2 className="line-clamp-1 text-xl font-semibold text-white">{title.primary}</h2>
                      {title.secondary ? <p className="line-clamp-1 text-sm text-gray-400">{title.secondary}</p> : null}
                    </div>
                    <p className="line-clamp-2 text-sm leading-6 text-gray-300">{getSpotDescription(location) || 'Open this page for photos, maps, and route details.'}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                      {getVisibleLocationTags(location.tags).slice(0, 2).map((tag) => (
                        <span key={tag} className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-white/80">{tag}</span>
                      ))}
                    </div>
                  </div>
                </Link>
              )
            })}
          </section>
        ) : (
          <div className="mt-8 rounded-3xl border border-dashed border-white/10 bg-white/5 p-10 text-center text-gray-400">
            No spots have been added to this region yet.
          </div>
        )}
      </div>
      <SiteFooter />
    </main>
  )
}

