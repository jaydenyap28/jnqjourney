'use client'

import WhatsAppButton from '@/components/WhatsAppButton'

interface WhatsAppFloatingButtonProps {
  pageType: 'package' | 'contact'
  packageName?: string
  packageId?: number
  source: string
  message?: string
}

export default function WhatsAppFloatingButton({
  pageType,
  packageName,
  packageId,
  source,
  message,
}: WhatsAppFloatingButtonProps) {
  const enabled = process.env.NEXT_PUBLIC_WHATSAPP_FLOATING_ENABLED !== 'false'
  if (!enabled) return null

  return (
    <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-3 z-[70] md:right-6">
      <WhatsAppButton
        pageType={pageType}
        packageName={packageName}
        packageId={packageId}
        source={source}
        message={message}
        position="floating"
        compactOnMobile
        className="h-12 w-12 border border-white/25 px-0 shadow-[0_14px_40px_rgba(0,0,0,0.34)] md:h-auto md:w-auto md:px-5"
      />
    </div>
  )
}
