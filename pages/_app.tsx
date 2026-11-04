import type { AppProps } from 'next/app'
import { siteFontClassName } from '@/lib/site-fonts'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import '@/app/globals.css'
import 'mapbox-gl/dist/mapbox-gl.css'
export default function App({Component,pageProps}:AppProps) {
  return <div className={`${siteFontClassName} font-sans antialiased`}><Component {...pageProps}/>{process.env.JNQ_PREVIEW_READ_ONLY !== '1' && <><Analytics/><SpeedInsights/></>}</div>
}
