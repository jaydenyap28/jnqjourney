import HomePageClient from '@/components/HomePageClient'
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
