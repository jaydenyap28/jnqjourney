import RelatedNoteCards from '@/components/RelatedNoteCards'
import { selectNoteSpotIds, relatedNotesForNote } from '@/lib/content-relations'
import { explicitNoteAffiliateIds } from '@/lib/note-affiliates'
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
import AuthorTrustBlock from '@/components/AuthorTrustBlock'
import TravelPackageCard from '@/components/TravelPackageCard'
import InlineMarkdown from '@/components/InlineMarkdown'
import ZoomableImage from '@/components/ZoomableImage'
import { absoluteUrl } from '@/lib/site'
import { buildLocationPath } from '@/lib/location-routing'
import { readPublicNoteBySlug, readPublicNotes } from '@/lib/server/public-content-store'
import { readPublishedPackages } from '@/lib/server/travel-packages'
import { getActiveKlookWidgetsForTargets, readKlookWidgets, type KlookWidgetRecord } from '@/lib/server/klook-widgets-store'
import { buildMetaDescription, buildOpenGraphData, buildTwitterCardData } from '@/lib/seo'
import { buildFallbackAlt, createNoteHeadingId, getNoteTableOfContentsItems, getRenderableNoteBlocks, normalizeNoteHeadingLevel, normalizeNoteVideoAspect, type LongformNote, type NoteBlock, type NoteImageSize } from '@/lib/notes'
import { resolvePublicData } from '@/lib/server/public-data-resolver'
import { resolveNotePublicMedia, selectPublicSpotCards } from '@/lib/server/public-content-media'
import { resolvePublicImage } from '@/lib/public-media'

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
  slug?: string | null
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

function getDisplayKicker(kicker?: string | null) {
  const value = String(kicker || '').trim()
  return value && value.toLowerCase() !== 'longform note' ? value : ''
}

function getYoutubeEmbedUrl(url: string) {
  const value = String(url || '').trim()
  const match = value.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/)
  return match ? `https://www.youtube.com/embed/${match[1]}` : ''
}

function getFacebookVideoEmbedUrl(url: string) {
  const value = String(url || '').trim()
  return /facebook\.com|fb\.watch/i.test(value)
    ? `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(value)}&show_text=false&width=720`
    : ''
}

function getCoverVideoEmbedUrl(url?: string | null) {
  const value = String(url || '').trim()
  if (!value) return ''
  return getYoutubeEmbedUrl(value) || getFacebookVideoEmbedUrl(value)
}

function getImageFigureClass(size?: NoteImageSize) {
  if (size === 'small') return 'max-w-sm'
  if (size === 'medium') return 'max-w-2xl'
  if (size === 'full') return 'max-w-full'
  return 'max-w-4xl'
}

function getGalleryClass(size?: NoteImageSize, count = 1) {
  const widthClass = size === 'small' ? 'max-w-xl' : size === 'medium' ? 'max-w-2xl' : size === 'full' ? 'max-w-full' : 'max-w-4xl'
  const gridClass = count === 1 ? 'grid-cols-1' : count === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
  return `${widthClass} ${gridClass}`
}

