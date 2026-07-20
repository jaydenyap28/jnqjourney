import Link from 'next/link'
import { ArrowRight, MapPinned } from 'lucide-react'

import FallbackImage from '@/components/FallbackImage'
import WhatsAppButton from '@/components/WhatsAppButton'
import type { TravelPackage } from '@/lib/server/travel-packages'

export default function TravelPackageCard({ item, compact = false }: { item: TravelPackage; compact?: boolean }) {
  return (
    <article className="overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,31,50,0.96),rgba(8,15,28,0.98))]">
      {item.cover_image ? <div className={`relative ${compact ? 'aspect-[16/8]' : 'aspect-[16/9]'}`}><FallbackImage src={item.cover_image} alt={item.title_zh} fill className="object-cover" /></div> : null}
      <div className="p-5 md:p-6">
        <p className="flex items-center gap-2 text-xs text-amber-200/75"><MapPinned className="h-4 w-4" />{item.destination || 'JnQ Journey'}{item.duration ? ` · ${item.duration}` : ''}</p>
        <h3 className="mt-3 text-2xl font-semibold text-white">{item.title_zh}</h3>
        <p className="mt-3 line-clamp-3 text-sm leading-7 text-white/65">{item.short_description}</p>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Link href={`/packages/${item.slug}`} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black">查看详情 <ArrowRight className="h-4 w-4" /></Link>
          <WhatsAppButton pageType="package" packageName={item.title_zh} source={item.source_code || undefined} message={item.whatsapp_message || undefined} label="WhatsApp 咨询" position="inline" className="px-4" />
        </div>
      </div>
    </article>
  )
}
