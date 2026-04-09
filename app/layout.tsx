import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Cormorant_Garamond, Noto_Sans_SC, Noto_Serif_SC, Poppins } from 'next/font/google'
import 'mapbox-gl/dist/mapbox-gl.css'
import './globals.css'
import GoogleAnalytics from '@/components/GoogleAnalytics'
import { getSiteUrl } from '@/lib/site'
import PageViewTracker from '@/components/PageViewTracker'

const notoSansSC = Noto_Sans_SC({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
  variable: '--font-noto-sans-sc',
})

const notoSerifSC = Noto_Serif_SC({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-serif-sc',
})

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '600', '800'],
  variable: '--font-poppins',
})

const cormorantGaramond = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-cormorant-garamond',
})

const siteUrl = getSiteUrl()
const googleAnalyticsId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim()

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: 'JnQ Journey | Jayden & Qing',
    template: '%s | JnQ Journey',
  },
  description:
    'JnQ Journey by Jayden & Qing. Explore spots, food, stays, maps, and full travel guides built for both Chinese and English-speaking travelers.',
  keywords: [
    'JnQ Journey',
    'Jayden & Qing',
    'travel guide Asia',
    'Malaysia travel',
    'Japan travel',
    'travel map',
    'spot guide',
    'food guide',
    'stay guide',
    'travel itinerary',
  ],
  openGraph: {
    type: 'website',
    siteName: 'JnQ Journey',
    title: 'JnQ Journey | Jayden & Qing',
    description:
      'Discover spots, food, stays, region hubs, and complete travel guides for your next trip.',
    url: siteUrl,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'JnQ Journey | Jayden & Qing',
    description: 'Discover spots, food, stays, region hubs, and complete travel guides.',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={`${poppins.variable} ${notoSansSC.variable} ${notoSerifSC.variable} ${cormorantGaramond.variable} font-sans antialiased`}
      >
        <Suspense fallback={null}>
          <GoogleAnalytics measurementId={googleAnalyticsId} />
        </Suspense>
        <PageViewTracker />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}

