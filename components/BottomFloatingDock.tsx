'use client'

import Link from 'next/link'
import { MapPin, ArrowRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import React, { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { buildLocationPath } from '@/lib/location-routing'
import FallbackImage from '@/components/FallbackImage'

interface Location {
  id: number
  name: string
  name_cn?: string
  category?: string
  review?: string
  description?: string
  image_url?: string
  images?: string[]
  latitude: number
  longitude: number
  opening_hours?: string
}

interface BottomFloatingDockProps {
  locations: Location[]
  onHoverLocation: (location: Location | null) => void
  onSelectLocation: (location: Location) => void
}

function getCategoryLabel(category?: string) {
  switch (category) {
    case 'food':
      return 'Food'
    case 'accommodation':
      return 'Stay'
    case 'attraction':
    default:
      return 'Spot'
  }
}

function getDisplayTitle(location: Location) {
  if (location.name_cn && location.name_cn.trim() && location.name_cn.trim() !== location.name.trim()) {
    return { primary: location.name, secondary: location.name_cn }
  }

  return { primary: location.name, secondary: '' }
}

export default function BottomFloatingDock({
  locations,
  onHoverLocation,
  onSelectLocation,
}: BottomFloatingDockProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, locations.length)
  }, [locations])

  const scrollToItem = (index: number) => {
    const item = itemRefs.current[index]
    if (item) {
      item.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (locations.length === 0) return

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        setFocusedIndex((prev) => {
          const next = prev === null ? 0 : Math.min(prev + 1, locations.length - 1)
          scrollToItem(next)
          onHoverLocation(locations[next])
          return next
        })
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setFocusedIndex((prev) => {
          const next = prev === null ? 0 : Math.max(prev - 1, 0)
          scrollToItem(next)
          onHoverLocation(locations[next])
          return next
        })
      } else if (event.key === 'Enter' && focusedIndex !== null) {
        event.preventDefault()
        onSelectLocation(locations[focusedIndex])
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [locations, focusedIndex, onHoverLocation, onSelectLocation])

  const isDown = useRef(false)
  const startX = useRef(0)
  const scrollLeft = useRef(0)
  const isDragging = useRef(false)

  const handleMouseDown = (event: React.MouseEvent) => {
    isDown.current = true
    isDragging.current = false
    if (scrollContainerRef.current) {
      startX.current = event.pageX - scrollContainerRef.current.offsetLeft
      scrollLeft.current = scrollContainerRef.current.scrollLeft
    }
  }

  const handleMouseLeave = () => {
    isDown.current = false
  }

  const handleMouseUp = () => {
    isDown.current = false
  }

  const handleMouseMove = (event: React.MouseEvent) => {
    if (!isDown.current) return

    event.preventDefault()
    if (scrollContainerRef.current) {
      const x = event.pageX - scrollContainerRef.current.offsetLeft
      const walk = (x - startX.current) * 2
      scrollContainerRef.current.scrollLeft = scrollLeft.current - walk

      if (Math.abs(walk) > 10) {
        isDragging.current = true
      }
    }
  }

  const handleCardClick = (location: Location) => {
    if (isDragging.current) return
    onSelectLocation(location)
  }

  return (
    <div className="pointer-events-none absolute bottom-4 left-0 z-40 w-full md:bottom-10">
      <div className="pointer-events-auto w-full overflow-x-auto">
        <div className="flex flex-col items-center">
          <div className="w-full max-w-fit px-3 md:px-6">
            <div
              ref={scrollContainerRef}
              className="scrollbar-hide flex cursor-grab gap-3 overflow-x-auto snap-x px-1 pb-2 active:cursor-grabbing md:gap-4 md:px-2 md:pb-4"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              onMouseDown={handleMouseDown}
              onMouseLeave={handleMouseLeave}
              onMouseUp={handleMouseUp}
              onMouseMove={handleMouseMove}
            >
              {locations.length === 0 ? (
                <div className="px-4 py-6 text-sm italic text-white/50 md:py-8">
                  No matching spots yet. Try another search / 当前搜索没有结果。
                </div>
              ) : (
                locations.map((location, index) => {
                  const coverImage =
                    location.image_url ||
                    (location.images && location.images.length > 0 ? location.images[0] : null) ||
                    '/placeholder-image.jpg'
                  const title = getDisplayTitle(location)

                  return (
                    <div
                      key={location.id}
                      ref={(element) => {
                        itemRefs.current[index] = element
                      }}
                      className="snap-start shrink-0"
                      onMouseEnter={() => {
                        onHoverLocation(location)
                        setFocusedIndex(index)
                      }}
                      onMouseLeave={() => onHoverLocation(null)}
                      onClick={() => handleCardClick(location)}
                    >
                      <Card
                        className={cn(
                          'group relative h-[138px] w-[244px] cursor-pointer overflow-hidden rounded-[22px] border border-white/10 bg-black/20 shadow-xl backdrop-blur-sm transition-all duration-300 md:h-[170px] md:w-[300px] md:rounded-xl',
                          index === focusedIndex
                            ? 'z-10 scale-[1.02] ring-2 ring-amber-400 bg-black/40 md:scale-105'
                            : 'hover:-translate-y-2'
                        )}
                      >
                        <div className="absolute inset-0">
                          {coverImage ? (
                            <FallbackImage
                              src={coverImage}
                              alt={title.primary}
                              fill
                              className={cn(
                                'object-cover opacity-90 transition-transform duration-700',
                                index === focusedIndex
                                  ? 'scale-110 opacity-100'
                                  : 'group-hover:scale-110 group-hover:opacity-100'
                              )}
                            />
                          ) : null}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                        </div>

                        <div className="absolute bottom-0 left-0 w-full p-3 text-white md:p-4">
                          <div
                            className={cn(
                              'mb-1 flex items-center gap-1 text-[11px] font-medium text-amber-200 transition-all duration-300 md:text-xs',
                              index === focusedIndex
                                ? 'translate-y-0 opacity-100'
                                : 'translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100'
                            )}
                          >
                            <MapPin className="h-3 w-3" />
                            <span>Open spot</span>
                          </div>
                          <h4
                            className={cn(
                              'line-clamp-1 text-base font-bold leading-tight transition-colors md:text-lg',
                              index === focusedIndex ? 'text-amber-200' : 'group-hover:text-amber-200'
                            )}
                          >
                            {title.primary}
                          </h4>
                          {title.secondary ? (
                            <p className="mt-0.5 line-clamp-1 text-[11px] text-white/75 md:mt-1 md:text-xs">{title.secondary}</p>
                          ) : null}
                          <p className="mt-0.5 line-clamp-1 text-[11px] text-white/70 md:mt-1 md:text-xs">
                            {location.review || location.description || getCategoryLabel(location.category)}
                          </p>
                          <div className="mt-2 flex items-center justify-end md:mt-3 md:justify-between">
                            <span className="hidden text-[11px] text-white/60 md:block">
                              Tap card to open the full spot page
                            </span>
                            <Link
                              href={buildLocationPath(location.name, location.id)}
                              onClick={(event) => event.stopPropagation()}
                              className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-white/90 transition hover:bg-white/20"
                            >
                              View spot
                              <ArrowRight className="h-3 w-3" />
                            </Link>
                          </div>
                        </div>
                      </Card>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
