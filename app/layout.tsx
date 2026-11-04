import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { siteFontClassName } from '@/lib/build-fonts.generated'
import 'mapbox-gl/dist/mapbox-gl.css'
import './globals.css'
import GoogleAnalytics from '@/components/GoogleAnalytics'
import { getSiteUrl } from '@/lib/site'
import PageViewTracker from '@/components/PageViewTracker'
import SiteStructuredData from '@/components/SiteStructuredData'
import PublicLanguageControl from '@/components/PublicLanguageControl'

import { buildMetaDescription, buildOpenGraphData, buildTwitterCardData } from '@/lib/seo'

const siteUrl = getSiteUrl()
const googleAnalyticsId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim()
const previewReadOnly = process.env.VERCEL_ENV === 'preview'

const defaultTitle = 'JnQ Journey | Jayden & Qing'
const defaultDesc = buildMetaDescription('JnQ Journey by Jayden & Qing. Explore spots, food, stays, maps, and full travel guides built for both Chinese and English-speaking travelers.')

export const metadata: Metadata = {
  metadataBase: siteUrl,
  alternates: {
    canonical: '/',
  },
  title: {
    default: defaultTitle,
    template: '%s | JnQ Journey',
  },
  description: defaultDesc,
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
    ...buildOpenGraphData(defaultTitle, defaultDesc, '/'),
    siteName: 'JnQ Journey',
    locale: 'en_US',
  },
  twitter: buildTwitterCardData(defaultTitle, defaultDesc),
  icons: {
    icon: [
      { url: '/icon.png?v=3', type: 'image/png' },
    ],
    apple: [{ url: '/apple-icon.png?v=3', type: 'image/png' }],
    shortcut: ['/icon.png?v=3'],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh" translate="yes" suppressHydrationWarning>
      <body
        className={`${siteFontClassName} font-sans antialiased`}
      >
        <SiteStructuredData />
        {!previewReadOnly && <Suspense fallback={null}>
          <GoogleAnalytics measurementId={googleAnalyticsId} />
        </Suspense>}
        {!previewReadOnly && <PageViewTracker />}
        <PublicLanguageControl />
        {children}
        {!previewReadOnly && <Analytics />}
        {!previewReadOnly && <SpeedInsights />}
      </body>
    </html>
  )
}

