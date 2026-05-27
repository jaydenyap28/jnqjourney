'use client'

import { type MouseEvent as ReactMouseEvent, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, X, List } from 'lucide-react'
import FallbackImage from '@/components/FallbackImage'

interface HeadingItem {
  id: string
  content: string
}

interface NoteInteractiveReaderProps {
  headings: HeadingItem[]
}

// 1. Core Reader Controller: Progress Bar & Lightbox Click Delegation
export default function NoteInteractiveReader({ headings }: NoteInteractiveReaderProps) {
  const [progress, setProgress] = useState(0)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [allImages, setAllImages] = useState<Array<{ src: string; alt: string; caption: string }>>([])

  // Track scrolling depth for the glowing progress bar
  useEffect(() => {
    const handleScroll = () => {
      const totalScroll = document.documentElement.scrollHeight - window.innerHeight
      if (totalScroll > 0) {
        setProgress((window.scrollY / totalScroll) * 100)
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    // Initial check
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Lightbox click delegation & image list compilation
  useEffect(() => {
    const handleTriggerClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('.lightbox-trigger')
      if (!target) return

      const src = target.getAttribute('data-lightbox-src')
      if (!src) return

      // Extract all current lightbox triggers in the document to allow carousel navigation
      const triggers = Array.from(document.querySelectorAll('.lightbox-trigger'))
      const imagesList = triggers
        .map((el) => ({
          src: el.getAttribute('data-lightbox-src') || '',
          alt: el.getAttribute('data-lightbox-alt') || '',
          caption: el.getAttribute('data-lightbox-caption') || '',
        }))
        .filter((img) => img.src)

      setAllImages(imagesList)

      const clickedIndex = imagesList.findIndex((img) => img.src === src)
      if (clickedIndex !== -1) {
        setLightboxIndex(clickedIndex)
      } else {
        setLightboxIndex(0)
      }
    }

    document.addEventListener('click', handleTriggerClick)
    return () => document.removeEventListener('click', handleTriggerClick)
  }, [])

  // Keyboard navigation for Lightbox
  useEffect(() => {
    if (lightboxIndex === null) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setLightboxIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : allImages.length - 1))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        setLightboxIndex((prev) => (prev !== null && prev < allImages.length - 1 ? prev + 1 : 0))
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setLightboxIndex(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lightboxIndex, allImages])

  const activeImage = lightboxIndex !== null ? allImages[lightboxIndex] : null

  return (
    <>
      {/* Sleek Top Sticky Glowing Reading Progress Bar */}
      <div className="fixed top-0 left-0 right-0 z-[100] h-[3px] w-full bg-white/10">
        <div
          className="h-full bg-gradient-to-r from-amber-400 via-emerald-400 to-amber-500 transition-all duration-75 ease-out shadow-[0_0_12px_rgba(245,158,11,0.6)]"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Immersive Lightbox Modal Overlay */}
      {lightboxIndex !== null && activeImage && (
        <div className="fixed inset-0 z-[200] flex flex-col justify-between bg-black/95 backdrop-blur-md transition-all duration-300 animate-in fade-in">
          {/* Top Action Bar */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-black/45 backdrop-blur-sm">
            <span className="text-sm font-medium tracking-widest text-white/50">
              {lightboxIndex + 1} / {allImages.length}
            </span>
            <button
              type="button"
              onClick={() => setLightboxIndex(null)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Main Visual Carousel Wrapper */}
          <div className="relative flex flex-1 items-center justify-center px-4 py-8 select-none">
            {/* Left Nav Arrow */}
            <button
              type="button"
              onClick={() => setLightboxIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : allImages.length - 1))}
              className="absolute left-4 sm:left-8 z-10 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/70 backdrop-blur-md transition hover:bg-white/10 hover:text-white active:scale-95"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>

            {/* Middle Zoomable Image Container */}
            <div className="relative max-h-[75vh] max-w-[90vw] aspect-[16/10] w-[1100px] overflow-hidden rounded-[24px] border border-white/10 bg-white/5 shadow-2xl animate-in zoom-in-95 duration-200">
              <FallbackImage
                src={activeImage.src}
                alt={activeImage.alt}
                fill
                sizes="(max-width: 1200px) 100vw, 1100px"
                className="object-contain"
              />
            </div>

            {/* Right Nav Arrow */}
            <button
              type="button"
              onClick={() => setLightboxIndex((prev) => (prev !== null && prev < allImages.length - 1 ? prev + 1 : 0))}
              className="absolute right-4 sm:right-8 z-10 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/70 backdrop-blur-md transition hover:bg-white/10 hover:text-white active:scale-95"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </div>

          {/* Bottom Captions Overlay */}
          <div className="border-t border-white/5 bg-black/45 backdrop-blur-sm px-6 py-5 text-center">
            <p className="text-base text-white font-medium max-w-3xl mx-auto leading-relaxed">
              {activeImage.alt}
            </p>
            {activeImage.caption && (
              <p className="mt-1 text-sm text-white/55 italic max-w-3xl mx-auto">
                {activeImage.caption}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}

// 2. Responsive Table of Contents Sidebar Widget
export function NoteTableOfContents({ headings }: NoteInteractiveReaderProps) {
  const [activeId, setActiveId] = useState<string>('')

  useEffect(() => {
    if (!headings.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        // Look for intersecting headings
        const visibleEntries = entries.filter((entry) => entry.isIntersecting)
        if (visibleEntries.length > 0) {
          // Use the first visible entry's ID
          const rawId = visibleEntries[0].target.id
          const headingId = rawId.replace('heading-', '')
          setActiveId(headingId)
        }
      },
      {
        rootMargin: '-80px 0px -75% 0px', // Trigger when heading passes 80px from top down to 25% of viewport
        threshold: 0.1,
      }
    )

    headings.forEach((heading) => {
      const el = document.getElementById(`heading-${heading.id}`)
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [headings])

  if (!headings.length) return null

  const handleScrollTo = (event: ReactMouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault()
    const targetId = `heading-${id}`
    const el = document.getElementById(targetId)
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 96
      window.scrollTo({ top, behavior: 'smooth' })
      window.history.replaceState(null, '', `#${targetId}`)
    }
  }

  return (
    <section className="rounded-[28px] border border-white/10 bg-white/5 p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-amber-300/80 mb-4">
        <List className="h-4 w-4 text-amber-400" />
        <span>目录 / Table of Contents</span>
      </div>
      <nav className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
        {headings.map((heading) => {
          const isActive = activeId === heading.id
          return (
            <a
              key={heading.id}
              href={`#heading-${heading.id}`}
              onClick={(event) => handleScrollTo(event, heading.id)}
              className={`w-full text-left rounded-xl px-3 py-2 text-sm transition-all duration-200 flex items-start gap-2 ${
                isActive
                  ? 'bg-amber-400/10 text-amber-200 border-l-2 border-amber-400 pl-2 font-medium'
                  : 'text-white/60 hover:text-white hover:bg-white/5 border-l border-transparent'
              }`}
            >
              <span className="shrink-0 text-white/20 mt-0.5">•</span>
              <span className="line-clamp-2 leading-relaxed">{heading.content}</span>
            </a>
          )
        })}
      </nav>
    </section>
  )
}
