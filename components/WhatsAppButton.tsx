'use client'

import { MessageCircle } from 'lucide-react'
import { usePathname } from 'next/navigation'

import { getDeviceType, trackEvent } from '@/lib/analytics'
import { buildWhatsAppUrl, type WhatsAppPageType } from '@/lib/whatsapp'

interface WhatsAppButtonProps {
  className?: string
  label?: string
  pageType?: WhatsAppPageType
  region?: string
  spotName?: string
  guideTitle?: string
  packageName?: string
  packageId?: number
  optionId?: number
  optionName?: string
  accommodationName?: string
  villageName?: string
  resortName?: string
  regionName?: string
  priceFrom?: string
  priceUnit?: string
  source?: string
  position?: string
  message?: string
  compactOnMobile?: boolean
  track?: boolean
}

export default function WhatsAppButton({
  className = '',
  label = 'WhatsApp 咨询',
  pageType = 'home',
  region,
  spotName,
  guideTitle,
  packageName,
  packageId,
  optionId,
  optionName,
  accommodationName,
  villageName,
  resortName,
  regionName,
  priceFrom,
  priceUnit,
  source,
  position = 'inline',
  message,
  compactOnMobile = false,
  track = true,
}: WhatsAppButtonProps) {
  const pathname = usePathname()
  const href = buildWhatsAppUrl({ pageType, region, spotName, guideTitle, packageName, source, message })

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={compactOnMobile ? label : undefined}
      aria-label={`${label}，将在新窗口打开 WhatsApp`}
      onClick={() => {
        if (!track) return
        trackEvent(pageType === 'package' ? 'package_cta_click' : 'whatsapp_click', {
          page_path: pathname,
          page_type: pageType,
          page_title: typeof document === 'undefined' ? undefined : document.title,
          package_name: packageName,
          package_id: packageId,
          option_id: optionId,
          option_name: optionName,
          accommodation_name: accommodationName,
          village_name: villageName,
          resort_name: resortName,
          region_name: regionName,
          price_from: priceFrom,
          price_unit: priceUnit,
          cta_position: position,
          cta_text: label,
          device_type: getDeviceType(),
          source_code: source,
        })
        if (pageType === 'package') {
          trackEvent('package_enquiry_start', {
            page_path: pathname,
            page_type: pageType,
            package_name: packageName,
            package_id: packageId,
            option_id: optionId,
            option_name: optionName,
            accommodation_name: accommodationName,
            village_name: villageName,
            resort_name: resortName,
            region_name: regionName,
            price_from: priceFrom,
            price_unit: priceUnit,
            cta_position: position,
            device_type: getDeviceType(),
            source_code: source,
          })
        }
      }}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-[#062d18] shadow-[0_10px_30px_rgba(37,211,102,0.22)] transition hover:-translate-y-0.5 hover:bg-[#35df76] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${className}`}
    >
      <MessageCircle className="h-4 w-4" aria-hidden="true" />
      <span className={compactOnMobile ? 'sr-only md:not-sr-only' : undefined}>{label}</span>
    </a>
  )
}
