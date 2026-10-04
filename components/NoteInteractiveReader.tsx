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
    <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))]">
      <div className="border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-amber-200/70">
          <List className="h-4 w-4 text-amber-300/80" />
          <span>On this page</span>
        </div>
        <p className="mt-1 font-cjk-display text-lg text-white/90">文章目录</p>
      </div>
      <nav className="max-h-[320px] space-y-1 overflow-y-auto p-3">
        {headings.map((heading) => {
          const isActive = activeId === heading.id
          return (
            <a
              key={heading.id}
              href={`#heading-${heading.id}`}
              onClick={(event) => handleScrollTo(event, heading.id)}
              className={`${heading.level === 3 ? 'ml-3 w-[calc(100%-0.75rem)] text-[13px]' : 'w-full text-sm'} flex items-start gap-2 rounded-xl border-l px-3 py-2 text-left transition-all duration-200 ${
                isActive
                  ? 'border-amber-300 bg-amber-200/[0.07] text-amber-100 font-medium'
                  : 'border-transparent text-white/58 hover:bg-white/[0.04] hover:text-white'
              }`}
            >
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${isActive ? 'bg-amber-300' : 'bg-white/18'}`} />
              <span className="line-clamp-2 leading-relaxed">{heading.content}</span>
            </a>
          )
        })}
      </nav>
    </section>
  )
}
