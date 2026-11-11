'use client'

import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import FallbackImage from './FallbackImage'
import { usePublicLocale } from './PublicLocale'
import { isConfirmedUnavailablePublicImage } from '@/lib/unavailable-public-media'

export default function PriceInfoImage({ url, index }: { url: string; index: number }) {
  const locale = usePublicLocale()
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  if (isConfirmedUnavailablePublicImage(url) || failedUrl === url) {
    return <div className="flex aspect-[4/3] items-center justify-center rounded-[22px] border border-white/10 bg-white/5 p-4 text-center text-sm leading-6 text-white/65" role="note">
      {locale === 'en' ? 'Reference image unavailable. No replacement image has been verified.' : '参考图片暂不可用，尚未核实可替代的原图。'}
    </div>
  }
  return <a href={url} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-[22px] border border-white/10 bg-white/5 transition hover:-translate-y-1 hover:bg-white/10">
    <div className="relative aspect-[4/3] overflow-hidden">
      <FallbackImage src={url} alt={locale === 'en' ? `Price reference ${index + 1}` : `价目参考图 ${index + 1}`} fill sizes="(max-width: 768px) 100vw, 420px" className="object-cover transition duration-500 group-hover:scale-105" onError={() => setFailedUrl(url)} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />
    </div>
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-white/88">
      <span>{locale === 'en' ? 'Open image' : '查看原图'}</span><ExternalLink className="h-4 w-4" />
    </div>
  </a>
}
