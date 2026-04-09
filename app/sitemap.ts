import type { MetadataRoute } from 'next'

import { buildLocationPath } from '@/lib/location-routing'
import { buildRegionPath } from '@/lib/region-routing'
import { absoluteUrl } from '@/lib/site'
import { readGuides } from '@/lib/server/guides-store'
import { readPublishedNotes } from '@/lib/server/notes-store'
import { fetchAllLocationsForSitemap, fetchAllRegionsForSitemap } from '@/lib/server/public-location-data'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [locations, regions, guides, notes] = await Promise.all([
    fetchAllLocationsForSitemap(),
    fetchAllRegionsForSitemap(),
    readGuides(),
    readPublishedNotes(),
  ])

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), changeFrequency: 'daily', priority: 1 },
    { url: absoluteUrl('/region'), changeFrequency: 'weekly', priority: 0.8 },
    { url: absoluteUrl('/guide'), changeFrequency: 'weekly', priority: 0.8 },
    { url: absoluteUrl('/notes'), changeFrequency: 'weekly', priority: 0.7 },
  ]

  const spotRoutes: MetadataRoute.Sitemap = locations.map((location) => ({
    url: absoluteUrl(buildLocationPath(location.name, location.id)),
    lastModified: location.updated_at || undefined,
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  const regionRoutes: MetadataRoute.Sitemap = regions.map((region) => ({
    url: absoluteUrl(buildRegionPath(region.name, region.id)),
    lastModified: region.updated_at || undefined,
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  const guideRoutes: MetadataRoute.Sitemap = guides.map((guide) => ({
    url: absoluteUrl(`/guide/${guide.slug}`),
    lastModified: guide.days?.length ? new Date().toISOString() : undefined,
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  const noteRoutes: MetadataRoute.Sitemap = notes.map((note) => ({
    url: absoluteUrl(`/notes/${note.slug}`),
    lastModified: note.updatedAt || note.createdAt || undefined,
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  return [...staticRoutes, ...spotRoutes, ...regionRoutes, ...guideRoutes, ...noteRoutes]
}
