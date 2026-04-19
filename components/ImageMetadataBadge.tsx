'use client'

import { useState, useEffect } from 'react'

export function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

export function getImageSource(url: string) {
  if (!url) return 'Unknown'
  if (url.includes('ibb.co') || url.includes('imgbb.com')) return 'ImgBB'
  if (url.includes('supabase.co')) return 'Supabase'
  if (url.includes('fbcdn.net')) return 'Facebook'
  return 'Other'
}

export default function ImageMetadataBadge({ url, className }: { url: string, className?: string }) {
  const [size, setSize] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const source = getImageSource(url)

  useEffect(() => {
    let mounted = true
    if (!url) {
      setLoading(false)
      return
    }

    fetch(`/api/admin/image-size?url=${encodeURIComponent(url)}`)
      .then((res) => res.json())
      .then((data) => {
        if (mounted && data.size) {
          setSize(data.size)
        }
      })
      .catch((e) => console.error(e))
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [url])

  let sourceColor = 'bg-gray-500'
  if (source === 'ImgBB') sourceColor = 'bg-blue-600'
  if (source === 'Supabase') sourceColor = 'bg-emerald-600'
  
  // Highlight large images (e.g., > 1MB)
  const isLarge = size && size > 1024 * 1024

  return (
    <div className={`flex flex-col gap-1 items-end pointer-events-none z-10 ${className || 'absolute top-1 right-1'}`}>
      <div className={`rounded-sm px-1.5 py-0.5 text-[10px] text-white shadow-sm font-medium ${sourceColor}`}>
        {source}
      </div>
      {!loading && size && (
        <div className={`rounded-sm px-1.5 py-0.5 text-[10px] text-white shadow-sm font-medium ${isLarge ? 'bg-red-500 animate-pulse' : 'bg-black/65'}`}>
          {formatBytes(size)}
        </div>
      )}
    </div>
  )
}
