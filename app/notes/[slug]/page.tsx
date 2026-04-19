import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'

import SiteFooter from '@/components/SiteFooter'
import AffiliateCard from '@/components/AffiliateCard'
import FallbackImage from '@/components/FallbackImage'
import SupportSidebarCard from '@/components/SupportSidebarCard'
import { absoluteUrl } from '@/lib/site'
import { buildLocationPath } from '@/lib/location-routing'
import { readNoteBySlug } from '@/lib/server/notes-store'
import { parseSummary } from '@/lib/notes'

interface PageProps {
  params: { slug: string }
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

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const note = await readNoteBySlug(params.slug)
  if (!note) {
    return { title: '笔记不存在 | JnQ Journey' }
  }

  return {
    title: `${note.title} | JnQ Journey`,
    description: String(note.summary || note.tagline || '').slice(0, 160),
    alternates: { canonical: `/notes/${note.slug}` },
    openGraph: {
      title: note.title,
      description: String(note.summary || note.tagline || '').slice(0, 160),
      url: absoluteUrl(`/notes/${note.slug}`),
      images: note.coverImage ? [{ url: note.coverImage }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: note.title,
      description: String(note.summary || note.tagline || '').slice(0, 160),
      images: note.coverImage ? [note.coverImage] : undefined,
    },
  }
}

export const revalidate = 600 // Cache for 10 minutes

export default async function NoteDetailPage({ params }: PageProps) {
  const note = await readNoteBySlug(params.slug)
  if (!note || !note.published) notFound()

  const relatedSpots = await fetchLocationsByIds(note.relatedSpotIds)
  const summaryParts = parseSummary(note.summary)
  const summarySpotIds = summaryParts
    .filter((part) => part.type === 'spot' && part.spotId)
    .map((part) => part.spotId as number)

  const contentBlocks = note.blocks.filter((block) => block.type !== 'affiliate')
  const sidebarAffiliateBlocks = note.blocks.filter(
    (block) => block.type === 'affiliate' && Boolean(block.affiliateIds?.length)
  )
  const blockSpotIds = note.blocks.filter((block) => block.type === 'spot' && block.spotId).map((block) => block.spotId as number)
  const blockSpots = await fetchLocationsByIds([...new Set([...blockSpotIds, ...summarySpotIds])])
  const spotMap = new Map(blockSpots.map((spot: any) => [spot.id, spot]))

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(244,114,182,0.12),transparent_18%),linear-gradient(180deg,#111827_0%,#020617_48%,#000000_100%)] text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-10">
        <section className={`overflow-hidden rounded-[40px] border border-white/10 p-7 md:p-10 ${note.coverAccent}`}>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_420px] lg:items-end">
            <div>
              <p className="section-kicker text-xs text-amber-100/80">{note.kicker}</p>
              <h1 className="font-display mt-5 text-5xl leading-none text-white md:text-7xl">{note.title}</h1>
              {note.tagline ? <p className="mt-5 max-w-3xl text-base leading-8 text-white/80">{note.tagline}</p> : null}
            </div>
            {note.coverImage ? (
              <div className="relative aspect-[4/3] overflow-hidden rounded-[28px] border border-white/10 bg-black/20">
                <FallbackImage src={note.coverImage} alt={note.title} fill className="object-cover" />
              </div>
            ) : null}
          </div>
        </section>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <article className="space-y-8">
            {summaryParts.length ? (
              <div className="max-w-4xl space-y-5 rounded-[28px] border border-white/10 bg-white/5 px-6 py-5">
                {summaryParts.map((part, index) => {
                  if (part.type === 'text') {
                    return (
                      <p key={index} className="text-base leading-8 text-gray-100 md:text-[1.05rem]">
                        {part.content}
                      </p>
                    )
                  }

                  if (part.type === 'image' && part.imageUrl) {
                    return (
                      <div key={index} className="relative aspect-[16/9] overflow-hidden rounded-2xl border border-white/10">
                        <FallbackImage src={part.imageUrl} alt={note.title} fill className="object-cover" />
                      </div>
                    )
                  }

                  if (part.type === 'spot' && part.spotId) {
                    const spot = spotMap.get(part.spotId)
                    if (!spot) return null
                    return (
                      <a
                        key={index}
                        href={buildLocationPath(spot.name, spot.id)}
                        className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 transition hover:bg-white/10"
                      >
                        <div className="relative h-16 w-16 overflow-hidden rounded-xl">
                          <FallbackImage
                            src={spot.image_url || spot.images?.[0] || '/placeholder-image.jpg'}
                            alt={spot.name_cn || spot.name}
                            fill
                            className="object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-white">{spot.name_cn || spot.name}</p>
                          <p className="truncate text-xs text-gray-400">
                            {spot.regions?.country} / {spot.regions?.name_cn || spot.regions?.name}
                          </p>
                        </div>
                      </a>
                    )
                  }

                  return null
                })}
              </div>
            ) : null}

