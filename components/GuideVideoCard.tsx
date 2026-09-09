'use client'

import { useState } from 'react'
import { ExternalLink, Play } from 'lucide-react'
import FallbackImage from '@/components/FallbackImage'
import { trackEvent } from '@/lib/analytics'
import { ui, type Locale } from '@/lib/locale'

export default function GuideVideoCard({
  videoId,
  title,
  guideSlug,
  dayNumber,
  locale = 'zh',
}: {
  videoId: string
  title: string
  guideSlug: string
  dayNumber?: number
  locale?: Locale
}) {
  const [playing, setPlaying] = useState(false)
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`
  const videoLabel = locale === 'en' ? 'Travel Video' : dayNumber ? '当日旅行影片' : '完整旅行影片'

  function startVideo() {
    setPlaying(true)
    trackEvent('guide_video_click', {
      guide_slug: guideSlug,
      day_number: dayNumber,
      cta_position: dayNumber ? 'day_video' : 'guide_video',
    })
  }

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
      <div className="relative aspect-video">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0`}
            title={`${title} ${videoLabel}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="h-full w-full"
          />
        ) : (
          <button
            type="button"
            onClick={startVideo}
            className="group absolute inset-0 block w-full overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-300"
            aria-label={`${ui(locale, 'playVideo')}: ${title} ${videoLabel}`}
          >
            <FallbackImage
              src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
              alt={`${title} ${videoLabel}${locale === 'en' ? ' thumbnail' : '缩略图'}`}
              fill
              unoptimized
              sizes="(max-width: 768px) 100vw, 760px"
              className="object-cover opacity-80 transition duration-500 group-hover:scale-[1.02] group-hover:opacity-95"
            />
            <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-black/10" />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/35 bg-black/55 text-white shadow-2xl backdrop-blur-md transition group-hover:scale-105 group-hover:bg-red-600">
                <Play className="ml-1 h-6 w-6 fill-current" />
              </span>
            </span>
          </button>
        )}
      </div>
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <p className="text-sm font-medium text-white/82">{title}</p>
        <a
          href={watchUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackEvent('guide_video_click', { guide_slug: guideSlug, day_number: dayNumber, cta_position: 'youtube_link' })}
          className="inline-flex shrink-0 items-center gap-1.5 text-xs text-red-100 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
        >
          {locale === 'en' ? 'Watch on YouTube' : 'YouTube 观看'} <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  )
}
