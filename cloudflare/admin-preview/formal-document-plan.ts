// Local preparation only: not imported by formal-edge.ts, no transport or I/O.
// Run under the already reviewed private store's lock after fresh server Auth.
import { normalizeNotePayload } from '../../lib/note-payload'
import { normalizeGuidePayload } from '../../lib/guide-payload'
import { mergeNoteSave, NoteConflictError } from '../../lib/note-sync'
import { countLegacyGuideLinkedSpots } from '../../lib/guide-legacy-migration'

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
type Kind = 'notes' | 'guides'
type Row = { slug: string, aliases?: string[], updatedAt?: string, [key: string]: any }

export function prepareFormalDocumentSave(kind: Kind, records: Row[], raw: Record<string, any>, pointer: string) {
  if (!['notes', 'guides'].includes(kind) || !Array.isArray(records) || !raw || raw.action ||
      !new RegExp(`^_system/${kind}/[0-9]{13}(?:-[a-f0-9-]{36})?\\.webp$`).test(pointer)) throw Error('FORMAL_AUTHORITY_SCOPE_INVALID')
  if (kind === 'guides' && countLegacyGuideLinkedSpots(raw)) throw Error('FORMAL_GUIDE_LEGACY_REVIEW_REQUIRED')
  const payload = kind === 'notes' ? normalizeNotePayload(raw) : normalizeGuidePayload(raw, { enforceBudgetTotal: true })
  if (!payload.title || payload.slug.length > 120 || !slugPattern.test(payload.slug) ||
      (payload.aliases || []).some(alias => alias.length > 120 || !slugPattern.test(alias))) throw Error('FORMAL_DOCUMENT_INVALID')
  const previousSlug = String(raw.previousSlug || '')
  const matches = records.filter(row => [row.slug, ...(row.aliases || [])].some(slug => slug === payload.slug || slug === previousSlug))
  const old = matches[0]
  if (matches.length > 1 || Boolean(old) !== Boolean(previousSlug) || (old &&
      (old.slug !== previousSlug || !Object.hasOwn(raw, 'expectedUpdatedAt') ||
       typeof raw.expectedUpdatedAt !== 'string' || raw.expectedUpdatedAt !== (old.updatedAt || '')))) throw new NoteConflictError()
  if (kind === 'notes' && !old) (payload as ReturnType<typeof normalizeNotePayload>).published = false
  const before = structuredClone(records)
  let next: Row[]
  if (kind === 'notes') {
    next = mergeNoteSave(before as any, payload as any, previousSlug, raw.expectedUpdatedAt) as Row[]
  } else {
    const updatedAt = new Date(Math.max(Date.now(), Date.parse(old?.updatedAt || '') + 1 || 0)).toISOString()
    const saved = { ...payload, updatedAt,
      aliases: [...new Set([...(old?.aliases || []), ...(payload.aliases || []), ...(old ? [old.slug] : [])])].filter(slug => slug !== payload.slug) }
    next = old ? before.map(row => row.slug === old.slug ? saved : row) : [saved, ...before]
  }
  const saved = next.find(row => row.slug === payload.slug)!
  if (kind === 'guides' && !old && !Object.hasOwn(raw, 'published')) saved.published = false
  // Keep old Note aliases when renaming, just as the Guide version protocol.
  if (kind === 'notes' && old) saved.aliases = [...new Set([...(old.aliases || []), ...(saved.aliases || []), old.slug])].filter(slug => slug !== saved.slug)
  return { collection: kind, expectedPointer: pointer, records: next, saved,
    requiresPrivateAuthorityStore: true, requiresServerMediaVerification: true,
    requiresApprovedPublicationProjection: true,
    writesEnabled: false, publish: false }
}
