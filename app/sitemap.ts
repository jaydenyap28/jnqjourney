import type { MetadataRoute } from 'next'

import { buildRegionPath } from '@/lib/region-routing'
import { absoluteUrl } from '@/lib/site'
import { readGuides } from '@/lib/server/guides-store'
import { buildCanonicalLocationPath } from '@/lib/server/location-slugs-store'
import { readPublishedNotes } from '@/lib/server/notes-store'
import { fetchAllLocationsForSitemap, fetchAllRegionsForSitemap } from '@/lib/server/public-location-data'
import { readPublishedPackages } from '@/lib/server/travel-packages'

function validDateOrUndefined(value?: string | null) {
  if (!value) return undefined
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [locations, regions, guides, notes, packages] = await Promise.all([
    fetchAllLocationsForSitemap(),
    fetchAllRegionsForSitemap(),
    readGuides(),
    readPublishedNotes(),
    readPublishedPackages(),
  ])

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), changeFrequency: 'daily', priority: 1 },
    { url: absoluteUrl('/region'), changeFrequency: 'weekly', priority: 0.8 },
    { url: absoluteUrl('/guide'), changeFrequency: 'weekly', priority: 0.8 },
    { url: absoluteUrl('/notes'), changeFrequency: 'weekly', priority: 0.7 },
    { url: absoluteUrl('/packages'), changeFrequency: 'weekly', priority: 0.8 },
    { url: absoluteUrl('/contact'), changeFrequency: 'yearly', priority: 0.4 },
    { url: absoluteUrl('/privacy'), changeFrequency: 'yearly', priority: 0.2 },
  ]

  const spotRoutes: MetadataRoute.Sitemap = await Promise.all(
    locations.map(async (location) => ({
      url: absoluteUrl(await buildCanonicalLocationPath(location.name, location.id)),
      lastModified: location.updated_at || undefined,
      changeFrequency: 'weekly',
      priority: 0.7,
    }))
  )

  const regionRoutes: MetadataRoute.Sitemap = regions.map((region) => ({
    url: absoluteUrl(buildRegionPath(region.name, region.id)),
    lastModified: region.updated_at || undefined,
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  const guideRoutes: MetadataRoute.Sitemap = guides.map((guide) => ({
    url: absoluteUrl(`/guide/${guide.slug}`),
    lastModified: validDateOrUndefined((guide as any).updatedAt || (guide as any).createdAt || guide.sortDate),
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  const noteRoutes: MetadataRoute.Sitemap = notes.map((note) => ({
    url: absoluteUrl(`/notes/${note.slug}`),
    lastModified: validDateOrUndefined(note.updatedAt || note.createdAt),
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  const packageRoutes: MetadataRoute.Sitemap = packages.map((item) => ({
    url: absoluteUrl(`/packages/${item.slug}`),
    lastModified: validDateOrUndefined(item.updated_at || item.published_at),
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  return [...staticRoutes, ...spotRoutes, ...regionRoutes, ...guideRoutes, ...noteRoutes, ...packageRoutes]
}
