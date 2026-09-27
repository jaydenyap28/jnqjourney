'use client'

import { type MouseEvent as ReactMouseEvent, useEffect, useState } from 'react'
import { List } from 'lucide-react'

interface HeadingItem {
  id: string
  content: string
  level: 2 | 3
}

interface NoteInteractiveReaderProps {
  headings: HeadingItem[]
}

// 1. Core Reader Controller: Progress Bar
export default function NoteInteractiveReader({ headings }: NoteInteractiveReaderProps) {
  const [progress, setProgress] = useState(0)

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

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-[3px] w-full bg-white/10">
      <div
        className="h-full bg-gradient-to-r from-amber-400 via-emerald-400 to-amber-500 transition-all duration-75 ease-out shadow-[0_0_12px_rgba(245,158,11,0.6)]"
        style={{ width: `${progress}%` }}
      />
    </div>
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
              className={`${heading.level === 3 ? 'ml-4 w-[calc(100%-1rem)] text-[13px]' : 'w-full text-sm'} text-left rounded-xl px-3 py-2 transition-all duration-200 flex items-start gap-2 ${
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
