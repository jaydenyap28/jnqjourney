import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { MapPin } from 'lucide-react'

import SiteFooter from '@/components/SiteFooter'
import AffiliateCard from '@/components/AffiliateCard'
import FallbackImage from '@/components/FallbackImage'
import SupportSidebarCard from '@/components/SupportSidebarCard'
import { absoluteUrl } from '@/lib/site'
import { buildLocationPath } from '@/lib/location-routing'
import { readNoteBySlug } from '@/lib/server/notes-store'
import { buildMetaDescription, buildOpenGraphData, buildPageTitle, buildTwitterCardData } from '@/lib/seo'
import { buildFallbackAlt, getRenderableNoteBlocks, type LongformNote, type NoteBlock } from '@/lib/notes'

interface PageProps {
  params: { slug: string }
}

interface RegionData {
  id: number
  name: string
  name_cn?: string | null
  country?: string | null
}

interface LocationData {
  id: number
  name: string
  name_cn?: string | null
  category?: string | null
  image_url?: string | null
  images?: string[] | null
  description?: string | null
  review?: string | null
  regions?: RegionData | null
}

interface AffiliateData {
  id: number
  title?: string | null
  description?: string | null
  provider: string
  link_type: string
  url: string
  preview_image_url?: string | null
  image_url?: string | null
}

function createPublicSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase public environment variables')
  }

  return createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } })
}

async function fetchLocationsByIds(ids: number[]) {
  if (!ids.length) return []
  const supabase = createPublicSupabaseClient()
  const { data, error } = await supabase
    .from('locations')
    .select('id,name,name_cn,category,image_url,images,description,review,regions:region_id(id,name,name_cn,country)')
    .in('id', ids)

  if (error || !data) return []

  const order = new Map(ids.map((id, index) => [id, index]))
  return (data as any[])
    .map((item) => ({
      ...item,
      regions: Array.isArray(item?.regions) ? item.regions[0] || null : item?.regions || null,
    }))
    .sort((left, right) => (order.get(left.id) ?? 999) - (order.get(right.id) ?? 999))
}

async function fetchAffiliateLinksByIds(ids: number[]) {
  if (!ids.length) return []
  const supabase = createPublicSupabaseClient()
  const { data, error } = await supabase
    .from('affiliate_links')
    .select('id,title,description,provider,link_type,url,preview_image_url,image_url')
    .in('id', ids)
    .eq('is_active', true)

  if (error || !data) return []
  return data as AffiliateData[]
}

function getTextExcerpt(note: LongformNote) {
  const blockText = getRenderableNoteBlocks(note)
    .filter((block) => block.type === 'paragraph' || block.type === 'quote' || block.type === 'heading')
    .map((block) => block.content || '')
    .join(' ')
    .trim()

  return note.summary || note.tagline || note.content || blockText
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const note = await readNoteBySlug(params.slug)
  if (!note) {
    return { title: buildPageTitle('Note not found') }
  }

  const description = buildMetaDescription(getTextExcerpt(note), `Read this travel note about ${note.title}.`)
  const title = buildPageTitle(note.title)
  const path = `/notes/${note.slug}`
  const image = note.coverImage || absoluteUrl('/icon.png')

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: buildOpenGraphData(title, description, path, image, 'article'),
    twitter: buildTwitterCardData(title, description, image),
  }
}

export const revalidate = 600

function NoteImageFigure({
  src,
  alt,
  caption,
}: {
  src: string
  alt: string
  caption?: string
}) {
  return (
    <figure className="space-y-3">
      <div className="relative aspect-[16/10] overflow-hidden rounded-[28px] border border-white/10 bg-white/5 shadow-[0_18px_40px_rgba(0,0,0,0.18)]">
        <FallbackImage src={src} alt={alt} fill sizes="(max-width: 1024px) 100vw, 820px" className="object-cover" />
      </div>
      {caption ? <figcaption className="px-1 text-sm leading-7 text-white/55">{caption}</figcaption> : null}
    </figure>
  )
}

