import HomePageClient from '@/components/HomePageClient'
import { readGuides } from '@/lib/server/guides-store'
import { readPublishedNotes } from '@/lib/server/notes-store'
import { readPublishedPackages } from '@/lib/server/travel-packages'
import { resolvePublicData } from '@/lib/server/public-data-resolver'

export const revalidate = 3600

export default async function Home() {
  const [{ locations, regions }, guides, notes, packages] = await Promise.all([
    resolvePublicData(),
    readGuides(),
    readPublishedNotes(),
    readPublishedPackages(),
  ])

  return (
    <HomePageClient
      initialGuides={guides.slice(0, 6)}
      initialLocations={locations}
      initialNotes={notes}
      initialRegions={regions}
      initialLoadError={null}
      initialPackages={packages.slice(0, 3)}
    />
  )
}
