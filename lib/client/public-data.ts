import { createRequestDeduper, type PublicLocation, type PublicRegion } from '@/lib/public-data'

export const fetchPublicData = createRequestDeduper<{ locations: PublicLocation[]; regions: PublicRegion[] }>(() =>
  fetch('/api/locations')
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload?.error?.message || payload?.error || 'Unable to load travel spots right now.')
        if (!Array.isArray(payload?.locations) || !Array.isArray(payload?.regions)) throw new Error('Unable to load travel spots right now. Please retry.')
        return {
          locations: payload.locations,
          regions: payload.regions,
        }
      })
)
