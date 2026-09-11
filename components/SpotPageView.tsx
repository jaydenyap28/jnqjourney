import type { ComponentProps, ReactNode } from 'react'
import SpotContent from './SpotContent'
import SiteFooter from './SiteFooter'
export default function SpotPageView({children,dataSource,...props}:ComponentProps<typeof SpotContent>&{children?:ReactNode;dataSource?:string}) {
  return <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.15),transparent_22%),linear-gradient(180deg,#111827_0%,#020617_48%,#000000_100%)] text-white" data-jnq-data-source={dataSource}>
    {children}<SpotContent {...props} mode="page"/><SiteFooter/>
  </main>
}
