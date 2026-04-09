export interface GuideBudgetItem {
  label: string
  amount: string
  note?: string
}

export interface GuideRouteStop {
  stopLabel?: string
  name: string
  summary: string
  mapSpotName?: string
  latitude?: number
  longitude?: number
}

export interface GuideDayPlan {
  dayLabel: string
  title: string
  summary: string
  highlights: string[]
  linkedSpots?: string[]
  videoUrl?: string
  transport?: string
  transportPrice?: string
  stay?: string
  stayNote?: string
  stayRangeStart?: number
  stayRangeEnd?: number
}

export interface TravelGuide {
  slug: string
  aliases?: string[]
  sortDate?: string
  title: string
  shortTitle: string
  tagline: string
  summary: string
  duration: string
  budget: string
  travelStyle: string
  route: GuideRouteStop[]
  coverAccent: string
  coverImage?: string
  highlightTags: string[]
  heroBullets: string[]
  budgetItems: GuideBudgetItem[]
  days: GuideDayPlan[]
  bestFor: string[]
  notes: string[]
  featuredSpotNames?: string[]
  featuredAffiliateLinkIds?: number[]
  sidebarAffiliateLinkIds?: number[]
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
  videoUrl: '',
  facebookUrl: '',
}
