'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function getSessionId() {
  if (typeof window === 'undefined') return ''
  const key = 'jnq_session_id'
  const existing = window.localStorage.getItem(key)
  if (existing) return existing
  const value = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  window.localStorage.setItem(key, value)
  return value
}

function deriveContentMeta(pathname: string) {
  if (pathname.startsWith('/spot/')) {
    return { contentType: 'spot', contentSlug: pathname.replace('/spot/', '') }
  }
  if (pathname.startsWith('/guide/')) {
    return { contentType: 'guide', contentSlug: pathname.replace('/guide/', '') }
  }
  if (pathname.startsWith('/region/')) {
    return { contentType: 'region', contentSlug: pathname.replace('/region/', '') }
  }
  if (pathname === '/') {
    return { contentType: 'home', contentSlug: 'home' }
  }
  return { contentType: 'page', contentSlug: pathname.replace(/^\//, '') || 'home' }
}

export default function PageViewTracker() {
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname) return
    if (pathname.startsWith('/admin') || pathname.startsWith('/api')) return

    const sessionId = getSessionId()
    const dedupeKey = `pageview:${pathname}:${new Date().toISOString().slice(0, 16)}`
    if (window.sessionStorage.getItem(dedupeKey)) return
    window.sessionStorage.setItem(dedupeKey, '1')

    const { contentType, contentSlug } = deriveContentMeta(pathname)

    void supabase.from('page_views').insert({
      path: pathname,
      content_type: contentType,
      content_slug: contentSlug,
      session_id: sessionId,
      referrer: typeof document !== 'undefined' ? document.referrer : '',
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    })
  }, [pathname])

  return null
}
