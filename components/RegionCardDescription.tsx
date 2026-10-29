'use client'

import { usePublicLocale } from '@/components/PublicLocale'
import { regionCardDescription } from '@/lib/region-card-copy'
import type { EntityNameSource } from '@/lib/entity-display-name'

export default function RegionCardDescription({ region, description }: { region: EntityNameSource; description?: string | null }) {
  return regionCardDescription(region, description, usePublicLocale())
}
