import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowRight, CalendarDays, Wallet } from 'lucide-react'
import SiteFooter from '@/components/SiteFooter'
import FallbackImage from '@/components/FallbackImage'
import { getGuideDisplayPair } from '@/lib/content-display'
import { readPublicGuides } from '@/lib/server/public-content-store'
import { resolvePublicData } from '@/lib/server/public-data-resolver'
import { resolveGuidePublicMedia } from '@/lib/server/public-content-media'

export const metadata: Metadata = {
  title: '完整旅程攻略 | JnQ Journey',
  description: '浏览 Jayden & Qing 一起看世界的完整旅程路线、预算拆解与自由行攻略。',
  alternates: {
    canonical: '/guide',
  },
  openGraph: {
    title: '完整旅程攻略 | JnQ Journey',
    description: '浏览 Jayden & Qing 一起看世界的完整旅程路线、预算拆解与自由行攻略。',
    url: '/guide',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '完整旅程攻略 | JnQ Journey',
    description: '浏览 Jayden & Qing 一起看世界的完整旅程路线、预算拆解与自由行攻略。',
  },
}

export const revalidate = 600 // Cache for 10 minutes

import GuideIndexView from '@/components/GuideIndexView'
export default async function Page(){ const [storedGuides,{locations}]=await Promise.all([readPublicGuides(),resolvePublicData()]); const guides=storedGuides.map(g=>resolveGuidePublicMedia(g,locations)); return <GuideIndexView guides={guides}/> }
