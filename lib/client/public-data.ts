import { createRequestDeduper, type PublicLocation, type PublicRegion } from '@/lib/public-data'

export const fetchPublicData = createRequestDeduper<{ locations: PublicLocation[]; regions: PublicRegion[] }>(() =>
  fetch('/api/locations')
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload?.error?.message || payload?.error || 'Unable to load travel spots right now.')
        return {
          locations: Array.isArray(payload.locations) ? payload.locations : [],
          regions: Array.isArray(payload.regions) ? payload.regions : [],
        }
      })
)
