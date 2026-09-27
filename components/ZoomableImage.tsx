'use client'

import { useEffect, useId, useReducer, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, X } from 'lucide-react'

import { CLOSED_IMAGE_LIGHTBOX, reduceImageLightbox } from '@/lib/image-lightbox'

interface ZoomableImageProps {
  src: string
  alt: string
  caption?: string | null
  children: ReactNode
  className?: string
  overlayLabel?: string
  fallbackSrc?: string
}

const DEFAULT_FALLBACK_SRC = '/placeholder-image.jpg'

export default function ZoomableImage({
  src,
  alt,
  caption,
  children,
  className = '',
  overlayLabel = '查看大图',
  fallbackSrc = DEFAULT_FALLBACK_SRC,
}: ZoomableImageProps) {
  const [state, dispatch] = useReducer(reduceImageLightbox, CLOSED_IMAGE_LIGHTBOX)
  const [mounted, setMounted] = useState(false)
  const [resolvedSrc, setResolvedSrc] = useState(src)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const captionId = useId()

  useEffect(() => setMounted(true), [])
  useEffect(() => setResolvedSrc(src), [src])

  useEffect(() => {
    if (!state.isOpen) return

    const body = document.body
    const previousOverflow = body.style.overflow
    const previousPaddingRight = body.style.paddingRight
    const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth)
    const currentPaddingRight = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0
    const returnFocusTo = triggerRef.current

    body.style.overflow = 'hidden'
    if (scrollbarWidth) body.style.paddingRight = `${currentPaddingRight + scrollbarWidth}px`

    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus())
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        dispatch({ type: 'close' })
      } else if (event.key === 'Tab') {
        event.preventDefault()
        closeButtonRef.current?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleKeyDown)
      body.style.overflow = previousOverflow
      body.style.paddingRight = previousPaddingRight
      returnFocusTo?.focus()
    }
  }, [state.isOpen])

  const close = () => dispatch({ type: 'close' })
  const dialog = state.isOpen ? (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={caption ? captionId : undefined}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm md:p-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <h2 id={titleId} className="sr-only">{alt || '图片预览'}</h2>
      <button
        ref={closeButtonRef}
        type="button"
        onClick={close}
        aria-label="关闭图片预览"
        className="absolute right-4 top-4 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white/85 shadow-lg backdrop-blur transition hover:border-white/35 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 md:right-6 md:top-6"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>

      <div
        className="relative flex max-h-full max-w-full flex-col items-center gap-3"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {/* The original URL is intentional here: maps and menus should open without a cropped derivative. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={resolvedSrc}
          alt={alt}
          decoding="async"
          onError={() => {
            if (resolvedSrc !== fallbackSrc) setResolvedSrc(fallbackSrc)
          }}
          className={`block h-auto w-auto max-w-[calc(100vw-2rem)] object-contain md:max-w-[calc(100vw-4rem)] ${caption ? 'max-h-[calc(100dvh-8rem)]' : 'max-h-[calc(100dvh-2rem)] md:max-h-[calc(100dvh-4rem)]'}`}
        />
        {caption ? (
          <p id={captionId} className="max-w-3xl shrink-0 px-4 text-center text-sm leading-6 text-white/65">
            {caption}
          </p>
        ) : null}
      </div>
    </div>
  ) : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => dispatch({ type: 'open' })}
        aria-label={`查看大图：${alt || '图片'}`}
        className={`group/zoom relative block w-full cursor-zoom-in text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${className}`}
      >
        {children}
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/15 opacity-0 transition duration-200 group-hover/zoom:opacity-100 group-focus-visible/zoom:opacity-100" aria-hidden="true">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/65 px-3 py-1.5 text-xs font-medium tracking-wide text-white/90 shadow-lg backdrop-blur-sm">
            <Maximize2 className="h-3.5 w-3.5" />
            {overlayLabel}
          </span>
        </span>
      </button>
      {mounted && dialog ? createPortal(dialog, document.body) : null}
    </>
  )
}
