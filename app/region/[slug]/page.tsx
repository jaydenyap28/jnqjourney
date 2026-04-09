import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Compass, MapPinned, Route, Sparkles } from 'lucide-react'
import SiteFooter from '@/components/SiteFooter'
import { Badge } from '@/components/ui/badge'
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

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const region = await fetchRegionBySlug(params.slug)

  if (!region) {
    return {
      title: '区域不存在 | JnQ Journey',
    }
  }

  const readableName = region.name_cn ? `${region.name_cn} / ${region.name}` : region.name
  const canonicalPath = buildRegionPath(region.name, region.id)

  return {
    title: readableName,
    description: `${readableName} 的景点、美食、住宿、地图与旅行灵感。`,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      type: 'website',
      title: readableName,
      description: `${readableName} 的景点、美食、住宿、地图与旅行灵感。`,
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

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.12),transparent_20%),linear-gradient(180deg,#0f172a_0%,#020617_45%,#000000_100%)] text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-12">
        <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-white/70 md:mb-6">
          <Link href="/" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 transition hover:bg-white/10">
            <ArrowLeft className="h-4 w-4" />
            回到首页地图
          </Link>
          <Link href="/guide" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 transition hover:bg-white/10">
            <Route className="h-4 w-4" />
            看完整游记
          </Link>
          <Link href="/region" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 transition hover:bg-white/10">
            <Compass className="h-4 w-4" />
            看所有地区
          </Link>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 md:p-8">
          <p className="text-xs uppercase tracking-[0.3em] text-amber-300/80">Region Hub</p>
          <div className="mt-4 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <h1 className="text-3xl font-bold text-white md:text-5xl">{region.name}</h1>
              {region.name_cn ? <p className="mt-2 text-lg text-gray-400 md:text-2xl">{region.name_cn}</p> : null}
              <p className="mt-4 text-sm leading-7 text-gray-300">
                {region.description || `${readableName} 的景点、美食、住宿和旅行灵感都会持续沉淀在这里，也适合承接影片流量、联盟推荐和完整游记导流。`}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {region.country ? <Badge className="border border-white/10 bg-white/10 text-white">{region.country}</Badge> : null}
                <Badge className="border border-amber-400/20 bg-amber-400/10 text-amber-100">{locations.length} 个地点</Badge>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">Start Here</p>
                  <p className="mt-2 text-sm text-white">先看这个地区的点，再回首页继续发现其他国家与路线。</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">Travel Route</p>
                  <p className="mt-2 text-sm text-white">如果你是从 YouTube 进来的，可以继续接完整游记看路线。</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">More Discovery</p>
                  <p className="mt-2 text-sm text-white">地图首页会继续带你找其他地区、景点和预订资讯。</p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/" className="inline-flex items-center justify-center gap-2 rounded-full border border-amber-300/20 bg-amber-400/10 px-4 py-2 text-sm text-amber-100 transition hover:bg-amber-400/15">
                <MapPinned className="h-4 w-4" />
                回首页看地图
              </Link>
              <Link href="/guide" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white transition hover:bg-white/10">
                <Sparkles className="h-4 w-4" />
                看完整游记
              </Link>
              <Link href="/region" className="inline-flex items-center justify-center rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white transition hover:bg-white/10">
                查看所有地区
              </Link>
            </div>
          </div>
        </div>

        {locations.length > 0 ? (
          <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {locations.map((location) => {
              const coverImage = location.image_url || location.images?.[0] || '/placeholder-image.jpg'
              return (
                <Link
                  key={location.id}
                  href={buildLocationPath(location.name, location.id)}
                  className="group overflow-hidden rounded-3xl border border-white/10 bg-white/5 transition hover:-translate-y-1 hover:bg-white/10"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-white/5">
                    <Image src={coverImage} alt={location.name} fill className="object-cover transition duration-500 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                    {location.category ? (
                      <div className="absolute left-4 top-4">
                        <Badge className="border border-white/10 bg-black/50 text-white">
                          {location.category === 'food' ? '美食' : location.category === 'accommodation' ? '住宿' : '景点'}
                        </Badge>
                      </div>
                    ) : null}
                  </div>
                  <div className="space-y-3 p-5">
                    <div>
                      <h2 className="line-clamp-1 text-xl font-semibold text-white">{location.name}</h2>
                      {location.name_cn ? <p className="line-clamp-1 text-sm text-gray-400">{location.name_cn}</p> : null}
                    </div>
                    <p className="line-clamp-2 text-sm leading-6 text-gray-300">{location.description || location.review || '查看地点详情、图片和导航信息。'}</p>
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
            这个区域暂时还没有地点资料。
          </div>
        )}
      </div>
      <SiteFooter />
    </main>
  )
}

