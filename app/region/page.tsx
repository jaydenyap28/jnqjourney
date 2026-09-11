import EntityName from '@/components/EntityName'
import Link from 'next/link'
import type { Metadata } from 'next'
import FallbackImage from '@/components/FallbackImage'
import SiteFooter from '@/components/SiteFooter'
import { Badge } from '@/components/ui/badge'
import { buildRegionPath } from '@/lib/region-routing'
import { fetchTopRegions } from '@/lib/server/public-location-data'

export const metadata: Metadata = {
  title: '区域目录 | JnQ Journey',
  description: '浏览 JnQ Journey 已整理的区域目录，快速进入每个地区的景点与美食页面。',
  alternates: {
    canonical: '/region',
  },
}

import RegionIndexView from '@/components/RegionIndexView'
export default async function Page(){ const regions=await fetchTopRegions(120); return <RegionIndexView regions={regions}/> }
