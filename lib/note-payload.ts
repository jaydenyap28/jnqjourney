import type { LongformNote, NoteBlock } from '@/lib/notes'
import { createNoteImageItem, DEFAULT_NOTE_COVER_ACCENT, getRenderableNoteBlocks, normalizeNoteHeadingLevel, normalizeNoteImageSize, normalizeNoteVideoAspect } from '@/lib/notes'

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item || '').trim()).filter(Boolean)
}

function normalizeNumberArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0)
}

function normalizeBlock(value: any): NoteBlock | null {
  const type = String(value?.type || '').trim() as NoteBlock['type']
  if (!type) return null

  const spotName = String(value?.spotName || value?.title || '').trim() || undefined
  const imageItems = Array.isArray(value?.images)
    ? value.images
        .map((item: any) => createNoteImageItem(item, spotName))
        .filter((item: ReturnType<typeof createNoteImageItem>): item is NonNullable<ReturnType<typeof createNoteImageItem>> => Boolean(item))
    : []

  const block: NoteBlock = {
    id: String(value?.id || '').trim() || `block-${Math.random().toString(36).slice(2, 10)}`,
    type,
    title: String(value?.title || '').trim() || undefined,
    content: String(value?.content || '').trim() || undefined,
    headingLevel: type === 'heading' ? normalizeNoteHeadingLevel(value?.headingLevel) : undefined,
    imageUrl: String(value?.imageUrl || '').trim() || undefined,
    videoUrl: String(value?.videoUrl || '').trim() || undefined,
    videoAspect: type === 'video' ? normalizeNoteVideoAspect(value?.videoAspect) : undefined,
    imageSize: normalizeNoteImageSize(value?.imageSize),
    alt: String(value?.alt || '').trim() || undefined,
    caption: String(value?.caption || '').trim() || undefined,
    images: imageItems.length ? imageItems : undefined,
    spotId: Number.isFinite(Number(value?.spotId)) ? Number(value.spotId) : undefined,
    spotSlug: String(value?.spotSlug || '').trim() || undefined,
    spotName,
    affiliateIds: normalizeNumberArray(value?.affiliateIds),
    klookWidgetIds: normalizeStringArray(value?.klookWidgetIds),
  }

  if (block.type === 'image' && !block.imageUrl) return null
  if (block.type === 'video' && !block.videoUrl) return null
  if ((block.type === 'gallery' || block.type === 'spotImages') && !block.images?.length) return null
  if (block.type === 'spot' && !block.spotId) return null
  if (block.type === 'affiliate' && !block.affiliateIds?.length) return null
  if (block.type === 'klookWidget' && !block.klookWidgetIds?.length) return null
  if ((block.type === 'paragraph' || block.type === 'quote' || block.type === 'heading') && !block.content) {
    return null
  }

  return block
}

export function normalizeNotePayload(value: any): LongformNote {
  const legacyContent = String(value?.content || '').trim()
  const normalizedBlocks = Array.isArray(value?.blocks)
    ? value.blocks
        .map((item: any) => normalizeBlock(item))
        .filter((item: NoteBlock | null): item is NoteBlock => Boolean(item))
    : []

  const renderableBlocks = normalizedBlocks.length ? normalizedBlocks : getRenderableNoteBlocks({
    blocks: [],
    content: legacyContent,
    summary: String(value?.summary || '').trim(),
  })

  return {
    slug: String(value?.slug || '').trim(),
    aliases: normalizeStringArray(value?.aliases),
    title: String(value?.title || '').trim(),
    shortTitle: String(value?.shortTitle || '').trim() || String(value?.title || '').trim(),
    kicker: String(value?.kicker || '').trim(),
    tagline: String(value?.tagline || '').trim(),
    summary: String(value?.summary || '').trim(),
    content: legacyContent || undefined,
    coverImage: String(value?.coverImage || '').trim() || undefined,
    coverVideoUrl: String(value?.coverVideoUrl || '').trim() || undefined,
    coverAccent: String(value?.coverAccent || '').trim() || DEFAULT_NOTE_COVER_ACCENT,
    published: Boolean(value?.published),
    tags: normalizeStringArray(value?.tags),
    relatedRegionIds: normalizeNumberArray(value?.relatedRegionIds),
    relatedSpotIds: [...new Set(normalizeNumberArray(value?.relatedSpotIds))],
    relatedNoteSlugs: [...new Set(normalizeStringArray(value?.relatedNoteSlugs))].filter(slug => slug !== value?.slug),
    blocks: renderableBlocks,
    createdAt: String(value?.createdAt || '').trim() || undefined,
    updatedAt: String(value?.updatedAt || '').trim() || undefined,
  }
}
