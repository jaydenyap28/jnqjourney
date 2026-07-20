'use client'

import { usePathname } from 'next/navigation'

import WhatsAppButton from '@/components/WhatsAppButton'

function getPageType(pathname: string) {
  if (pathname.startsWith('/region/')) return 'region' as const
  if (pathname.startsWith('/spot/')) return 'spot' as const
  if (pathname.startsWith('/guide/')) return 'guide' as const
  if (pathname.startsWith('/packages')) return 'package' as const
  if (pathname.startsWith('/notes/')) return 'note' as const
  if (pathname.startsWith('/contact')) return 'contact' as const
  return 'home' as const
}

export default function WhatsAppFloatingButton() {
  const pathname = usePathname() || '/'
  if (pathname.startsWith('/admin')) return null

  const enabled = process.env.NEXT_PUBLIC_WHATSAPP_FLOATING_ENABLED !== 'false'
  if (!enabled) return null

  const pageType = getPageType(pathname)
  const slug = decodeURIComponent(pathname.split('/').filter(Boolean).pop() || '').replace(/[-_]+/g, ' ')
  const source = `JNQ-${pageType.toUpperCase()}-${slug || 'HOME'}-FLOATING`.toUpperCase()

  const positionClass = pathname === '/'
    ? 'bottom-[calc(8.5rem+env(safe-area-inset-bottom))] md:bottom-6'
    : 'bottom-[max(1rem,env(safe-area-inset-bottom))] md:bottom-6'

  return (
    <div className={`fixed right-3 z-[70] md:right-6 ${positionClass}`}>
      <WhatsAppButton
        pageType={pageType}
        region={pageType === 'region' ? slug : undefined}
        spotName={pageType === 'spot' ? slug : undefined}
        guideTitle={pageType === 'guide' ? slug : undefined}
        packageName={pageType === 'package' && pathname !== '/packages' ? slug : undefined}
        source={source}
        position="floating"
        className="border border-white/25 px-4 shadow-[0_14px_40px_rgba(0,0,0,0.34)] md:px-5"
      />
    </div>
  )
}
