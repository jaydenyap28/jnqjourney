'use client'

import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/admin-fetch'

export function useDraftImage(source: string) {
  const name = source.match(/^\/admin-draft-media\/([a-f0-9]{64}\.(?:png|jpg|webp|gif))$/)?.[1]
  const [preview, setPreview] = useState<{ name: string, url: string }>()
  useEffect(() => {
    if (!name) return
    const abort = new AbortController()
    let objectUrl: string | undefined
    void (async () => {
      try {
        const response = await adminFetch('/api/admin/media?name=' + name, { signal: abort.signal })
        if (!response.ok) return
        const blob = await response.blob()
        if (abort.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setPreview({ name, url: objectUrl })
      } catch { /* display the existing image placeholder */ }
    })()
    return () => {
      abort.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [name])
  return name ? preview?.name === name ? preview.url : '/placeholder-image.jpg' : source
}
