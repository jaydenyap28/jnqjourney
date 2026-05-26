import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'

import SiteFooter from '@/components/SiteFooter'
import AffiliateCard from '@/components/AffiliateCard'
import FallbackImage from '@/components/FallbackImage'
import KlookWidgetEmbed from '@/components/KlookWidgetEmbed'
import SupportSidebarCard from '@/components/SupportSidebarCard'
import NoteInteractiveReader, { NoteTableOfContents } from '@/components/NoteInteractiveReader'
import { absoluteUrl } from '@/lib/site'
import { buildLocationPath } from '@/lib/location-routing'
import { readNoteBySlug } from '@/lib/server/notes-store'
import { readKlookWidgets, type KlookWidgetRecord } from '@/lib/server/klook-widgets-store'
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

function renderBlock(block: NoteBlock, locationsById: Map<number, LocationData>) {
  if (block.type === 'heading') {
    const headingId = `heading-${block.id}`
    return (
      <h2
        id={headingId}
        key={block.id}
        className="max-w-2xl mx-auto pt-10 pb-4 text-3xl font-semibold tracking-tight text-white md:text-5xl scroll-mt-24"
      >
        {block.content}
      </h2>
    )
  }

  if (block.type === 'quote') {
    return (
      <blockquote
        key={block.id}
        className="max-w-2xl mx-auto rounded-[32px] border border-amber-200/15 bg-amber-200/10 px-8 py-6 text-xl leading-9 text-white/88 my-8 relative pl-12"
      >
        <span className="absolute left-4 top-3 text-5xl font-serif text-amber-400/40 select-none">“</span>
        {block.content}
      </blockquote>
    )
  }

  if (block.type === 'image' && block.imageUrl) {
    const alt = block.alt?.trim() || buildFallbackAlt(undefined, block.caption)
    return (
      <figure key={block.id} className="max-w-4xl mx-auto w-full my-10 space-y-3 group">
        <div
          data-lightbox-src={block.imageUrl}
          data-lightbox-alt={alt}
          data-lightbox-caption={block.caption || ''}
          className="lightbox-trigger relative aspect-[16/9] overflow-hidden rounded-[34px] border border-white/10 bg-white/5 shadow-[0_24px_70px_rgba(0,0,0,0.28)] cursor-zoom-in group"
        >
          <FallbackImage
            src={block.imageUrl}
            alt={alt}
            fill
            sizes="(max-width: 1024px) 100vw, 980px"
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
            <span className="bg-black/60 backdrop-blur-md text-white/90 border border-white/10 px-4 py-2 rounded-full text-xs font-medium tracking-wide translate-y-2 group-hover:translate-y-0 transition-transform duration-300 flex items-center gap-2">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7"></path>
              </svg>
              点击放大查看
            </span>
          </div>
        </div>
        {block.caption ? (
          <figcaption className="px-2 text-sm leading-7 text-white/55 text-center italic">{block.caption}</figcaption>
        ) : null}
      </figure>
    )
  }

  if ((block.type === 'gallery' || block.type === 'spotImages') && block.images?.length) {
    const spot = block.spotId ? locationsById.get(block.spotId) : null
    const spotLabel = block.spotName || (spot ? spot.name_cn || spot.name : '')
    return (
      <div
        key={block.id}
        className="max-w-4xl mx-auto w-full my-10"
      >
        {/* Glassmorphic Top Header */}
        <div className="hidden">
          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <span className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <h4 className="text-xl font-bold text-white tracking-tight">{spot?.name_cn || spotLabel}</h4>
                {spot?.name_cn && spot.name && (
                  <span className="text-sm font-normal text-white/50">{spot.name}</span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-white/40 uppercase tracking-widest">
                {spot?.regions ? `${spot.regions.country} · ${spot.regions.name_cn || spot.regions.name}` : '旅行相册'}
              </p>
            </div>
          </div>

          {spot && (
            <Link
              href={buildLocationPath(spot.name, spot.id)}
              className="inline-flex items-center gap-1 text-sm font-medium text-emerald-400 hover:text-emerald-300 transition-colors bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/10 hover:border-emerald-500/20 px-4 py-2 rounded-full"
            >
              <span>查看景点详情</span>
              <span className="text-xs">→</span>
            </Link>
          )}
        </div>

        {/* Elegant Photo Grid */}
        <div
          className={`grid gap-5 ${
            block.images.length === 1
              ? 'grid-cols-1'
              : block.images.length === 2
              ? 'grid-cols-1 md:grid-cols-2'
              : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
          }`}
        >
          {block.images.map((image, index) => {
            const imgAlt = image.alt?.trim() || buildFallbackAlt(spotLabel, image.caption)
            return (
              <div key={`${block.id}-${index}`} className="space-y-2 group">
                <div
                  data-lightbox-src={image.src}
                  data-lightbox-alt={imgAlt}
                  data-lightbox-caption={image.caption || ''}
                  className="lightbox-trigger relative aspect-[4/3] overflow-hidden rounded-[26px] border border-white/10 bg-white/5 shadow-md cursor-zoom-in"
                >
                  <FallbackImage
                    src={image.src}
                    alt={imgAlt}
                    fill
                    sizes="(max-width: 1024px) 100vw, 400px"
                    className="object-cover transition-transform duration-700 ease-out group-hover:scale-108"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                    <span className="bg-black/60 backdrop-blur-md text-white/90 border border-white/10 px-4 py-2 rounded-full text-xs font-medium tracking-wide translate-y-2 group-hover:translate-y-0 transition-transform duration-300 flex items-center gap-2">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7"></path>
                      </svg>
                      放大
                    </span>
                  </div>
                </div>
                {image.caption ? (
                  <p className="px-2 text-xs text-white/45 text-center leading-relaxed tracking-wide italic">{image.caption}</p>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (block.type === 'spot' && block.spotId) {
    const spot = locationsById.get(block.spotId)
    if (!spot) return null
    return (
      <div key={block.id} className="max-w-3xl mx-auto w-full my-8">
        <Link
          href={buildLocationPath(spot.name, spot.id)}
          className="grid gap-5 overflow-hidden rounded-[30px] border border-white/10 bg-white/5 transition hover:-translate-y-1 hover:bg-white/10 md:grid-cols-[240px_minmax(0,1fr)] shadow-[0_16px_50px_rgba(0,0,0,0.18)]"
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
          <div className="p-6 flex flex-col justify-center">
            <p className="text-xs uppercase tracking-[0.24em] text-amber-300/80">Related Spot / 相关景点</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">{spot.name_cn || spot.name}</h3>
            <p className="mt-3 text-sm leading-7 text-gray-300 line-clamp-3">
              {spot.description || spot.review || 'Open the linked spot page for the full travel details.'}
            </p>
          </div>
        </Link>
      </div>
    )
  }

  return (
    <p
      key={block.id}
      className="max-w-2xl mx-auto text-[1.08rem] leading-9 text-gray-200 whitespace-pre-wrap md:text-[1.13rem] tracking-wide my-6"
    >
      {block.content}
    </p>
  )
}

export default async function NoteDetailPage({ params }: PageProps) {
  const note = await readNoteBySlug(params.slug)
  if (!note || !note.published) notFound()

  const blocks = getRenderableNoteBlocks(note)
  const contentBlocks = blocks.filter((block) => block.type !== 'affiliate' && block.type !== 'klookWidget')
  const affiliateBlocks = blocks.filter((block) => block.type === 'affiliate' && block.affiliateIds?.length)
  const klookBlocks = blocks.filter((block) => block.type === 'klookWidget' && block.klookWidgetIds?.length)

  const spotIds = Array.from(
    new Set(
      [
        ...(note.relatedSpotIds || []),
        ...blocks.map((block) => block.spotId).filter((value): value is number => Number.isFinite(value)),
      ].filter(Boolean)
    )
  )
  const affiliateIds = Array.from(new Set(affiliateBlocks.flatMap((block) => block.affiliateIds || [])))
  const klookWidgetIds = Array.from(new Set(klookBlocks.flatMap((block) => block.klookWidgetIds || [])))

  const [relatedSpots, affiliateLinks, allKlookWidgets] = await Promise.all([
    fetchLocationsByIds(spotIds),
    fetchAffiliateLinksByIds(affiliateIds),
    klookWidgetIds.length ? readKlookWidgets() : Promise.resolve([] as KlookWidgetRecord[]),
  ])

  const locationsById = new Map(relatedSpots.map((spot) => [spot.id, spot]))
  const affiliateById = new Map(affiliateLinks.map((link) => [link.id, link]))
  const klookWidgetById = new Map(allKlookWidgets.filter((widget) => widget.isActive).map((widget) => [widget.id, widget]))
  const textExcerpt = getTextExcerpt(note)

  const headings = contentBlocks
    .filter((block) => block.type === 'heading' && block.content)
    .map((block) => ({
      id: block.id,
      content: block.content || '',
    }))

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.14),transparent_24%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.12),transparent_22%),linear-gradient(180deg,#101418_0%,#05070a_52%,#000000_100%)] text-white">
      {/* Dynamic Reading Progress Bar & Immersive Full-Screen Lightbox Image Viewer */}
      <NoteInteractiveReader headings={headings} />

      <div className="mx-auto max-w-[1500px] px-4 py-8 md:px-8 md:py-12">
        <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-white/45">
          <Link href="/" className="transition hover:text-white">Home</Link>
          <span>/</span>
          <Link href="/notes" className="transition hover:text-white">Notes</Link>
          <span>/</span>
          <span className="text-white/65">{note.title}</span>
        </div>

        <section className={`overflow-hidden rounded-[42px] border border-white/10 p-7 shadow-[0_28px_90px_rgba(0,0,0,0.28)] backdrop-blur-sm md:p-10 ${note.coverAccent || ''}`}>
          <div className={`grid gap-8 ${note.coverImage ? 'lg:grid-cols-[minmax(0,1.05fr)_520px] lg:items-center' : ''}`}>
            <div className="space-y-5">
              <p className="text-xs uppercase tracking-[0.28em] text-amber-200/80">{note.kicker || 'Longform Note'}</p>
              <h1 className="text-4xl font-semibold leading-tight text-white md:text-7xl">{note.title}</h1>
              {note.tagline ? <p className="max-w-3xl text-lg leading-9 text-white/80">{note.tagline}</p> : null}
            </div>
            {note.coverImage ? (
              <div className="relative aspect-[4/3] overflow-hidden rounded-[34px] border border-white/10 bg-black/20">
                <FallbackImage src={note.coverImage} alt={`${note.title} cover image`} fill sizes="(max-width: 1024px) 100vw, 520px" className="object-cover" priority />
              </div>
            ) : null}
          </div>
        </section>

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,980px)_360px] lg:items-start lg:justify-center">
          <article className="space-y-2 rounded-[38px] border border-white/10 bg-white/[0.035] px-5 py-8 shadow-[0_24px_90px_rgba(0,0,0,0.22)] backdrop-blur-md md:px-10 md:py-12">
            {note.summary ? (
              <div className="max-w-2xl mx-auto rounded-[28px] border border-emerald-300/15 bg-emerald-400/10 px-6 py-5 text-base leading-8 text-emerald-50/85 mb-8">
                {note.summary}
              </div>
            ) : null}

            {contentBlocks.length ? (
              contentBlocks.map((block) => renderBlock(block, locationsById))
            ) : textExcerpt ? (
              <div className="space-y-6 max-w-2xl mx-auto">
                {textExcerpt.split(/\n{2,}/).map((paragraph, index) => (
                  <p key={index} className="text-[1.08rem] leading-9 text-gray-200 whitespace-pre-wrap md:text-[1.13rem] tracking-wide my-6">
                    {paragraph}
                  </p>
                ))}
              </div>
            ) : null}
          </article>

          <aside className="space-y-4 lg:sticky lg:top-6">
            {/* Dynamic Sticky Table of Contents sidebar widget */}
            <NoteTableOfContents headings={headings} />

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

            {klookBlocks.map((block) => {
              const widgets = (block.klookWidgetIds || [])
                .map((id) => klookWidgetById.get(id))
                .filter((item): item is KlookWidgetRecord => Boolean(item))

              if (!widgets.length) return null

              return widgets.map((widget) => (
                <KlookWidgetEmbed
                  key={`${block.id}-${widget.id}`}
                  code={widget.htmlCode}
                  title={block.title || widget.title}
                  description={block.content || widget.description || 'Book related travel experiences on Klook.'}
                  variant="card"
                />
              ))
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