            {contentBlocks.map((block) => {
              if (block.type === 'heading') {
                return <h2 key={block.id} className="font-display pt-6 text-3xl text-white md:text-4xl">{block.content}</h2>
              }

              if (block.type === 'quote') {
                return <blockquote key={block.id} className="rounded-[32px] border border-white/10 bg-white/5 px-6 py-6 text-lg leading-8 text-white/85 md:px-8">
                  {block.content}
                </blockquote>
              }

              if (block.type === 'image' && block.imageUrl) {
                return (
                  <figure key={block.id} className="overflow-hidden rounded-[32px] border border-white/10 bg-white/5">
                    <div className="relative aspect-[16/9] overflow-hidden">
                      <FallbackImage src={block.imageUrl} alt={block.caption || note.title} fill className="object-cover" />
                    </div>
                    {block.caption ? <figcaption className="px-5 py-4 text-sm leading-7 text-gray-300">{block.caption}</figcaption> : null}
                  </figure>
                )
              }

              if (block.type === 'spot' && block.spotId) {
                const spot = spotMap.get(block.spotId)
                if (!spot) return null
                return (
                  <a key={block.id} href={buildLocationPath(spot.name, spot.id)} className="block overflow-hidden rounded-[28px] border border-white/10 bg-white/5 transition hover:-translate-y-1 hover:bg-white/10">
                    <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
                      <div className="relative aspect-[4/3] overflow-hidden md:aspect-auto">
                        <FallbackImage src={spot.image_url || spot.images?.[0] || '/placeholder-image.jpg'} alt={spot.name_cn || spot.name} fill className="object-cover" />
                      </div>
                      <div className="p-5">
                        <p className="section-kicker text-xs text-amber-300/80">关联景点</p>
                        <h3 className="mt-3 text-2xl font-semibold text-white">{spot.name_cn || spot.name}</h3>
                        <p className="mt-3 line-clamp-3 text-sm leading-7 text-gray-300">{spot.description || spot.review || '打开这张卡片，继续查看你已经整理好的独立景点页。'}</p>
                      </div>
                    </div>
                  </a>
                )
              }

              if (block.type === 'paragraph') {
                return <p key={block.id} className="max-w-4xl text-base leading-8 text-gray-200 md:text-[1.02rem]">{block.content}</p>
              }

              return null
            })}
          </article>

          <aside className="space-y-5 lg:sticky lg:top-8 lg:h-fit">
            <section className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <p className="section-kicker text-xs text-amber-300/80">Travel Sidebar</p>
              <h2 className="mt-3 text-2xl font-semibold text-white">旅行工具与预订入口</h2>
              <p className="mt-3 text-sm leading-7 text-gray-300">
                右侧栏现在专门留给住宿、门票、交通等联盟推荐，让正文专心讲故事、给攻略、放照片。
              </p>
            </section>

            {sidebarAffiliateBlocks.length ? (
              sidebarAffiliateBlocks.map((block) => (
                <section key={block.id} className="rounded-[28px] border border-white/10 bg-white/5 p-5">
                  {block.title ? <p className="section-kicker text-xs text-amber-300/80">{block.title}</p> : null}
                  {block.content ? <p className="mt-3 text-sm leading-7 text-gray-300">{block.content}</p> : null}
                  <div className={block.content ? 'mt-5' : block.title ? 'mt-4' : ''}>
                    <AffiliateCard linkIds={block.affiliateIds || []} limit={(block.affiliateIds || []).length} showDisclosure={false} />
                  </div>
                </section>
              ))
            ) : (
              <section className="rounded-[28px] border border-white/10 bg-white/5 p-5">
                <p className="section-kicker text-xs text-emerald-300/80">Sidebar Reserved</p>
                <p className="mt-3 text-sm leading-7 text-gray-300">
                  这篇长文暂时还没挂联盟模块。后续在后台新增 `Affiliate / 联盟推荐` 模块后，这里会自动出现。
                </p>
              </section>
            )}

            <SupportSidebarCard className="bg-white/5" />
          </aside>
        </div>

        {relatedSpots.length ? (
          <section className="mt-8 rounded-[32px] border border-white/10 bg-white/5 p-6 md:p-7">
            <p className="section-kicker text-xs text-amber-300/80">Connected Spots</p>
            <h2 className="mt-3 text-3xl font-semibold text-white">这篇笔记关联的景点</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {relatedSpots.map((spot: any) => (
                <a key={spot.id} href={buildLocationPath(spot.name, spot.id)} className="flex items-center gap-3 rounded-[24px] border border-white/10 bg-black/20 p-4 transition hover:bg-white/5">
                  <div className="relative h-20 w-20 overflow-hidden rounded-2xl">
                    <FallbackImage src={spot.image_url || spot.images?.[0] || '/placeholder-image.jpg'} alt={spot.name_cn || spot.name} fill className="object-cover" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-lg font-medium text-white">{spot.name_cn || spot.name}</p>
                    <p className="mt-1 truncate text-xs text-gray-400">{spot.regions?.country} / {spot.regions?.name_cn || spot.regions?.name}</p>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-gray-300">{spot.description || spot.review || '继续查看这条景点页，拿到更完整的地图、照片与交通信息。'}</p>
                  </div>
                </a>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <SiteFooter />
    </main>
  )
}
