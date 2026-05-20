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
import { readGuides } from '@/lib/server/guides-store'
import { absoluteUrl } from '@/lib/site'
import { getVisibleLocationTags } from '@/lib/tag-utils'

import { buildCanonicalUrl, buildOpenGraphData, buildTwitterCardData } from '@/lib/seo'

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

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const region = await fetchRegionBySlug(params.slug)

  if (!region) {
    return {
      title: 'Region not found',
    }
  }

  const readableName = region.name_cn || region.name
  const seoTitle = `${readableName} Travel Guide - Spots, Food, Stays and Routes`
  const description = `Explore ${readableName} with JnQ Journey: travel spots, food finds, stays, route ideas, maps, photos, and practical notes for planning your trip.`
  
  const canonicalPath = buildRegionPath(region.name, region.id)
  const canonicalUrl = buildCanonicalUrl(canonicalPath)

  return {
    title: seoTitle,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: buildOpenGraphData(seoTitle, description, canonicalPath, region.image_url, 'website'),
    twitter: buildTwitterCardData(seoTitle, description, region.image_url),
  }
}

function SpotCard({ spot, regionName }: { spot: any, regionName: string }) {
  const title = getDisplayTitle(spot.name, spot.name_cn)
  const coverImage = spot.image_url || spot.images?.[0] || '/placeholder-image.jpg'
  return (
    <Link href={buildLocationPath(spot.name, spot.id)} className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(17,24,39,0.92))] transition hover:-translate-y-1 hover:bg-white/10">
      <div className="relative aspect-[4/3] bg-white/5">
        <FallbackImage src={coverImage} alt={`${title.primary} ${regionName} ${spot.category === 'food' ? '美食或环境照片' : '旅游照片'}`.trim()} fill sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw" className="object-cover transition duration-500 group-hover:scale-105" />
        {spot.category && (
          <div className="absolute left-3 top-3">
            <Badge className="border border-white/10 bg-black/50 text-white shadow-sm">
              {spot.category === 'food' ? 'Food' : spot.category === 'accommodation' ? 'Stay' : 'Spot'}
            </Badge>
          </div>
        )}
      </div>
      <div className="flex-1 p-3 md:p-4">
        <h3 className="line-clamp-1 font-semibold text-white text-base">{title.primary}</h3>
        <p className="line-clamp-2 text-xs md:text-sm text-gray-400 mt-1.5 leading-relaxed">{getSpotDescription(spot) || '查看详细介绍、图片与地图位置。'}</p>
      </div>
    </Link>
  )
}