function CoverVideoEmbed({ url, title }: { url?: string | null; title: string }) {
  const embedUrl = getCoverVideoEmbedUrl(url)
  if (!embedUrl) return null

  return (
    <iframe
      src={embedUrl}
      title={title}
      className="h-full w-full"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
    />
  )
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const [storedNote, { locations }] = await Promise.all([readPublicNoteBySlug(params.slug), resolvePublicData()])
  const note = storedNote ? resolveNotePublicMedia(storedNote, locations) : null
  if (!note) {
    return { title: 'Note not found' }
  }

  const description = buildMetaDescription(getTextExcerpt(note), `Read this travel note about ${note.title}.`)
  const title = note.title
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

function renderBlock(block: NoteBlock, locationsById: Map<number, LocationData>, index = 0) {
  if (block.type === 'heading') {
    const headingId = `heading-${createNoteHeadingId(block.content, index)}`
    const headingLevel = normalizeNoteHeadingLevel(block.headingLevel)
    const Heading = `h${headingLevel}` as const
    return (
      <Heading
        id={headingId}
        key={block.id}
        className={headingLevel === 2 ? 'font-display max-w-2xl mx-auto pt-9 pb-3 text-[30px] font-medium leading-[1.15] tracking-tight text-white md:pt-10 md:text-[38px] scroll-mt-24' : headingLevel === 3 ? 'font-display max-w-2xl mx-auto pt-8 pb-2 text-[24px] font-medium leading-snug tracking-tight text-white md:pt-9 md:text-[28px] scroll-mt-24' : 'max-w-2xl mx-auto pt-7 pb-2 text-[17px] font-semibold leading-snug tracking-tight text-white md:pt-8 md:text-[19px] scroll-mt-24'}
      >
        <InlineMarkdown>{block.content}</InlineMarkdown>
      </Heading>
    )
  }

  if (block.type === 'quote') {
    return (
      <blockquote
        key={block.id}
        className="font-display relative mx-auto my-10 max-w-2xl border-l border-amber-200/50 px-7 py-2 text-[1.55rem] leading-[1.55] text-white/86"
      >
        <span className="absolute -left-1 -top-6 select-none font-serif text-5xl text-amber-300/25">“</span>
        {block.content}
      </blockquote>
    )
  }

  if (block.type === 'video' && block.videoUrl) {
    const isPortrait = normalizeNoteVideoAspect(block.videoAspect) === 'portrait'
    return (
      <figure key={block.id} className={`${isPortrait ? 'max-w-[480px]' : 'max-w-4xl'} mx-auto w-full my-10`}>
        <div className={`relative ${isPortrait ? 'aspect-[9/16]' : 'aspect-video'} overflow-hidden rounded-[34px] border border-white/10 bg-black/40 shadow-[0_24px_70px_rgba(0,0,0,0.28)]`}>
          <CoverVideoEmbed url={block.videoUrl} title={block.title || 'Article video'} />
        </div>
      </figure>
    )
  }

  if (block.type === 'image' && block.imageUrl) {
    const alt = block.alt?.trim() || buildFallbackAlt(undefined, block.caption)
    return (
      <figure key={block.id} className={`${getImageFigureClass(block.imageSize)} mx-auto w-full my-10 space-y-3 group`}>
        <ZoomableImage
          src={block.imageUrl}
          alt={alt}
          caption={block.caption}
          overlayLabel="点击放大查看"
          className="relative aspect-[16/9] overflow-hidden rounded-[34px] border border-white/10 bg-white/5 shadow-[0_24px_70px_rgba(0,0,0,0.28)]"
        >
          <FallbackImage
            src={block.imageUrl}
            alt={alt}
            fill
            sizes="(max-width: 1024px) 100vw, 980px"
            className="object-contain transition-transform duration-300 ease-out group-hover/zoom:scale-[1.015]"
          />
        </ZoomableImage>
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
              href={spot.slug ? `/spot/${spot.slug}` : buildLocationPath(spot.name, spot.id)}
              className="inline-flex items-center gap-1 text-sm font-medium text-emerald-400 hover:text-emerald-300 transition-colors bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/10 hover:border-emerald-500/20 px-4 py-2 rounded-full"
            >
              <span>查看景点详情</span>
              <span className="text-xs">→</span>
            </Link>
          )}
        </div>

        {/* Elegant Photo Grid */}
        <div className={`mx-auto grid gap-5 ${getGalleryClass(block.imageSize, block.images.length)}`}>
          {block.images.map((image, index) => {
            const imgAlt = image.alt?.trim() || buildFallbackAlt(spotLabel, image.caption)
            return (
              <div key={`${block.id}-${index}`} className="space-y-2 group">
                <ZoomableImage
                  src={image.src}
                  alt={imgAlt}
                  caption={image.caption}
                  overlayLabel="放大"
                  className="relative aspect-[4/3] overflow-hidden rounded-[26px] border border-white/10 bg-white/5 shadow-md"
                >
                  <FallbackImage
                    src={image.src}
                    alt={imgAlt}
                    fill
                    sizes="(max-width: 1024px) 100vw, 400px"
                    className="object-contain transition-transform duration-300 ease-out group-hover/zoom:scale-[1.015]"
                  />
                </ZoomableImage>
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
          href={spot.slug ? `/spot/${spot.slug}` : buildLocationPath(spot.name, spot.id)}
          className="grid gap-5 overflow-hidden rounded-[30px] border border-white/10 bg-white/5 transition hover:-translate-y-1 hover:bg-white/10 md:grid-cols-[240px_minmax(0,1fr)] shadow-[0_16px_50px_rgba(0,0,0,0.18)]"
        >
          <div className="relative aspect-[4/3] overflow-hidden bg-black/20">
            <FallbackImage
              src={resolvePublicImage({ cover: spot.image_url, images: spot.images || [], fallback: '/placeholder-image.jpg' })}
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
      <InlineMarkdown>{block.content}</InlineMarkdown>
    </p>
  )
}

export default async function NoteDetailPage({ params }: PageProps) {
  const [storedNote, publicData] = await Promise.all([readPublicNoteBySlug(params.slug), resolvePublicData()])
  const note = storedNote ? resolveNotePublicMedia(storedNote, publicData.locations) : null
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
  const affiliateIds = explicitNoteAffiliateIds(affiliateBlocks)
  const klookWidgetIds = Array.from(new Set(klookBlocks.flatMap((block) => block.klookWidgetIds || [])))

  const relatedIds = selectNoteSpotIds(note, publicData.locations, publicData.regions)
  const relatedSpots = (relatedIds.length ? selectPublicSpotCards(publicData.locations, { ids: relatedIds }) : []) as LocationData[]
  const relatedNotes = relatedNotesForNote(note, await readPublicNotes(), publicData.locations, publicData.regions)
  const [affiliateLinks, allKlookWidgets, noteKlookWidgets, publishedPackages] = await Promise.all([
    fetchAffiliateLinksByIds(affiliateIds),
    klookWidgetIds.length ? readKlookWidgets() : Promise.resolve([] as KlookWidgetRecord[]),
    getActiveKlookWidgetsForTargets({ noteSlug: note.slug }),
    readPublishedPackages(),
  ])
  const relatedPackages = publishedPackages.filter((item) => item.related_note_slugs?.includes(note.slug))

  const locationsById = new Map((spotIds.length ? selectPublicSpotCards(publicData.locations, { ids: spotIds }) : []).map((spot) => [spot.id, spot as LocationData]))
  const affiliateById = new Map(affiliateLinks.map((link) => [link.id, link]))
  const klookWidgetById = new Map(allKlookWidgets.filter((widget) => widget.isActive).map((widget) => [widget.id, widget]))
  const textExcerpt = getTextExcerpt(note)

  const headings = getNoteTableOfContentsItems(contentBlocks)

  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: note.title,
        description: buildMetaDescription(textExcerpt, `Read this travel note about ${note.title}.`),
        image: note.coverImage || undefined,
        mainEntityOfPage: absoluteUrl(`/notes/${note.slug}`),
        author: [
          { '@type': 'Person', name: 'Jayden Yap', url: absoluteUrl('/about#jayden') },
          { '@type': 'Person', name: 'Connie Qing', url: absoluteUrl('/about#qing') },
        ],
        publisher: { '@id': absoluteUrl('/#organization') },
        inLanguage: ['zh-CN', 'en'],
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: absoluteUrl('/') },
          { '@type': 'ListItem', position: 2, name: 'Notes', item: absoluteUrl('/notes') },
          { '@type': 'ListItem', position: 3, name: note.title, item: absoluteUrl(`/notes/${note.slug}`) },
        ],
      },
    ],
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.14),transparent_24%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.12),transparent_22%),linear-gradient(180deg,#101418_0%,#05070a_52%,#000000_100%)] text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      {/* Dynamic reading progress bar; body images own the shared Lightbox trigger. */}
      <NoteInteractiveReader headings={headings} />

      <div className="mx-auto max-w-[1500px] px-4 py-8 md:px-8 md:py-12">
        <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-white/45">
          <Link href="/" className="transition hover:text-white">Home</Link>
          <span>/</span>
          <Link href="/notes" className="transition hover:text-white">Notes</Link>
          <span>/</span>
          <span className="text-white/65">{note.title}</span>
        </div>

        <section className={`relative isolate overflow-hidden rounded-[42px] border border-white/10 shadow-[0_28px_90px_rgba(0,0,0,0.30)] ${note.coverImage ? 'min-h-[420px] md:min-h-[500px]' : `p-7 backdrop-blur-sm md:p-10 ${note.coverAccent || ''}`}`}>
          {note.coverImage ? (
            <>
              <FallbackImage
                src={note.coverImage}
                alt={note.shortTitle || note.title}
                fill
                priority
                sizes="(max-width: 1536px) 100vw, 1500px"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,0.86)_0%,rgba(2,6,23,0.58)_48%,rgba(2,6,23,0.18)_100%)]" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/68 via-black/10 to-black/20" />
            </>
          ) : null}

          <div className={`relative z-10 flex h-full max-w-5xl flex-col justify-end ${note.coverImage ? 'min-h-[420px] px-7 py-8 md:min-h-[500px] md:px-12 md:py-11' : ''}`}>
            {getDisplayKicker(note.kicker) ? (
              <p className="section-kicker text-[11px] uppercase tracking-[0.28em] text-amber-100/85 md:text-xs">
                {getDisplayKicker(note.kicker)}
              </p>
            ) : null}
            <h1 className="font-display mt-4 max-w-[1050px] text-[clamp(2.9rem,7vw,5.8rem)] font-normal leading-[0.92] tracking-[-0.03em] text-white [text-wrap:balance]">
              {note.title}
            </h1>
            {note.tagline ? (
              <p className="mt-6 max-w-3xl border-l border-amber-200/55 pl-4 text-base leading-8 text-white/78 md:text-lg md:leading-9">
                {note.tagline}
              </p>
            ) : null}
          </div>
        </section>

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,980px)_360px] lg:items-start lg:justify-center">
          <article className="min-w-0 space-y-2 rounded-[38px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.018))] px-5 py-8 shadow-[0_24px_90px_rgba(0,0,0,0.20)] md:px-10 md:py-12">
            {note.summary?.trim() ? (
              <div className="mx-auto mb-10 max-w-2xl border-y border-amber-100/15 py-6">
                <p className="section-kicker text-[10px] text-amber-200/70">JnQ Note</p>
                <p className="mt-3 font-cjk-display text-[1.28rem] leading-9 text-white/82 md:text-[1.4rem] md:leading-10">
                  {note.summary.trim()}
                </p>
              </div>
            ) : null}

            {contentBlocks.length ? (
              contentBlocks.map((block, index) => renderBlock(block, locationsById, index))
            ) : textExcerpt ? (
              <div className="space-y-6 max-w-2xl mx-auto">
                {textExcerpt.split(/\n{2,}/).map((paragraph, index) => (
                  <p key={index} className="text-[1.08rem] leading-9 text-gray-200 whitespace-pre-wrap md:text-[1.13rem] tracking-wide my-6">
                    {paragraph}
                  </p>
                ))}
              </div>
            ) : null}

            <AuthorTrustBlock compact />

            {relatedPackages.length ? (
              <section className="mt-10 space-y-4 border-t border-emerald-200/15 pt-8">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-emerald-200/75">Related travel packages / 相关旅游配套</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">把这段旅程延伸成完整行程</h2>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {relatedPackages.map((item) => <TravelPackageCard key={item.id} item={item} compact showWhatsApp={false} detailLabel="查看相关配套" />)}
                </div>
              </section>
            ) : null}
          </article>

          <aside className="min-w-0 space-y-4 lg:sticky lg:top-6">
            {/* Dynamic Sticky Table of Contents sidebar widget */}
            <NoteTableOfContents headings={headings} />
            <SupportSidebarCard className="bg-white/5" />

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

            {noteKlookWidgets.map((widget) => (
              <KlookWidgetEmbed
                key={`note-widget-${widget.id}`}
                code={widget.htmlCode}
                title={widget.title}
                description={widget.description || 'Book related travel experiences on Klook.'}
                variant="card"
              />
            ))}

            <RelatedNoteCards notes={relatedNotes} heading="延伸阅读" />
            {relatedSpots.length ? (
              <section className="rounded-[28px] border border-white/10 bg-white/5 p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-amber-300/80">Related Spots</p>
                <div className="mt-4 space-y-3">
                  {relatedSpots.slice(0, 8).map((spot) => (
                    <Link
                      key={spot.id}
                      href={spot.slug ? `/spot/${spot.slug}` : buildLocationPath(spot.name, spot.id)}
                      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 transition hover:bg-white/10"
                    >
                      <div className="relative h-16 w-16 overflow-hidden rounded-xl">
                        <FallbackImage
                          src={resolvePublicImage({ cover: spot.image_url, images: spot.images || [], fallback: '/placeholder-image.jpg' })}
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

          </aside>
        </div>
      </div>

      <SiteFooter />
    </main>
  )
}
