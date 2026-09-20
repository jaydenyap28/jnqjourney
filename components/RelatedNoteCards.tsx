import type { RelatedNoteCard } from '@/lib/content-relations'
import Link from 'next/link'
import FallbackImage from './FallbackImage'

export default function RelatedNoteCards({ notes, heading = '相关攻略' }: { notes: RelatedNoteCard[]; heading?: string }) {
  if (!notes.length) return null
  return <section className="space-y-4">
    <h2 className="text-xl font-semibold text-white">{heading}</h2>
    <div className="grid gap-3 sm:grid-cols-2">{notes.map(note => <Link key={note.slug} href={`/notes/${note.slug}`} className="overflow-hidden rounded-xl border border-white/10 bg-white/5 transition hover:bg-white/10">
      {note.coverImage ? <div className="relative aspect-[16/9]"><FallbackImage src={note.coverImage} alt={note.title} fill sizes="(max-width: 640px) 100vw, 360px" className="object-cover" /></div> : null}
      <div className="p-4"><h3 className="font-medium text-white">{note.title}</h3><p className="mt-2 line-clamp-2 text-sm text-white/60">{note.summary}</p></div>
    </Link>)}</div>
  </section>
}
