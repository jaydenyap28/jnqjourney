'use client'

import { useState } from 'react'
import GuideVideoCard from '@/components/GuideVideoCard'
import { parseNoteVideo } from '@/lib/note-video'
import type { NoteVideoAspect } from '@/lib/notes'

export default function NoteVideo({ url, title, noteSlug = 'preview', aspect = 'auto' }: {
  url?: string | null
  title: string
  noteSlug?: string
  aspect?: NoteVideoAspect
}) {
  const [playing, setPlaying] = useState(false)
  const video = parseNoteVideo(url)
  if (!video) return url?.trim() ? <p className="text-sm text-amber-200">视频链接格式无效，请检查 YouTube 或 Facebook URL。</p> : null
  if (video.provider === 'youtube') {
    return <GuideVideoCard key={video.id} videoId={video.id} title={title} noteSlug={noteSlug} portrait={aspect === 'portrait'} />
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
      <div className={`relative ${aspect === 'portrait' ? 'aspect-[9/16]' : 'aspect-video'}`}>
        {playing ? (
          <iframe
            src={`https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(video.watchUrl)}&show_text=false&width=720`}
            title={title}
            loading="lazy"
            allow="autoplay; encrypted-media; picture-in-picture; web-share"
            allowFullScreen
            className="h-full w-full"
          />
        ) : (
          <button type="button" onClick={() => setPlaying(true)} className="absolute inset-0 w-full text-white focus-visible:ring-2 focus-visible:ring-amber-300">
            播放影片 · Facebook
          </button>
        )}
      </div>
      <a href={video.watchUrl} target="_blank" rel="noopener noreferrer" className="block px-4 py-3 text-sm text-amber-100">无法播放？在 Facebook 观看 ↗</a>
    </div>
  )
}
