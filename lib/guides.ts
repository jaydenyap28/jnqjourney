export interface GuideBudgetItem {
  label: string
  amount: string
  currency?: string
  note?: string
}

export type GuideBudgetScope =
  | 'per_person'
  | 'per_room'
  | 'per_group'
  | 'total_trip'
  | 'unspecified'

export interface GuideRouteStop {
  stopLabel?: string
  name: string
  summary: string
  mapSpotName?: string
  latitude?: number
  longitude?: number
}

export interface GuideDayImage {
  url: string
  alt: string
  caption?: string
  assetId?: string
  r2Key?: string
}

/** A stable, ordered reference to a public Spot used by a Guide day. */
export interface GuideAttractionRef {
  spotId?: number
  spotSlug?: string
  displayOrder: number
  enabled?: boolean
  displayName?: string
  guideSummary?: string
  routeNote?: string
  tips?: string
}

export interface GuideDayPlan {
  dayLabel: string
  date?: string
  title: string
  summary: string
  highlights: string[]
  attractions?: GuideAttractionRef[]
  linkedSpots?: string[]
  videoUrl?: string
  transport?: string
  transportPrice?: string
  stay?: string
  stayNote?: string
  stayRangeStart?: number
  stayRangeEnd?: number
  gallery?: GuideDayImage[]
  reminder?: string
}

export type GuideItineraryMode = 'daily' | 'segment'

export interface GuideItineraryRoute {
  dayNumber?: number
  title: string
  summary?: string
  attractions?: GuideAttractionRef[]
  linkedSpots?: string[]
  status?: 'visited' | 'reference' | 'pending'
}

export interface GuideItineraryStay {
  dayStart: number
  dayEnd: number
  /** Exact locations.id for the accommodation entity. */
  accommodationId: number
  note?: string
}

export interface GuideItinerarySegment {
  id: string
  dayStart: number
  dayEnd: number
  dateStart: string
  dateEnd: string
  city: string
  title: string
  summary: string
  verifiedRoutes: GuideItineraryRoute[]
  referenceRoutes?: GuideItineraryRoute[]
  accommodation?: string
  /** Legacy display fallback. Complete guides should use accommodationStays. */
  accommodationSpotName?: string
  /** Exact accommodation entities by day; avoids cross-city name matching. */
  accommodationStays?: GuideItineraryStay[]
  accommodationNote?: string
  transport?: string
  media?: Array<{ label: string; url?: string }>
  practicalTips?: string[]
  actualExperiences?: string[]
  pendingItems?: string[]
  priceCandidateIds?: string[]
  imageMatches?: Array<{ level: 'attraction' | 'route' | 'city'; label: string; note?: string }>
  globalDayMappingStatus?: 'confirmed' | 'pending'
}

export interface TravelGuide {
  slug: string
  aliases?: string[]
  sortDate?: string
  /** ISO travel dates drive public guide ordering; management dates are a fallback only. */
  tripStartDate?: string
  tripEndDate?: string
  publishedAt?: string
  title: string
  shortTitle: string
  tagline: string
  summary: string
  duration: string
  budget: string
  budgetScope?: GuideBudgetScope
  travelStyle: string
  route: GuideRouteStop[]
  coverAccent: string
  coverImage?: string
  highlightTags: string[]
  heroBullets: string[]
  budgetItems: GuideBudgetItem[]
  days: GuideDayPlan[]
  itineraryMode?: GuideItineraryMode
  itinerarySegments?: GuideItinerarySegment[]
  bestFor: string[]
  notes: string[]
  featuredSpotNames?: string[]
  featuredAffiliateLinkIds?: number[]
  sidebarAffiliateLinkIds?: number[]
  klookWidgetCode?: string
  videoUrl?: string
  facebookUrl?: string
}

export const DEFAULT_GUIDE_COVER_ACCENT =
  'bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.34),transparent_22%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.2),transparent_18%),linear-gradient(135deg,rgba(255,255,255,0.16),rgba(255,255,255,0.03))]'

export const EMPTY_GUIDE: TravelGuide = {
  slug: '',
  aliases: [],
  title: '',
  shortTitle: '',
  tagline: '',
  summary: '',
  duration: '',
  budget: '',
  budgetScope: 'unspecified',
  travelStyle: 'Free & Easy',
  route: [],
  coverAccent: DEFAULT_GUIDE_COVER_ACCENT,
  coverImage: '',
  highlightTags: [],
  heroBullets: [],
  budgetItems: [],
  days: [],
  bestFor: [],
  notes: [],
  featuredSpotNames: [],
  featuredAffiliateLinkIds: [],
  sidebarAffiliateLinkIds: [],
  klookWidgetCode: '',
  videoUrl: '',
  facebookUrl: '',
}
