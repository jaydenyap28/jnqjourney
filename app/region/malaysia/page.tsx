import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import SiteFooter from '@/components/SiteFooter'
import { Badge } from '@/components/ui/badge'
import { buildRegionPath } from '@/lib/region-routing'
import { fetchTopRegions } from '@/lib/server/public-location-data'

export const metadata: Metadata = {
  title: '马来西亚地区目录 | JnQ Journey',
  description: '浏览 JnQ Journey 整理的马来西亚州属、城市、海岛与路线地区。',
  alternates: {
    canonical: '/region/malaysia',
  },
}

export default async function MalaysiaRegionIndexPage() {
  const regions = (await fetchTopRegions(160)).filter((region) => String(region.country || '').trim() === 'Malaysia')

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.12),transparent_20%),linear-gradient(180deg,#0f172a_0%,#020617_45%,#000000_100%)] text-white">
      <div className="mx-auto max-w-7xl px-4 py-10 md:px-8 md:py-12">
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 md:p-8">
          <p className="text-xs uppercase tracking-[0.3em] text-amber-300/80">Malaysia Regions</p>
          <h1 className="mt-4 text-3xl font-bold md:text-5xl">马来西亚地区目录</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-gray-300 md:text-base">
            这里只显示马来西亚的州属、城市、海岛和路线地区，方便你从本地内容继续延伸景点、住宿和完整游记。
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Badge className="border border-white/10 bg-white/10 text-white">{regions.length} 个马来西亚地区</Badge>
            <Link
              href="/"
              className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white transition hover:bg-white/10"
            >
              返回地图首页
            </Link>
          </div>
        </div>

        <section className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {regions.map((region) => {
            const regionPath = buildRegionPath(region.name, region.id)
            return (
              <Link
                key={region.id}
                href={regionPath}
                className="group overflow-hidden rounded-3xl border border-white/10 bg-white/5 transition hover:-translate-y-1 hover:bg-white/10"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-white/5">
                  {region.image_url ? (
                    <Image
                      src={region.image_url}
                      alt={region.name}
                      fill
                      className="object-cover transition duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.28),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.12),rgba(255,255,255,0.02))]" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                </div>
                <div className="space-y-3 p-5">
                  <div>
                    <h2 className="line-clamp-1 text-xl font-semibold text-white">{region.name}</h2>
                    {region.name_cn ? <p className="line-clamp-1 text-sm text-gray-400">{region.name_cn}</p> : null}
                  </div>
                  <p className="line-clamp-3 text-sm leading-6 text-gray-300">
                    {region.description || `进入 ${region.name}，查看当地景点、美食和后续会持续补充的旅行内容。`}
                  </p>
                </div>
              </Link>
            )
          })}
        </section>
      </div>
      <SiteFooter />
    </main>
  )
}
