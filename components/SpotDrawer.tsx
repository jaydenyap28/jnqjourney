'use client'

import {
  Drawer,
  DrawerContent,
} from '@/components/ui/drawer'
import SpotContent from '@/components/SpotContent'

interface Location {
  id: number
  name: string
  name_cn?: string
  category?: string
  latitude: number
  longitude: number
  video_url?: string
  facebook_video_url?: string
  image_url?: string
  images?: string[]
  review?: string
  description?: string
  visit_date?: string
  opening_hours?: string
  address?: string
  tags?: string[]
  regions?: {
    name?: string
    name_cn?: string
    country?: string
  } | null
}

interface SpotDrawerProps {
  location: Location | null
  isOpen: boolean
  onClose: () => void
}

export default function SpotDrawer({ location, isOpen, onClose }: SpotDrawerProps) {
  if (!location) return null

  return (
    <Drawer open={isOpen} onOpenChange={onClose}>
      <DrawerContent className="max-h-[84vh] border-t border-white/10 bg-black/80 text-white backdrop-blur-xl md:max-h-[90vh]">
        <SpotContent location={location} mode="drawer" onClose={onClose} />
      </DrawerContent>
    </Drawer>
  )
}
