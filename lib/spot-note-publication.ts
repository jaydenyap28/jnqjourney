import { isDeepStrictEqual } from 'node:util'
import type { PublicSpotRecord, PublicSpotSnapshot } from './public-spot'
import { evaluateSpotQuality } from './spot-quality'

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export function safeNotePublicationSlug(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 200 && SLUG.test(value)
}

type Relations = string[] | null
export type SpotNoteReceipt = {
  version: string
  etag: string
  canonicalSlug: string
  snapshotSlug: string
  relatedNoteSlugs: Relations
}

export type SpotNoteState = {
  row: Omit<PublicSpotRecord, 'slug'> & { status: string; updated_at: string }
  snapshot: PublicSpotSnapshot
  receipt: SpotNoteReceipt
}

export type SpotNoteStore = {
  read: (id: number, noteSlug: string) => Promise<SpotNoteState>
  append: (state: SpotNoteState, next: string[]) => Promise<string | null>
  publish: (state: SpotNoteState, next: string[]) => Promise<void>
  refresh: (state: SpotNoteState) => Promise<void>
}

export class SpotNotePublicationError extends Error {
  constructor(readonly code: string, readonly status = 409) {
    super(code)
  }
}

export function isSpotNoteVersion(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value)
}

export function isSpotNoteETag(value: unknown): value is string {
  return typeof value === 'string' && /^"[a-zA-Z0-9-]{1,128}"$/.test(value)
}

function isRelations(value: unknown): value is Relations {
  return value === null || (Array.isArray(value) && value.every(safeNotePublicationSlug))
}

export function isSpotNoteReceipt(value: unknown): value is SpotNoteReceipt {
  if (!value || typeof value !== 'object') return false
  const receipt = value as SpotNoteReceipt
  return Object.keys(receipt).length === 5 && isSpotNoteVersion(receipt.version) && isSpotNoteETag(receipt.etag)
    && safeNotePublicationSlug(receipt.canonicalSlug) && safeNotePublicationSlug(receipt.snapshotSlug)
    && isRelations(receipt.relatedNoteSlugs)
}

function sameIdentity(a: SpotNoteReceipt, b: SpotNoteReceipt) {
  return a.snapshotSlug === b.snapshotSlug && a.canonicalSlug === b.canonicalSlug
}

function checkQuality(spot: Omit<PublicSpotRecord, 'slug'>, previous: Relations, next: string[]) {
  const before = evaluateSpotQuality({ ...spot, related_note_slugs: previous })
  const after = evaluateSpotQuality({ ...spot, related_note_slugs: next })
  if (!before.indexable && after.indexable) throw new SpotNotePublicationError('seo_noindex_would_change')
  return { before, after }
}

export async function publishSpotNote(store: SpotNoteStore, id: number, noteSlug: string, expected?: SpotNoteReceipt) {
  let state = await store.read(id, noteSlug)
  const prior = expected || state.receipt
  const next = [...new Set([...(prior.relatedNoteSlugs || []), noteSlug])]
  const oldSnapshot = (current: SpotNoteState) => current.receipt.etag === prior.etag
    && isDeepStrictEqual(current.receipt.relatedNoteSlugs, prior.relatedNoteSlugs)
  const rowIs = (current: SpotNoteState, value: Relations) => isDeepStrictEqual(current.row.related_note_slugs, value)
  const snapshotIsNext = (current: SpotNoteState) => isDeepStrictEqual(current.receipt.relatedNoteSlugs, next)

  if (!sameIdentity(state.receipt, prior)) throw new SpotNotePublicationError('spot_identity_changed')
  if (!isRelations(state.row.related_note_slugs) || !isRelations(state.receipt.relatedNoteSlugs)) {
    throw new SpotNotePublicationError('invalid_existing_relations')
  }
  const quality = {
    row: checkQuality(state.row, prior.relatedNoteSlugs, next),
    snapshot: checkQuality(state.snapshot.spot, prior.relatedNoteSlugs, next),
  }
  if (!expected) {
    if (!rowIs(state, prior.relatedNoteSlugs)) throw new SpotNotePublicationError('relations_out_of_sync_keep_original_receipt')
    return { state: 'prepared', receipt: state.receipt, quality }
  }

  const alreadyPublished = rowIs(state, next) && snapshotIsNext(state)
  if (!alreadyPublished) {
    if (!oldSnapshot(state)) throw new SpotNotePublicationError('snapshot_conflict')
    if (!rowIs(state, next)) {
      if (state.receipt.version !== prior.version || !rowIs(state, prior.relatedNoteSlugs)) {
        throw new SpotNotePublicationError('spot_version_conflict')
      }
      let version: string | null
      try { version = await store.append(state, next) } catch {
        throw new SpotNotePublicationError('database_result_unknown_retry_same_receipt', 503)
      }
      if (!version) throw new SpotNotePublicationError('spot_version_conflict')
      try { state = await store.read(id, noteSlug) } catch {
        throw new SpotNotePublicationError('database_saved_snapshot_pending_retry_same_receipt', 503)
      }
      if (!sameIdentity(state.receipt, prior) || !oldSnapshot(state) || !rowIs(state, next) || state.receipt.version !== version) {
        throw new SpotNotePublicationError('database_saved_publication_conflict')
      }
    }
    const publishedSnapshot = { ...state.snapshot, spot: { ...state.snapshot.spot, related_note_slugs: next } }
    try { await store.publish(state, next) } catch (error) {
      if (error instanceof SpotNotePublicationError && error.code === 'database_saved_publication_conflict') throw error
      throw new SpotNotePublicationError('database_saved_snapshot_pending_retry_same_receipt', 503)
    }
    try { state = await store.read(id, noteSlug) } catch {
      throw new SpotNotePublicationError('database_saved_snapshot_pending_retry_same_receipt', 503)
    }
    if (!sameIdentity(state.receipt, prior) || !rowIs(state, next) || !isDeepStrictEqual(state.snapshot, publishedSnapshot)) {
      throw new SpotNotePublicationError('database_saved_publication_conflict')
    }
  }

  if (isDeepStrictEqual(prior.relatedNoteSlugs, next)) return { state: 'unchanged', receipt: state.receipt, quality }
  try { await store.refresh(state) } catch {
    throw new SpotNotePublicationError('data_verified_cache_pending_retry_same_receipt', 503)
  }
  return { state: alreadyPublished ? 'already_published' : 'published', receipt: state.receipt, quality }
}
