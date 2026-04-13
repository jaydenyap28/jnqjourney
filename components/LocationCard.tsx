'use client'

import React from 'react'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PlayCircle, MapPin } from 'lucide-react'
import Image from 'next/image'
import { getVisibleLocationTags } from '@/lib/tag-utils'

interface Location {
  id: number
  name: string
  latitude: number
  longitude: number
  review?: string
  description?: string
  visit_date?: string
  video_url?: string
  image_url?: string
  images?: string[] // New field
  tags?: string[]
}

interface LocationCardProps {
  location: Location
  onClick: () => void
}

export default function LocationCard({ location, onClick }: LocationCardProps) {
  // Determine the cover image: prioritize explicit image_url (cover), fallback to first image in gallery
  const coverImage = location.image_url || (location.images && location.images.length > 0 ? location.images[0] : undefined)
  const visibleTags = getVisibleLocationTags(location.tags)

  return (
    <Card 
      className="group cursor-pointer overflow-hidden hover:shadow-lg transition-all duration-300 border-none shadow-md"
      onClick={onClick}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {coverImage ? (
          <Image
            src={coverImage}
            alt={location.name}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-200 dark:bg-gray-800">
            <MapPin className="w-12 h-12 text-gray-400" />
          </div>
        )}
        
        {/* Category Badge (First tag) */}
        {visibleTags.length > 0 && (
          <Badge className="absolute top-3 left-3 bg-white/90 text-black hover:bg-white backdrop-blur-sm shadow-sm">
            {visibleTags[0]}
          </Badge>
        )}
      </div>

      <CardContent className="p-4">
        <div className="flex justify-between items-start gap-2 mb-2">
          <h3 className="font-bold text-lg leading-tight line-clamp-1">{location.name}</h3>
        </div>
        
        {location.review ? (
          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
            &ldquo;{location.review}&rdquo;
          </p>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No review yet.
          </p>
        )}
      </CardContent>

      <CardFooter className="p-4 pt-0 flex justify-between items-center text-sm text-muted-foreground">
        <div className="flex items-center gap-1">
          {location.video_url && (
            <span className="flex items-center gap-1 text-primary font-medium">
              <PlayCircle className="w-4 h-4" />
              Watch Video
            </span>
          )}
        </div>
        {location.visit_date && (
            <span className="text-xs opacity-70">
              {new Date(location.visit_date).toLocaleDateString()}
            </span>
        )}
      </CardFooter>
    </Card>
  )
}
