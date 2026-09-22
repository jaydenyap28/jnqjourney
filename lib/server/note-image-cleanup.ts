import 'server-only'

import type { LongformNote } from '@/lib/notes'
import {
  deleteR2Objects,
  getR2PublicBaseUrl,
  legacyNoteR2Prefix,
  listR2Objects,
  modernNoteR2Prefix,
  r2ObjectKeyFromPublicUrl,
  type R2ObjectInfo,
} from '@/lib/server/r2'

const IMAGE_KEY_RE = /\.(?:avif|gif|jpe?g|png|webp)$/i

function collectStrings(value: unknown, output: string[]) {
  if (typeof value === 'string') {
    output.push(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output)
    return
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) collectStrings(item, output)
  }
}

function referencedR2Keys(notes: LongformNote[]) {
  const strings: string[] = []
  for (const note of notes) collectStrings(note, strings)

  const base = getR2PublicBaseUrl()
  const keys = new Set<string>()
  for (const value of strings) {
    const direct = r2ObjectKeyFromPublicUrl(value)
    if (direct) keys.add(direct)

    if (!value.includes(base)) continue
    const urls = value.match(/https?:\/\/[^\s"'<>()[\]{}]+/g) || []
    for (const url of urls) {
      const key = r2ObjectKeyFromPublicUrl(url)
      if (key) keys.add(key)
    }
  }
  return keys
}

function noteSlugs(notes: LongformNote[]) {
  return Array.from(new Set(
    notes.flatMap((note) => [note.slug, ...(note.aliases || [])])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  ))
}

async function addPrefixObjects(target: Map<string, R2ObjectInfo>, prefix: string) {
  const objects = await listR2Objects(prefix)
  for (const item of objects) {
    if (!IMAGE_KEY_RE.test(item.key)) continue
    target.set(item.key, item)
  }
}

export interface NoteImageCleanupResult {
  scanned: number
  deleted: number
  bytesFreed: number
  deletedKeys: string[]
}

export async function cleanupUnusedNoteImages(
  notes: LongformNote[],
  scopeSlugs?: string[],
  options?: { includeAllModern?: boolean; includeLegacyInlineSweep?: boolean }
): Promise<NoteImageCleanupResult> {
  const referenced = referencedR2Keys(notes)
  const candidates = new Map<string, R2ObjectInfo>()
  const requestedSlugs = Array.from(new Set(
    (scopeSlugs?.length ? scopeSlugs : noteSlugs(notes))
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  ))

  if (options?.includeAllModern) {
    await addPrefixObjects(candidates, 'notes/')
  } else {
    for (const slug of requestedSlugs) {
      await addPrefixObjects(candidates, modernNoteR2Prefix(slug))
    }
  }

  for (const slug of requestedSlugs) {
    await addPrefixObjects(candidates, legacyNoteR2Prefix(slug))
  }

  if (options?.includeLegacyInlineSweep) {
    const legacyObjects = await listR2Objects('locations/general/general/')
    for (const item of legacyObjects) {
      if (!IMAGE_KEY_RE.test(item.key)) continue
      if (!/^locations\/general\/general\/[^/]+\/inline\//.test(item.key)) continue
      candidates.set(item.key, item)
    }
  }

  const unused = Array.from(candidates.values()).filter((item) => !referenced.has(item.key))
  if (!unused.length) {
    return { scanned: candidates.size, deleted: 0, bytesFreed: 0, deletedKeys: [] }
  }

  await deleteR2Objects(unused.map((item) => item.key))
  return {
    scanned: candidates.size,
    deleted: unused.length,
    bytesFreed: unused.reduce((sum, item) => sum + item.size, 0),
    deletedKeys: unused.map((item) => item.key),
  }
}
