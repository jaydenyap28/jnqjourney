import HomePageClient from '@/components/AppHomePageClient'
import type { Metadata } from 'next'
import { buildOpenGraphData, buildTwitterCardData } from '@/lib/seo'
import { readPublicGuides, readPublicNotes } from '@/lib/server/public-content-store'
import { readPublishedPackages } from '@/lib/server/travel-packages'
import { resolvePublicData } from '@/lib/server/public-data-resolver'
import { resolveGuidePublicMedia, resolveNotePublicMedia } from '@/lib/server/public-content-media'

export const revalidate = 3600

const homeTitle = 'JnQ Journey｜旅行地图、自由行攻略与旅行笔记'
const homeDescription = '跟着 Jayden & Qing 整理的旅行地图，查找马来西亚、日本与中国的景点、美食和住宿记录，串联自由行路线、影片与旅行笔记。'
export const metadata: Metadata = {
  title: { absolute: homeTitle }, description: homeDescription,
  openGraph: { ...buildOpenGraphData(homeTitle, homeDescription, '/'), locale: 'zh_CN' },
  twitter: buildTwitterCardData(homeTitle, homeDescription),
}

export default async function Home() {
  const [{ locations, regions }, guides, notes, packages] = await Promise.all([
    resolvePublicData(),
    readPublicGuides(),
    readPublicNotes(),
    readPublishedPackages(),
  ])

  return (
    <HomePageClient
      initialLocations={locations}
      initialGuides={guides.slice(0, 6).map((guide) => resolveGuidePublicMedia(guide, locations))}
      initialNotes={notes.map((note) => resolveNotePublicMedia(note, locations))}
      initialRegions={regions}
      initialLoadError={null}
      initialPackages={packages.slice(0, 3)}
    />
  )
}
