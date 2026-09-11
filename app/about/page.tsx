import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, MessageCircle } from 'lucide-react'

import PolicyPageLayout from '@/components/PolicyPageLayout'
import TrackedLink from '@/components/TrackedLink'
import WhatsAppButton from '@/components/WhatsAppButton'
import { CREATORS, SOCIAL_LINKS } from '@/lib/brand'
import { buildOpenGraphData, buildTwitterCardData } from '@/lib/seo'
import { absoluteUrl } from '@/lib/site'

const title = '关于 JnQ Journey｜Jayden & Qing 一起看世界'
const description = '认识 JnQ Journey 与 Jayden & Qing。我们通过实拍照片、影片、景点资料、路线攻略和真实旅行经验，分享马来西亚及海外旅游内容。'

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: '/about' },
  openGraph: buildOpenGraphData(title, description, '/about'),
  twitter: buildTwitterCardData(title, description),
}

import AboutPageView from '@/components/AboutPageView'
export default AboutPageView