export default async function RegionPage({ params }: PageProps) {
  const region = await fetchRegionBySlug(params.slug)

  if (!region) {
    notFound()
  }

  const locations = await fetchLocationsByRegion(region.id, 100)
  const readableName = region.name_cn || region.name

  // Guides matching
  const allGuides = await readGuides()
  const locationNames = new Set(
    locations.flatMap(loc => [
      normalizeGuideMatch(loc.name),
      normalizeGuideMatch(loc.name_cn)
    ]).filter(Boolean)
  )

  const relatedGuides = allGuides
    .filter((guide) => {
      const titleLower = guide.title.toLowerCase()
      if (titleLower.includes(region.name.toLowerCase()) || (region.name_cn && titleLower.includes(region.name_cn.toLowerCase()))) return true
      
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
    .slice(0, 4)

  const isCameron = region.name.toLowerCase().includes('cameron') || (region.name_cn && region.name_cn.includes('金马仑'))

  // Categories
  const foodSpots = locations.filter(loc => loc.category === 'food')
  
  const familyTags = ['family', 'kids', 'farm', 'zoo', '亲子', '农场', '动物园']
  const familySpots = locations.filter(loc => {
    if (loc.category === 'food') return false
    const tags = getVisibleLocationTags(loc.tags).map(t => t.toLowerCase())
    return tags.some(t => familyTags.some(ft => t.includes(ft)))
  })

  const photoTags = ['photo', 'instagram', 'garden', 'temple', 'landmark', '拍照', '打卡', '花园', '地标', '寺庙']
  const photoSpots = locations.filter(loc => {
    if (loc.category === 'food') return false
    const tags = getVisibleLocationTags(loc.tags).map(t => t.toLowerCase())
    return tags.some(t => photoTags.some(pt => t.includes(pt)))
  })

  const popularSpots = locations.filter(loc => loc.category !== 'food').slice(0, 8)

  // Cameron specific
  const cameronTea = isCameron ? locations.filter(loc => {
    const text = (loc.name + ' ' + (loc.name_cn||'') + ' ' + (loc.tags||[]).join(' ')).toLowerCase()
    return text.includes('tea') || text.includes('boh') || text.includes('茶园') || text.includes('bharat')
  }) : []
  const cameronFarm = isCameron ? locations.filter(loc => {
    const text = (loc.name + ' ' + (loc.name_cn||'') + ' ' + (loc.tags||[]).join(' ')).toLowerCase()
    return text.includes('farm') || text.includes('农场') || text.includes('strawberry') || text.includes('草莓') || text.includes('sheep') || text.includes('绵羊')
  }) : []
  const cameronGarden = isCameron ? locations.filter(loc => {
    const text = (loc.name + ' ' + (loc.name_cn||'') + ' ' + (loc.tags||[]).join(' ')).toLowerCase()
    return text.includes('garden') || text.includes('flora') || text.includes('花园') || text.includes('薰衣草') || text.includes('rose')
  }) : []
  const cameronBrinchang = isCameron ? locations.filter(loc => {
    const text = (loc.name + ' ' + (loc.name_cn||'') + ' ' + ((loc as any).address||'')).toLowerCase()
    return text.includes('brinchang')
  }) : []
  const cameronTanahRata = isCameron ? locations.filter(loc => {
    const text = (loc.name + ' ' + (loc.name_cn||'') + ' ' + ((loc as any).address||'')).toLowerCase()
    return text.includes('tanah rata')
  }) : []
  const cameronKeaFarm = isCameron ? locations.filter(loc => {
    const text = (loc.name + ' ' + (loc.name_cn||'') + ' ' + ((loc as any).address||'')).toLowerCase()
    return text.includes('kea farm')
  }) : []

  // JSON-LD
  const description = `这篇整理${readableName}自由行攻略，包括热门景点、美食打卡、亲子景点、路线安排、交通位置和 JnQ Journey 实际旅行资料，适合第一次规划${readableName}旅行的人参考。`
  const canonicalPath = buildRegionPath(region.name, region.id)
  
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'TouristDestination',
    name: readableName,
    description: description,
    image: region.image_url || undefined,
    url: absoluteUrl(canonicalPath),
    hasTouristAttraction: locations.slice(0, 10).map(loc => ({
      '@type': 'TouristAttraction',
      name: loc.name_cn || loc.name,
      url: absoluteUrl(buildLocationPath(loc.name, loc.id))
    }))
  }

  const breadcrumbData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: absoluteUrl('/') },
      { '@type': 'ListItem', position: 2, name: region.country === 'Malaysia' || region.country === '马来西亚' ? 'Malaysia' : 'Global Destinations', item: absoluteUrl('/region') },
      { '@type': 'ListItem', position: 3, name: readableName, item: absoluteUrl(canonicalPath) }
    ]
  }

  const spotNames = locations.slice(0, 5).map(l => l.name_cn || l.name).join('、')
  const regionIntro = region.description || `${readableName} 是一个非常适合自由行的地方。这里不仅有丰富的景点，如 ${spotNames}，还有各种特色美食等待探索。无论你是想计划周末短暂放松，还是带全家人一起亲子出游，这里都能找到适合的路线。我们在本页面整理了 JnQ Journey 实地走访和收录的打卡点资料，帮助你轻松规划专属的${readableName}之旅。`

  const faqs = [
    {
      q: `${readableName}有哪些必去热门景点？`,
      a: `根据 JnQ Journey 收录的资料，${readableName}的热门景点包括 ${locations.slice(0, 3).map(l => l.name_cn || l.name).join('、')} 等。点击页面上方的“热门景点”查看完整推荐。`
    },
    {
      q: `${readableName}有什么美食推荐？`,
      a: foodSpots.length > 0 
        ? `这里推荐尝试 ${foodSpots.slice(0, 3).map(l => l.name_cn || l.name).join('、')} 等美食和咖啡厅，适合打卡和用餐。`
        : `${readableName}拥有丰富的在地美食，更多详细的美食打卡记录会陆续更新到网站中。`
    },
    {
      q: `${readableName}适合亲子游吗？`,
      a: familySpots.length > 0
        ? `非常适合！例如 ${familySpots.slice(0, 2).map(l => l.name_cn || l.name).join('、')} 都是很棒的亲子友好地点，适合带孩子一起探索。`
        : `是否适合亲子游取决于您的具体行程安排。一般建议选择一些有农场、动物园或大自然体验的景点会更受小朋友欢迎。`
    },
    {
      q: `去${readableName}自由行建议安排几天？`,
      a: relatedGuides.length > 0
        ? `可以参考我们的游记路线，比如 ${relatedGuides[0].title}，${relatedGuides[0].duration ? '一般安排 ' + relatedGuides[0].duration + ' 比较充裕' : '您可以根据兴趣自由调整停留时间'}。`
        : `一般建议安排 2天1夜 或 3天2夜，这样有充足的时间走访核心景点和品尝美食。`
    },
    {
      q: `如何在${readableName}之间解决交通？`,
      a: `建议自行开车或使用 Grab 叫车，这在马来西亚和多数海外自由行城市中是最方便的移动方式。部分景点若比较偏远，自驾会节省很多时间。`
    }
  ]

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.12),transparent_20%),linear-gradient(180deg,#0f172a_0%,#020617_45%,#000000_100%)] text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbData) }} />
      
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-8 md:py-12 space-y-12">
        {/* 1. Breadcrumb */}
        <nav className="flex flex-wrap items-center gap-2 text-sm text-gray-400">
          <Link href="/" className="hover:text-white transition">Home</Link>
          <span>›</span>
          <Link href="/region" className="hover:text-white transition">
            {region.country === 'Malaysia' || region.country === '马来西亚' ? 'Malaysia' : 'Global Destinations'}
          </Link>
          <span>›</span>
          <span className="text-gray-500">{readableName}</span>
        </nav>

        {/* 2. Hero */}
        <header className="space-y-6">
          <div className="space-y-4">
            <div className="flex gap-2">
              <Badge className="bg-amber-500/20 text-amber-200 border-amber-500/30">Region Guide</Badge>
              {region.country && <Badge className="bg-white/10 text-white border-white/20">{region.country}</Badge>}
            </div>
            <h1 className="text-3xl md:text-5xl font-bold leading-tight text-white">{readableName}自由行攻略</h1>
            <p className="text-lg text-gray-300 leading-relaxed max-w-3xl">
              这里整理 JnQ Journey 已收录的 {readableName} 景点、美食、路线和旅行参考，适合规划自由行、周末游或亲子行程。
            </p>
          </div>
          
          {region.image_url && (
            <div className="relative aspect-[21/9] w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5">
              <FallbackImage src={region.image_url} alt={`${readableName} 旅游景点与自由行攻略`} fill sizes="100vw" className="object-cover" priority />
            </div>
          )}
        </header>

        {/* 3. 地区简介 */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-white">关于 {readableName}</h2>
          <p className="text-gray-300 leading-relaxed text-sm md:text-base">
            {regionIntro}
          </p>
        </section>

        {/* 8. 推荐路线 / Related Guides */}
        {relatedGuides.length > 0 && (
          <section className="space-y-6">
            <h2 className="text-2xl font-bold text-white">推荐路线</h2>
            <div className="grid gap-3 md:gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {relatedGuides.map(guide => (
                <Link key={guide.slug} href={`/guide/${guide.slug}`} className="block rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(17,24,39,0.92))] p-4 md:p-5 transition hover:-translate-y-1 hover:bg-white/10">
                  <div className="flex items-center gap-2 mb-2.5 text-xs text-amber-400">
                    <Route className="w-4 h-4" />
                    <span>{guide.duration || '行程参考'}</span>
                  </div>
                  <h3 className="font-semibold text-white line-clamp-2 leading-snug">{guide.title}</h3>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Cameron Special Sections */}
        {isCameron && (
          <div className="space-y-12">
            {cameronTea.length > 0 && (
               <section className="space-y-6">
                 <h2 className="text-2xl font-bold text-white">茶园与咖啡厅</h2>
                 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                   {cameronTea.slice(0, 8).map(spot => <SpotCard key={spot.id} spot={spot} regionName={readableName} />)}
                 </div>
               </section>
            )}
            {cameronFarm.length > 0 && (
               <section className="space-y-6">
                 <h2 className="text-2xl font-bold text-white">亲子农场</h2>
                 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                   {cameronFarm.slice(0, 8).map(spot => <SpotCard key={spot.id} spot={spot} regionName={readableName} />)}
                 </div>
               </section>
            )}
            {cameronGarden.length > 0 && (
               <section className="space-y-6">
                 <h2 className="text-2xl font-bold text-white">花园打卡</h2>
                 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                   {cameronGarden.slice(0, 8).map(spot => <SpotCard key={spot.id} spot={spot} regionName={readableName} />)}
                 </div>
               </section>
            )}
            {cameronBrinchang.length > 0 && (
               <section className="space-y-6">
                 <h2 className="text-2xl font-bold text-white">Brinchang 区域</h2>
                 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                   {cameronBrinchang.slice(0, 8).map(spot => <SpotCard key={spot.id} spot={spot} regionName={readableName} />)}
                 </div>
               </section>
            )}
            {cameronTanahRata.length > 0 && (
               <section className="space-y-6">
                 <h2 className="text-2xl font-bold text-white">Tanah Rata 区域</h2>
                 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                   {cameronTanahRata.slice(0, 8).map(spot => <SpotCard key={spot.id} spot={spot} regionName={readableName} />)}
                 </div>
               </section>
            )}
            {cameronKeaFarm.length > 0 && (
               <section className="space-y-6">
                 <h2 className="text-2xl font-bold text-white">Kea Farm 区域</h2>
                 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                   {cameronKeaFarm.slice(0, 8).map(spot => <SpotCard key={spot.id} spot={spot} regionName={readableName} />)}
                 </div>
               </section>
            )}
          </div>
        )}

        {/* 4. 热门景点 */}
        {popularSpots.length > 0 && !isCameron && (
          <section className="space-y-6">
            <h2 className="text-2xl font-bold text-white">热门景点</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
              {popularSpots.map(spot => <SpotCard key={spot.id} spot={spot} regionName={readableName} />)}
            </div>
          </section>
        )}

        {/* 5. 美食 / 咖啡厅 */}
        {foodSpots.length > 0 && !isCameron && (
          <section className="space-y-6">
            <h2 className="text-2xl font-bold text-white">美食与咖啡厅</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
              {foodSpots.slice(0, 8).map(spot => <SpotCard key={spot.id} spot={spot} regionName={readableName} />)}
            </div>
          </section>
        )}

        {/* 6. 亲子友好地点 */}
        {familySpots.length > 0 && !isCameron && (
          <section className="space-y-6">
            <h2 className="text-2xl font-bold text-white">亲子友好游玩</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
              {familySpots.slice(0, 8).map(spot => <SpotCard key={spot.id} spot={spot} regionName={readableName} />)}
            </div>
          </section>
        )}

        {/* 7. 拍照打卡地点 */}
        {photoSpots.length > 0 && !isCameron && (
          <section className="space-y-6">
            <h2 className="text-2xl font-bold text-white">绝美拍照打卡</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
              {photoSpots.slice(0, 8).map(spot => <SpotCard key={spot.id} spot={spot} regionName={readableName} />)}
            </div>
          </section>
        )}

        {/* 9. 所有景点列表 */}
        {locations.length > 0 && (
          <section className="space-y-6 pt-8 border-t border-white/10">
            <h2 className="text-2xl font-bold text-white">所有收录地点 ({locations.length})</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
              {locations.map(spot => <SpotCard key={spot.id} spot={spot} regionName={readableName} />)}
            </div>
          </section>
        )}

        {/* 10. FAQ */}
        <section className="space-y-6 border-t border-white/10 pt-8 pb-8">
          <h2 className="text-2xl font-bold text-white">常见问题 FAQ</h2>
          <div className="space-y-6">
             {faqs.map((faq, i) => (
                <div key={i}>
                  <h3 className="font-semibold text-white">Q：{faq.q}</h3>
                  <p className="mt-2 text-gray-300 text-sm leading-relaxed">
                    A：{faq.a}
                  </p>
                </div>
             ))}
          </div>
        </section>

      </div>
      <SiteFooter />
    </main>
  )
}
