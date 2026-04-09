import type { Metadata } from 'next'
import { Cormorant_Garamond, Noto_Sans_SC, Noto_Serif_SC, Poppins } from 'next/font/google'
import 'mapbox-gl/dist/mapbox-gl.css'
import './globals.css'
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

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: 'JnQ Journey | Jayden & Qing 一起看世界',
    template: '%s | JnQ Journey',
  },
  description:
    'JnQ Journey by Jayden & Qing，一起看世界。探索景点、美食、住宿、完整游记攻略与地图灵感，适合中英文旅客浏览与规划行程。',
  keywords: [
    'JnQ Journey',
    'Jayden & Qing',
    'travel guide Asia',
    'Malaysia travel',
    'Japan travel',
    'travel map',
    '景点地图',
    '旅行攻略',
    '美食推荐',
    '住宿推荐',
  ],
  openGraph: {
    type: 'website',
    siteName: 'JnQ Journey',
    title: 'JnQ Journey | Jayden & Qing 一起看世界',
    description:
      '发现景点、美食、住宿、区域灵感与完整游记攻略，适合中英文旅客查看的旅行内容网站。',
    url: siteUrl,
    locale: 'zh_CN',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'JnQ Journey | Jayden & Qing 一起看世界',
    description: '发现景点、美食、住宿、区域灵感与完整游记攻略，适合中英文旅客查看。',
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
        <PageViewTracker />
        {children}
      </body>
    </html>
  )
}
