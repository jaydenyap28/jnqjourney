'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Expand, X } from 'lucide-react'
import FallbackImage from '@/components/FallbackImage'
import type { GuideDayImage } from '@/lib/guides'
import { trackEvent } from '@/lib/analytics'

export default function GuideGallery({
  images,
  guideSlug,
  dayNumber,
  title = '精选实拍',
}: {
  images: GuideDayImage[]
  guideSlug: string
  dayNumber?: number
  title?: string
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  if (!images.length) return null

  function open(index: number) {
    setActiveIndex(index)
    trackEvent('guide_gallery_open', { guide_slug: guideSlug, day_number: dayNumber })
  }

  function showPrevious() {
    setActiveIndex((index) => index === null ? null : (index - 1 + images.length) % images.length)
  }

  function showNext() {
    setActiveIndex((index) => index === null ? null : (index + 1) % images.length)
  }

  return (
    <>
      <div className="mt-5" data-guide-gallery={dayNumber ? 'day' : 'guide'}>
        <p className="text-xs uppercase tracking-[0.2em] text-white/48">{title}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {images.slice(0, 3).map((image, index) => (
            <button
              key={`${image.url}-${index}`}
              type="button"
              onClick={() => open(index)}
              className="group relative min-h-40 overflow-hidden rounded-xl border border-white/10 bg-black/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            >
              <FallbackImage src={image.url} alt={image.alt} fill sizes="(max-width: 640px) 100vw, 33vw" className="object-cover transition duration-500 group-hover:scale-[1.03]" />
              <span className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent" />
              <Expand className="absolute right-3 top-3 h-4 w-4 text-white drop-shadow" />
              {index === 2 && images.length > 3 ? (
                <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-sm font-semibold text-white">查看全部 {images.length} 张</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
      {activeIndex !== null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="攻略实拍图预览"
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/92 p-4"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setActiveIndex(null)
            if (event.key === 'ArrowLeft') showPrevious()
            if (event.key === 'ArrowRight') showNext()
          }}
          tabIndex={-1}
        >
          <button type="button" onClick={() => setActiveIndex(null)} className="absolute right-4 top-4 rounded-full border border-white/20 bg-black/60 p-3 text-white focus-visible:ring-2 focus-visible:ring-amber-300" aria-label="关闭图片预览">
            <X className="h-5 w-5" />
          </button>
          <button type="button" onClick={showPrevious} className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/20 bg-black/60 p-3 text-white transition hover:bg-black/85 focus-visible:ring-2 focus-visible:ring-amber-300" aria-label="上一张图片">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" onClick={showNext} className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/20 bg-black/60 p-3 text-white transition hover:bg-black/85 focus-visible:ring-2 focus-visible:ring-amber-300" aria-label="下一张图片">
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="relative h-[72vh] w-full max-w-6xl">
            <FallbackImage src={images[activeIndex].url} alt={images[activeIndex].alt} fill sizes="100vw" className="object-contain" />
          </div>
          <div className="absolute inset-x-16 bottom-5 flex justify-center gap-2 overflow-x-auto pb-1">
            {images.map((image, index) => (
              <button
                key={`${image.url}-${index}`}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={`relative h-12 w-16 shrink-0 overflow-hidden border ${index === activeIndex ? 'border-amber-200' : 'border-white/20 opacity-65 hover:opacity-100'}`}
                aria-label={`查看第 ${index + 1} 张图片`}
                aria-current={index === activeIndex ? 'true' : undefined}
              >
                <FallbackImage src={image.url} alt="" fill sizes="64px" className="object-cover" />
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </>
  )
}
