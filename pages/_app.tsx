import type { AppProps } from 'next/app'
import { Cormorant_Garamond, Noto_Sans_SC, Noto_Serif_SC, Poppins } from 'next/font/google'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import '@/app/globals.css'
import 'mapbox-gl/dist/mapbox-gl.css'
const sans = Poppins({subsets:['latin'],weight:['300','400','600','800'],variable:'--font-poppins'})
const cjk = Noto_Sans_SC({subsets:['latin'],weight:['300','400','500','700'],variable:'--font-noto-sans-sc'})
const serif = Cormorant_Garamond({subsets:['latin'],weight:['400','500','600','700'],variable:'--font-cormorant-garamond'})
const cjkSerif = Noto_Serif_SC({subsets:['latin'],weight:['400','500','600','700'],variable:'--font-noto-serif-sc'})
export default function App({Component,pageProps}:AppProps) {
  return <div className={`${sans.variable} ${cjk.variable} ${serif.variable} ${cjkSerif.variable} font-sans antialiased`}><Component {...pageProps}/><Analytics/><SpeedInsights/></div>
}
