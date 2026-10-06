import HomePageClient from '@/components/AppHomePageClient'
import { readPublicGuides, readPublicNotes } from '@/lib/server/public-content-store'
import { readPublishedPackages } from '@/lib/server/travel-packages'
import { resolvePublicData } from '@/lib/server/public-data-resolver'
import { resolveGuidePublicMedia, resolveNotePublicMedia } from '@/lib/server/public-content-media'

export const revalidate = 3600

export default async function Home() {
  const [{ locations, regions }, guides, notes, packages] = await Promise.all([
    resolvePublicData(),
    readPublicGuides(),
    readPublicNotes(),
    readPublishedPackages(),
  ])

  const hainanPackages = packages.filter((item) => item.slug.startsWith('hainan-'))
  const regularPackages = packages.filter((item) => !item.slug.startsWith('hainan-'))
  const hainanPrimary = hainanPackages.find((item) => item.slug.includes('5d4n')) || hainanPackages[0]
  const hainanLowestPrice = hainanPackages
    .map((item) => Number((item.price_display || '').replace(/,/g, '').match(/RM\s*([0-9]+)/i)?.[1] || ''))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b)[0]

  const homepagePackages = [
    ...regularPackages,
    ...(hainanPrimary ? [{
      ...hainanPrimary,
      slug: 'hainan',
      title_zh: '海南岛旅游配套',
      title_en: 'Hainan Tour Packages',
      duration: '4天3夜 / 5天4夜',
      short_description: `共有 ${hainanPackages.length} 个海南方案可选，先比较天数、价格与行程，再选择适合自己的配套。`,
      price_display: hainanLowestPrice ? `约 RM${hainanLowestPrice.toLocaleString('en-MY')}++ / 人起` : hainanPrimary.price_display,
      sort_order: Math.min(...hainanPackages.map((item) => item.sort_order || 999)),
    }] : []),
  ].sort((left, right) => {
    if (Boolean(left.featured) !== Boolean(right.featured)) return left.featured ? -1 : 1
    return (left.sort_order || 0) - (right.sort_order || 0)
  })

  return (
    <HomePageClient
      initialLocations={locations}
      initialGuides={guides.slice(0, 6).map((guide) => resolveGuidePublicMedia(guide, locations))}
      initialNotes={notes.map((note) => resolveNotePublicMedia(note, locations))}
      initialRegions={regions}
      initialLoadError={null}
      initialPackages={homepagePackages.slice(0, 3)}
    />
  )
}
