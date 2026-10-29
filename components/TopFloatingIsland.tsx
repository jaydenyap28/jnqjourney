'use client'


import {PublicCopy} from '@/components/PublicLocale'
import type { ChangeEvent } from 'react'
import SpotSearchControls from './SpotSearchControls'
import type { PublicLocation } from '@/lib/public-data'
import type { SpotFilters } from '@/lib/spot-search'
import {PublicLink as Link} from '@/components/PublicLocale'
import { Search, MapPin, Compass } from 'lucide-react'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import {usePublicLocale} from './PublicLocale'
import { ui } from '@/lib/locale'

import { Input } from '@/components/ui/input'

interface TopFloatingIslandProps {
  onSearch: (term: string) => void
  filters: SpotFilters
  onFiltersChange: (value: SpotFilters) => void
  locations: PublicLocation[]
  resultCount: number
}

export default function TopFloatingIsland({ onSearch, filters, onFiltersChange, locations, resultCount }: TopFloatingIslandProps) {
  const locale=usePublicLocale()

  const handleSearch = (event: ChangeEvent<HTMLInputElement>) => {
    const term = event.target.value
    onSearch(term)
  }

  return (
    <div className="absolute left-1/2 top-2 z-50 w-full max-w-4xl -translate-x-1/2 px-2 md:top-5 md:px-4">
      <div className="surface-glass rounded-[18px] border border-white/10 px-2 py-1.5 text-white shadow-[0_18px_45px_rgba(0,0,0,0.24)] md:rounded-full md:px-4 md:py-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/20 bg-white/10 md:h-11 md:w-11 md:rounded-2xl">
              <MapPin className="h-3.5 w-3.5 text-amber-200 md:h-5 md:w-5" />
            </div>
            <div>
              <span className="text-[12px] font-semibold text-white md:text-base">JnQ Journey</span>
            </div>
          </div>

          <div className="grid flex-1 gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-white/50 md:left-4 md:h-4 md:w-4" />
              <Input
                type="search"
                aria-label={ui(locale, 'searchPlaceholder')}
                value={filters.q}
                onChange={handleSearch}
                placeholder={ui(locale, 'searchPlaceholder')}
                className="h-11 rounded-full border border-white/10 bg-white/6 pl-8 pr-3 text-base text-white placeholder:text-white/60 focus-visible:ring-1 focus-visible:ring-amber-200/50 md:pl-11 md:pr-4 md:text-sm"
              />
            </div>

            <div className="flex items-center justify-between gap-2 sm:justify-start sm:flex-wrap">
              <Link
                href="/region"
                className="inline-flex min-h-11 min-w-0 items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/90 transition hover:bg-white/10 md:gap-2 md:px-4 md:py-2 md:text-sm"
              >
                <Compass className="h-3 w-3 shrink-0 text-amber-200 md:h-4 md:w-4" />
                <span className="truncate"><PublicCopy text={"Regions / 地区目录"}/></span>
              </Link>
              <LanguageSwitcher initialPath={locale==='en'?'/en':'/'} />
            </div>
          </div>
        </div>
        <details className="mt-2 text-xs text-white/80">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-2 focus-visible:outline-amber-200">
            {locale === 'en' ? 'Filter places' : '筛选地点'}
            <span role="status" aria-live="polite">{resultCount} {locale === 'en' ? 'results' : '个结果'}</span>
          </summary>
          <SpotSearchControls spots={locations} value={filters} onChange={onFiltersChange} locale={locale} compact />
        </details>
      </div>
    </div>
  )
}
