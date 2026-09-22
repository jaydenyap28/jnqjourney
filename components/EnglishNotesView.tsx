import Link from 'next/link'

import FallbackImage from '@/components/FallbackImage'
import InlineMarkdown from '@/components/InlineMarkdown'
import SiteFooter from '@/components/SiteFooter'
import { buildLocationPath } from '@/lib/location-routing'
import { localizedPath } from '@/lib/locale'
import {
  createNoteHeadingId,
  getRenderableNoteBlocks,
  normalizeNoteHeadingLevel,
  stripSummaryTokens,
  type LongformNote,
  type NoteBlock,
} from '@/lib/notes'
import type { PublicLocation } from '@/lib/public-data'

function renderBlock(block: NoteBlock, index: number, locationsById: Map<number, PublicLocation>) {
  if (block.type === 'heading') {
    const level = normalizeNoteHeadingLevel(block.headingLevel)
    const id = createNoteHeadingId(block.content, index)
    if (level === 3) return <h3 key={block.id} id={id} className="mx-auto mt-10 max-w-3xl text-2xl font-semibold leading-tight text-white"><InlineMarkdown>{block.content}</InlineMarkdown></h3>
    if (level === 4) return <h4 key={block.id} id={id} className="mx-auto mt-8 max-w-3xl text-xl font-semibold leading-tight text-white"><InlineMarkdown>{block.content}</InlineMarkdown></h4>
    return <h2 key={block.id} id={id} className="mx-auto mt-12 max-w-3xl text-3xl font-semibold leading-tight text-white md:text-4xl"><InlineMarkdown>{block.content}</InlineMarkdown></h2>
  }

  if (block.type === 'quote') {
    return <blockquote key={block.id} className="mx-auto my-8 max-w-3xl border-l-2 border-amber-300/50 bg-amber-300/5 px-6 py-5 text-lg italic leading-8 text-amber-50/90"><InlineMarkdown>{block.content}</InlineMarkdown></blockquote>
  }

  if (block.type === 'image' && block.imageUrl) {
    return (
      <figure key={block.id} className="mx-auto my-8 max-w-5xl">
        <div className="relative aspect-[16/10] overflow-hidden rounded-[28px] border border-white/10 bg-white/5">
          <FallbackImage src={block.imageUrl} alt={block.alt || block.caption || 'Travel photo'} fill sizes="(max-width: 1024px) 100vw, 900px" className="object-cover" />
        </div>
        {block.caption ? <figcaption className="mt-3 text-center text-sm leading-6 text-white/50">{block.caption}</figcaption> : null}
      </figure>
    )
  }

  if ((block.type === 'spotImages' || block.type === 'gallery') && block.images?.length) {
    return (
      <div key={block.id} className="mx-auto my-8 grid max-w-5xl gap-4 md:grid-cols-2">
        {block.images.map((image, imageIndex) => (
          <figure key={`${block.id}-${imageIndex}`} className="space-y-2">
            <div className="relative aspect-[4/3] overflow-hidden rounded-[24px] border border-white/10 bg-white/5">
              <FallbackImage src={image.src} alt={image.alt || block.spotName || 'Travel photo'} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" />
            </div>
            {image.caption ? <figcaption className="text-sm leading-6 text-white/50">{image.caption}</figcaption> : null}
          </figure>
        ))}
      </div>
    )
  }

  if (block.type === 'video' && block.videoUrl) {
    return (
      <div key={block.id} className="mx-auto my-8 max-w-3xl rounded-[24px] border border-white/10 bg-white/5 p-5">
        <p className="text-sm font-medium text-white">{block.title || 'Video'}</p>
        <a href={block.videoUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-full bg-white px-4 py-2 text-sm font-semibold text-black">
          Watch video ↗
        </a>
      </div>
    )
  }

  if (block.type === 'spot' && block.spotId) {
    const spot = locationsById.get(block.spotId)
    if (!spot) return null
    return (
      <Link key={block.id} href={localizedPath(buildLocationPath(spot.name, spot.id), 'en')} className="mx-auto my-8 block max-w-3xl rounded-[26px] border border-white/10 bg-white/5 p-5 transition hover:bg-white/10">
        <p className="text-xs uppercase tracking-[0.22em] text-amber-200/70">Related Spot</p>
        <h3 className="mt-2 text-2xl font-semibold text-white">{spot.name}</h3>
        <p className="mt-2 text-sm text-white/55">Open the linked Spot page for practical travel details →</p>
      </Link>
    )
  }

  if (block.type === 'affiliate' || block.type === 'klookWidget') {
    if (!block.title && !block.content) return null
    return (
      <aside key={block.id} className="mx-auto my-8 max-w-3xl rounded-[24px] border border-emerald-200/15 bg-emerald-300/5 p-5">
        {block.title ? <p className="font-semibold text-emerald-50">{block.title}</p> : null}
        {block.content ? <p className="mt-2 text-sm leading-7 text-emerald-50/70"><InlineMarkdown>{block.content}</InlineMarkdown></p> : null}
      </aside>
    )
  }

  return (
    <p key={block.id} className="mx-auto my-6 max-w-3xl whitespace-pre-wrap text-[1.05rem] leading-9 tracking-wide text-gray-200 md:text-[1.1rem]">
      <InlineMarkdown>{block.content}</InlineMarkdown>
    </p>
  )
}

export function EnglishNotesIndex({ notes }: { notes: LongformNote[] }) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.08),transparent_18%),linear-gradient(180deg,#111827_0%,#020617_52%,#000000_100%)] text-white">
      <div className="mx-auto max-w-7xl px-4 py-10 md:px-8 md:py-12">
        <section className="rounded-[36px] border border-white/10 bg-white/5 p-7 md:p-10">
          <p className="section-kicker text-xs text-amber-300/80">Longform Notes</p>
          <h1 className="font-display mt-4 text-5xl leading-none text-white md:text-6xl">Travel stories worth slowing down for</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-gray-300 md:text-base">
            In-depth route notes, transport guides, first-hand travel experiences, and stories that need more room than a quick Spot page.
          </p>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          {notes.map((note) => {
            const coverImage = note.coverImage || ''
            return (
              <Link key={note.slug} href={`/en/notes/${note.slug}`} className="group overflow-hidden rounded-[32px] border border-white/10 bg-white/5 transition hover:-translate-y-1 hover:bg-white/10">
                <div className={`relative min-h-[280px] overflow-hidden p-6 md:p-8 ${coverImage ? 'bg-black' : note.coverAccent}`}>
                  {coverImage ? <FallbackImage src={coverImage} alt={note.shortTitle || note.title} fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover transition duration-700 group-hover:scale-105" /> : null}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 z-10 p-6 md:p-8">
                    <p className="section-kicker text-xs text-amber-100/80">{note.kicker || 'Longform Note'}</p>
                    <h2 className="font-display mt-3 text-4xl leading-none text-white md:text-5xl">{note.shortTitle || note.title}</h2>
                    {(note.tagline || note.summary) ? <p className="mt-4 line-clamp-3 text-sm leading-7 text-white/78 md:text-base">{note.tagline || stripSummaryTokens(note.summary)}</p> : null}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 p-5">
                  <span className="text-sm text-white/60">Read the full note</span>
                  <span className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black">Open →</span>
                </div>
              </Link>
            )
          })}
        </section>
      </div>
      <SiteFooter />
    </main>
  )
}

