import type { RelatedNoteCard } from '@/lib/content-relations'
import { ArrowUpRight, BookOpen } from 'lucide-react'
import Link from 'next/link'
import FallbackImage from './FallbackImage'

export default function RelatedNoteCards({ notes, heading = '相关攻略', variant = 'default' }: {
  notes: RelatedNoteCard[]
  heading?: string
  variant?: 'default' | 'guide-day'
}) {
  if (!notes.length) return null
  if (variant === 'guide-day') return <section aria-label="路线攻略" className="mt-5 space-y-3">
    {notes.map(note => <Link key={note.slug} href={`/notes/${note.slug}`} className={`group grid overflow-hidden border border-amber-200/18 bg-[linear-gradient(135deg,rgba(245,158,11,0.075),rgba(255,255,255,0.025))] transition hover:border-amber-200/35 hover:bg-[linear-gradient(135deg,rgba(245,158,11,0.11),rgba(255,255,255,0.04))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${note.coverImage ? 'md:grid-cols-[13rem_minmax(0,1fr)]' : ''}`}>
      {note.coverImage ? <div className="relative aspect-[16/9] min-h-full overflow-hidden bg-black/25 md:aspect-auto"><FallbackImage src={note.coverImage} alt={note.title} fill sizes="(max-width: 767px) 100vw, 208px" className="object-cover transition duration-500 group-hover:scale-[1.025]" /><div className="absolute inset-0 bg-gradient-to-t from-[#080d17]/55 via-transparent to-transparent md:bg-gradient-to-r md:from-transparent md:to-[#080d17]/45" /></div> : null}
      <div className="flex min-w-0 flex-col justify-center p-4 md:p-5">
        <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200/75"><BookOpen className="h-3.5 w-3.5" />路线攻略 / Travel Note</p>
        <h5 className="mt-2 text-lg font-semibold leading-7 text-white transition group-hover:text-amber-50">{note.title}</h5>
        {note.summary ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-white/62">{note.summary}</p> : null}
        <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-amber-100">查看完整攻略 <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></span>
      </div>
    </Link>)}
  </section>
  return <section className="space-y-4">
    <h2 className="text-xl font-semibold text-white">{heading}</h2>
    <div className="grid gap-3 sm:grid-cols-2">{notes.map(note => <Link key={note.slug} href={`/notes/${note.slug}`} className="overflow-hidden rounded-xl border border-white/10 bg-white/5 transition hover:bg-white/10">
      {note.coverImage ? <div className="relative aspect-[16/9]"><FallbackImage src={note.coverImage} alt={note.title} fill sizes="(max-width: 640px) 100vw, 360px" className="object-cover" /></div> : null}
      <div className="p-4"><h3 className="font-medium text-white">{note.title}</h3><p className="mt-2 line-clamp-2 text-sm text-white/60">{note.summary}</p></div>
    </Link>)}</div>
  </section>
}
