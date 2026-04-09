import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowRight } from 'lucide-react'

import SiteFooter from '@/components/SiteFooter'
import { readPublishedNotes } from '@/lib/server/notes-store'

export const metadata: Metadata = {
  title: '长文笔记 | JnQ Journey',
  description: '旅行长文笔记、灵感故事、景点延伸内容与预订推荐。',
}

export const dynamic = 'force-dynamic'

export default async function NotesIndexPage() {
  const notes = await readPublishedNotes()

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.08),transparent_18%),linear-gradient(180deg,#111827_0%,#020617_52%,#000000_100%)] text-white">
      <div className="mx-auto max-w-7xl px-4 py-10 md:px-8 md:py-12">
        <div className="rounded-[36px] border border-white/10 bg-white/5 p-7 md:p-10">
          <p className="section-kicker text-xs text-amber-300/80">Longform Notes</p>
          <h1 className="font-display mt-4 text-5xl leading-none text-white md:text-6xl">长文笔记</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-gray-300 md:text-base">
            这里会收录更适合慢慢读的旅行长文、吃住行心得、景点延伸故事，以及可以直接连到现有景点页与联盟推荐的深度内容。
          </p>
        </div>

        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          {notes.map((note) => (
            <Link key={note.slug} href={`/notes/${note.slug}`} className="group overflow-hidden rounded-[32px] border border-white/10 bg-white/5 transition hover:-translate-y-1 hover:bg-white/10">
              <div className={`relative overflow-hidden p-6 md:p-8 ${note.coverAccent}`}>
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="relative z-10">
                  <p className="section-kicker text-xs text-amber-100/80">{note.kicker}</p>
                  <h2 className="font-display mt-4 text-4xl leading-none text-white md:text-5xl">{note.shortTitle || note.title}</h2>
                  <p className="mt-4 text-sm leading-7 text-white/78 md:text-base">{note.tagline || note.summary}</p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 p-5">
                <p className="line-clamp-3 text-sm leading-7 text-gray-300">{note.summary}</p>
                <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition group-hover:bg-amber-50">
                  打开长文
                  <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </Link>
          ))}
        </section>
      </div>

      <SiteFooter />
    </main>
  )
}