function renderBlock(block: NoteBlock, locationsById: Map<number, LocationData>) {
  if (block.type === 'heading') {
    return <h2 key={block.id} className="pt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">{block.content}</h2>
  }

  if (block.type === 'quote') {
    return (
      <blockquote key={block.id} className="rounded-[30px] border border-white/10 bg-white/5 px-6 py-5 text-lg leading-8 text-white/85">
        {block.content}
      </blockquote>
    )
  }

  if (block.type === 'image' && block.imageUrl) {
    return (
      <NoteImageFigure
        key={block.id}
        src={block.imageUrl}
        alt={block.alt?.trim() || buildFallbackAlt(undefined, block.caption)}
        caption={block.caption}
      />
    )
  }

  if ((block.type === 'gallery' || block.type === 'spotImages') && block.images?.length) {
    const spot = block.spotId ? locationsById.get(block.spotId) : null
    const spotLabel = block.spotName || (spot ? spot.name_cn || spot.name : '')
    return (
      <div key={block.id} className="space-y-4">
        {block.type === 'spotImages' && spotLabel ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
            <MapPin className="h-3.5 w-3.5" />
            {spotLabel}
          </div>
        ) : null}
        <div className={`grid gap-4 ${block.images.length === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
          {block.images.map((image, index) => (
            <NoteImageFigure
              key={`${block.id}-${index}`}
              src={image.src}
              alt={image.alt?.trim() || buildFallbackAlt(spotLabel, image.caption)}
              caption={image.caption}
            />
          ))}
        </div>
      </div>
    )
  }

  if (block.type === 'spot' && block.spotId) {
    const spot = locationsById.get(block.spotId)
    if (!spot) return null
    return (
      <Link
        key={block.id}
        href={buildLocationPath(spot.name, spot.id)}
        className="grid gap-5 overflow-hidden rounded-[30px] border border-white/10 bg-white/5 transition hover:-translate-y-1 hover:bg-white/10 md:grid-cols-[240px_minmax(0,1fr)]"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-black/20">
          <FallbackImage
            src={spot.image_url || spot.images?.[0] || '/placeholder-image.jpg'}
            alt={spot.name_cn || spot.name}
            fill
            sizes="(max-width: 768px) 100vw, 240px"
            className="object-cover"
          />
        </div>
        <div className="p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-amber-300/80">Related Spot</p>
          <h3 className="mt-3 text-2xl font-semibold text-white">{spot.name_cn || spot.name}</h3>
          <p className="mt-3 text-sm leading-7 text-gray-300">
            {spot.description || spot.review || 'Open the linked spot page for the full travel details.'}
          </p>
        </div>
      </Link>
    )
  }

  return (
    <p key={block.id} className="text-[1.02rem] leading-8 text-gray-200 whitespace-pre-wrap">
      {block.content}
    </p>
  )
}

export default async function NoteDetailPage({ params }: PageProps) {
  const note = await readNoteBySlug(params.slug)
  if (!note || !note.published) notFound()

  const blocks = getRenderableNoteBlocks(note)
  const contentBlocks = blocks.filter((block) => block.type !== 'affiliate')
  const affiliateBlocks = blocks.filter((block) => block.type === 'affiliate' && block.affiliateIds?.length)

  const spotIds = Array.from(
    new Set(
      [
        ...(note.relatedSpotIds || []),
        ...blocks.map((block) => block.spotId).filter((value): value is number => Number.isFinite(value)),
      ].filter(Boolean)
    )
  )
  const affiliateIds = Array.from(new Set(affiliateBlocks.flatMap((block) => block.affiliateIds || [])))

  const [relatedSpots, affiliateLinks] = await Promise.all([
    fetchLocationsByIds(spotIds),
    fetchAffiliateLinksByIds(affiliateIds),
  ])

  const locationsById = new Map(relatedSpots.map((spot) => [spot.id, spot]))
  const affiliateById = new Map(affiliateLinks.map((link) => [link.id, link]))
  const textExcerpt = getTextExcerpt(note)

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(244,114,182,0.10),transparent_18%),linear-gradient(180deg,#111827_0%,#020617_50%,#000000_100%)] text-white">
      <div className="mx-auto max-w-7xl px-4 py-10 md:px-8 md:py-12">
        <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-white/45">
          <Link href="/" className="transition hover:text-white">Home</Link>
          <span>/</span>
          <Link href="/notes" className="transition hover:text-white">Notes</Link>
          <span>/</span>
          <span className="text-white/65">{note.title}</span>
        </div>

        <section className={`overflow-hidden rounded-[38px] border border-white/10 p-7 md:p-10 ${note.coverAccent || ''}`}>
          <div className={`grid gap-6 ${note.coverImage ? 'lg:grid-cols-[minmax(0,1.1fr)_420px] lg:items-center' : ''}`}>
            <div className="space-y-5">
              <p className="text-xs uppercase tracking-[0.28em] text-amber-200/80">{note.kicker || 'Longform Note'}</p>
              <h1 className="text-4xl font-semibold leading-tight text-white md:text-6xl">{note.title}</h1>
              {note.tagline ? <p className="max-w-3xl text-base leading-8 text-white/80">{note.tagline}</p> : null}
            </div>
            {note.coverImage ? (
              <div className="relative aspect-[4/3] overflow-hidden rounded-[28px] border border-white/10 bg-black/20">
                <FallbackImage src={note.coverImage} alt={`${note.title} cover image`} fill sizes="(max-width: 1024px) 100vw, 420px" className="object-cover" priority />
              </div>
            ) : null}
          </div>
        </section>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <article className="space-y-7">
            {note.summary ? (
              <div className="rounded-[28px] border border-white/10 bg-white/5 px-6 py-5 text-sm leading-7 text-white/70">
                {note.summary}
              </div>
            ) : null}

            {contentBlocks.length ? (
              contentBlocks.map((block) => renderBlock(block, locationsById))
            ) : textExcerpt ? (
              <div className="space-y-5">
                {textExcerpt.split(/\n{2,}/).map((paragraph, index) => (
                  <p key={index} className="text-[1.02rem] leading-8 text-gray-200 whitespace-pre-wrap">
                    {paragraph}
                  </p>
                ))}
              </div>
            ) : null}
          </article>

          <aside className="space-y-4">
            {affiliateBlocks.map((block) => {
              const links = (block.affiliateIds || [])
                .map((id) => affiliateById.get(id))
                .filter((item): item is AffiliateData => Boolean(item))

              if (!links.length) return null

              return (
                <section key={block.id} className="rounded-[28px] border border-white/10 bg-white/5 p-5">
                  <p className="text-xs uppercase tracking-[0.24em] text-amber-300/80">{block.title || 'Recommended Links'}</p>
                  {block.content ? <p className="mt-3 text-sm leading-7 text-white/60">{block.content}</p> : null}
                  <div className="mt-4 space-y-3">
                    <AffiliateCard
                      linkIds={links.map((link) => link.id)}
                      compact
                      singleColumn
                      hideHeader
                      limit={links.length}
                    />
                  </div>
                </section>
              )
            })}

            {relatedSpots.length ? (
              <section className="rounded-[28px] border border-white/10 bg-white/5 p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-amber-300/80">Related Spots</p>
                <div className="mt-4 space-y-3">
                  {relatedSpots.slice(0, 8).map((spot) => (
                    <Link
                      key={spot.id}
                      href={buildLocationPath(spot.name, spot.id)}
                      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 transition hover:bg-white/10"
                    >
                      <div className="relative h-16 w-16 overflow-hidden rounded-xl">
                        <FallbackImage
                          src={spot.image_url || spot.images?.[0] || '/placeholder-image.jpg'}
                          alt={spot.name_cn || spot.name}
                          fill
                          sizes="64px"
                          className="object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-white">{spot.name_cn || spot.name}</p>
                        <p className="truncate text-xs text-white/45">{spot.regions?.country} / {spot.regions?.name_cn || spot.regions?.name}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            <SupportSidebarCard className="bg-white/5" />
          </aside>
        </div>
      </div>

      <SiteFooter />
    </main>
  )
}
