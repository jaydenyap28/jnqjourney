'use client'

import Link from 'next/link'
import { Search, Globe, MapPin, Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useState } from 'react'

interface TopFloatingIslandProps {
  onSearch: (term: string) => void
  onLanguageChange: () => void
}

export default function TopFloatingIsland({ onSearch, onLanguageChange }: TopFloatingIslandProps) {
  const [searchTerm, setSearchTerm] = useState('')

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    const term = event.target.value
    setSearchTerm(term)
    onSearch(term)
  }

  return (
    <div className="absolute left-1/2 top-2.5 z-50 w-full max-w-4xl -translate-x-1/2 px-2.5 md:top-5 md:px-4">
      <div className="surface-glass rounded-[22px] border border-white/10 px-2.5 py-2 text-white shadow-[0_18px_45px_rgba(0,0,0,0.24)] md:rounded-full md:px-4 md:py-3">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/20 bg-white/10 md:h-11 md:w-11 md:rounded-2xl">
              <MapPin className="h-4 w-4 text-amber-200 md:h-5 md:w-5" />
            </div>
            <div>
              <span className="text-[13px] font-semibold text-white md:text-base">JnQ Journey</span>
            </div>
          </div>

          <div className="grid flex-1 gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/50 md:left-4 md:h-4 md:w-4" />
              <Input
                value={searchTerm}
                onChange={handleSearch}
                placeholder="Search spots, regions, or tags / 搜索景点、地区、标签"
                className="h-9 rounded-full border border-white/10 bg-white/6 pl-9 pr-3 text-[12px] text-white placeholder:text-white/45 focus-visible:ring-1 focus-visible:ring-amber-200/50 md:h-11 md:pl-11 md:pr-4 md:text-sm"
              />
            </div>

            <div className="flex items-center justify-between gap-2 sm:justify-start sm:flex-wrap">
              <Link
                href="/region"
                className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-white/90 transition hover:bg-white/10 md:gap-2 md:px-4 md:py-2 md:text-sm"
              >
                <Compass className="h-3.5 w-3.5 shrink-0 text-amber-200 md:h-4 md:w-4" />
                <span className="truncate">Regions / 地区目录</span>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                onClick={onLanguageChange}
                className="h-8 w-8 rounded-full text-white/80 hover:bg-white/10 hover:text-white md:h-10 md:w-10"
                title="Language options coming soon"
              >
                <Globe className="h-3.5 w-3.5 md:h-4 md:w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
