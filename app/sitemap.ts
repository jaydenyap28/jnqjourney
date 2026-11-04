import type { MetadataRoute } from 'next'

import { buildRegionPath } from '@/lib/region-routing'
import { absoluteUrl } from '@/lib/site'
import { buildCanonicalLocationPath, readLocationSlugMap } from '@/lib/server/location-slugs-store'
import { readPublicGuides, readPublicNotes } from '@/lib/server/public-content-store'
import { fetchAllLocationsForSitemap, fetchAllRegionsForSitemap } from '@/lib/server/public-location-data'
import { readPublishedPackages } from '@/lib/server/travel-packages'
import { englishPageData, readEnglishCollections } from '@/lib/server/english-page-data'

export const revalidate = 3600
// The live quality inventory must be read for each regeneration. Its
// no-store fetch must not turn every crawler request into a regeneration.
export const dynamic = 'force-static'

function validDateOrUndefined(value?: string | null) {
  if (!value) return undefined
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [locations, regions, guides, notes, packages, slugMap, englishCollections] = await Promise.all([
    fetchAllLocationsForSitemap(),
    fetchAllRegionsForSitemap(),
    readPublicGuides(),
    readPublicNotes(),
    readPublishedPackages(),
    readLocationSlugMap(),
    readEnglishCollections(),
  ])

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), changeFrequency: 'daily', priority: 1 },
    { url: absoluteUrl('/region'), changeFrequency: 'weekly', priority: 0.8 },
    { url: absoluteUrl('/guide'), changeFrequency: 'weekly', priority: 0.8 },
    { url: absoluteUrl('/notes'), changeFrequency: 'weekly', priority: 0.7 },
    { url: absoluteUrl('/packages'), changeFrequency: 'weekly', priority: 0.8 },
    { url: absoluteUrl('/contact'), changeFrequency: 'yearly', priority: 0.4 },
    { url: absoluteUrl('/privacy'), changeFrequency: 'yearly', priority: 0.2 },
    { url: absoluteUrl('/about'), changeFrequency: 'yearly', priority: 0.5 },
    { url: absoluteUrl('/editorial-policy'), changeFrequency: 'yearly', priority: 0.3 },
    { url: absoluteUrl('/affiliate-disclosure'), changeFrequency: 'yearly', priority: 0.3 },
    { url: absoluteUrl('/copyright'), changeFrequency: 'yearly', priority: 0.2 },
  ]

  // Display names may contain both languages (and repeat Latin words). Keep
  // the published URL identity; explicit editor-managed aliases still win.
  const canonicalSlugs = {
    ...Object.fromEntries(locations
      .filter(location => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(location.slug || '') && location.slug?.endsWith(`-${location.id}`))
      .map(location => [String(location.id), location.slug!.slice(0, -String(location.id).length - 1)])),
    ...slugMap,
  }

  const spotRoutes: MetadataRoute.Sitemap = await Promise.all(
    locations.map(async (location) => ({
      url: absoluteUrl(await buildCanonicalLocationPath(location.name, location.id, canonicalSlugs)),
      lastModified: validDateOrUndefined(location.updated_at),
      changeFrequency: 'weekly',
      priority: 0.7,
    }))
  )

  const regionRoutes: MetadataRoute.Sitemap = regions.map((region) => ({
    url: absoluteUrl(buildRegionPath(region.name, region.id)),
    lastModified: validDateOrUndefined(region.updated_at),
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

  const chineseRoutes=[...staticRoutes, ...spotRoutes, ...regionRoutes, ...guideRoutes, ...noteRoutes, ...packageRoutes]
  const localization=englishCollections.localization
  const englishRoutes:MetadataRoute.Sitemap=[]
  for(const record of localization.records.filter(r=>r.translationStatus==='complete')) {
    // A translation cannot bypass the existing source-page quality gate or
    // reintroduce an obsolete Spot alias into either language's sitemap.
    if (record.canonicalPath.startsWith('/spot/') && !chineseRoutes.some(route => route.url === absoluteUrl(record.canonicalPath))) continue
    // Verify actual translation completeness while reusing this generation's
    // collections. Related packages do not affect translation eligibility.
    const page=await englishPageData(record.canonicalPath.split('/').filter(Boolean), false, { collection: englishCollections, includePackages: false })
    if(!page || !('data' in page) || page.data.status!=='complete') {
      console.info('[i18n sitemap] omitted incomplete page',record.canonicalPath,page && 'data' in page ? page.data.status : 'unavailable')
      continue
    }
    const languages={zh:absoluteUrl(record.canonicalPath),en:absoluteUrl(`/en${record.canonicalPath}`),'x-default':absoluteUrl(record.canonicalPath)}
    const existing=chineseRoutes.find(r=>r.url===languages.zh)
    if(existing) existing.alternates={languages}
    else chineseRoutes.push({url:languages.zh,changeFrequency:'weekly',priority:0.6,alternates:{languages}})
    englishRoutes.push({url:languages.en,changeFrequency:'weekly',priority:0.6,alternates:{languages}})
  }
  const unique = new Map<string,MetadataRoute.Sitemap[number]>()
  for (const route of [...chineseRoutes,...englishRoutes]) {
    const previous = unique.get(route.url)
    unique.set(route.url,{...previous,...route,alternates:route.alternates || previous?.alternates})
  }
  return [...unique.values()]
}