export function EnglishNoteView({ note, locations }: { note: LongformNote; locations: PublicLocation[] }) {
  const blocks = getRenderableNoteBlocks(note)
  const locationsById = new Map(locations.map((location) => [location.id, location]))

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.14),transparent_24%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.12),transparent_22%),linear-gradient(180deg,#101418_0%,#05070a_52%,#000000_100%)] text-white">
      <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-8 md:py-12">
        <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-white/45">
          <Link href="/en">Home</Link>
          <span>/</span>
          <Link href="/en/notes">Longform Notes</Link>
          <span>/</span>
          <span className="text-white/65">{note.shortTitle || note.title}</span>
        </nav>

        <section className={`relative overflow-hidden rounded-[42px] border border-white/10 p-7 shadow-[0_28px_90px_rgba(0,0,0,0.28)] md:p-10 ${note.coverImage ? 'min-h-[430px]' : note.coverAccent || ''}`}>
          {note.coverImage ? (
            <>
              <FallbackImage src={note.coverImage} alt={note.title} fill priority sizes="100vw" className="object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/15" />
            </>
          ) : null}
          <div className="relative z-10 flex min-h-[320px] max-w-5xl flex-col justify-end">
            <p className="text-xs uppercase tracking-[0.28em] text-amber-200/80">{note.kicker || 'Longform Note'}</p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight text-white md:text-7xl">{note.title}</h1>
            {note.tagline ? <p className="mt-5 max-w-3xl text-lg leading-9 text-white/80">{note.tagline}</p> : null}
          </div>
        </section>

        <article className="mx-auto mt-10 max-w-5xl rounded-[38px] border border-white/10 bg-white/[0.035] px-5 py-8 shadow-[0_24px_90px_rgba(0,0,0,0.22)] backdrop-blur-md md:px-10 md:py-12">
          {note.summary?.trim() ? (
            <div className="mx-auto mb-8 max-w-3xl rounded-[28px] border border-emerald-300/15 bg-emerald-400/10 px-6 py-5 text-base leading-8 text-emerald-50/85">
              {stripSummaryTokens(note.summary)}
            </div>
          ) : null}
          {blocks.map((block, index) => renderBlock(block, index, locationsById))}
        </article>
      </div>
      <SiteFooter />
    </main>
  )
}
