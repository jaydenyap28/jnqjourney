import { createHash } from 'node:crypto'

export function sha256Text(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex')
}

export function noteBodyHash(note) {
  return sha256Text(JSON.stringify({
    content: String(note?.content || ''),
    blocks: Array.isArray(note?.blocks) ? note.blocks : [],
  }))
}

export function assertCompletePublishedNote(note, options = {}) {
  const label = options.label || String(note?.slug || 'unknown note')
  if (!note || typeof note !== 'object') throw new Error(`${label} is not a Note detail object`)
  if (!note.published) return
  if (!Object.hasOwn(note, 'blocks') || !Array.isArray(note.blocks)) {
    throw new Error(`${label} is a list DTO; published snapshots require the complete blocks field`)
  }
  if (note.blocks.length === 0) throw new Error(`${label} has 0 blocks; refusing to publish`)
  if (options.expectedBlocks != null && note.blocks.length !== options.expectedBlocks) {
    throw new Error(`${label} expected ${options.expectedBlocks} blocks, received ${note.blocks.length}`)
  }
  const contentSha256 = sha256Text(note.content)
  if (options.expectedContentSha256 && contentSha256 !== options.expectedContentSha256) {
    throw new Error(`${label} content SHA-256 mismatch: ${contentSha256}`)
  }
}

export function compareNoteBodies(currentNote, nextNote) {
  const currentBlocks = Array.isArray(currentNote?.blocks) ? currentNote.blocks.length : 0
  const nextBlocks = Array.isArray(nextNote?.blocks) ? nextNote.blocks.length : 0
  if (currentNote?.published && currentBlocks > nextBlocks) {
    throw new Error(`${nextNote?.slug || 'Note'} block count would fall from ${currentBlocks} to ${nextBlocks}`)
  }
  const currentContentSha256 = sha256Text(currentNote?.content)
  const nextContentSha256 = sha256Text(nextNote?.content)
  const currentBodySha256 = noteBodyHash(currentNote)
  const nextBodySha256 = noteBodyHash(nextNote)
  return {
    slug: String(nextNote?.slug || currentNote?.slug || ''),
    currentBlocks,
    nextBlocks,
    currentContentSha256,
    nextContentSha256,
    currentBodySha256,
    nextBodySha256,
    contentChanged: currentContentSha256 !== nextContentSha256,
    bodyChanged: currentBodySha256 !== nextBodySha256,
  }
}

export function validateNoteSnapshot(notes, currentNotes = [], expectedBySlug = {}) {
  if (!Array.isArray(notes)) throw new Error('Note snapshot must contain a notes array')
  const currentBySlug = new Map(currentNotes.map((note) => [note.slug, note]))
  const nextSlugs = new Set(notes.map((note) => note?.slug).filter(Boolean))
  const removed = currentNotes.filter((note) => note?.published && !nextSlugs.has(note.slug))
  if (removed.length) throw new Error(`Published Notes would be removed: ${removed.map((note) => note.slug).join(', ')}`)

  return notes.map((note) => {
    const expected = expectedBySlug[note?.slug] || {}
    assertCompletePublishedNote(note, {
      label: note?.slug,
      expectedBlocks: expected.blocks,
      expectedContentSha256: expected.contentSha256,
    })
    const current = currentBySlug.get(note?.slug)
    return current ? compareNoteBodies(current, note) : {
      slug: String(note?.slug || ''),
      currentBlocks: 0,
      nextBlocks: Array.isArray(note?.blocks) ? note.blocks.length : 0,
      currentContentSha256: null,
      nextContentSha256: sha256Text(note?.content),
      currentBodySha256: null,
      nextBodySha256: noteBodyHash(note),
      contentChanged: true,
      bodyChanged: true,
    }
  })
}

export function replaceSingleNote(currentNotes, replacement) {
  const index = currentNotes.findIndex((note) => note.slug === replacement.slug)
  if (index < 0) throw new Error(`Target Note ${replacement.slug} is missing from the current public snapshot`)
  return currentNotes.map((note, noteIndex) => noteIndex === index ? replacement : note)
}

export async function fetchProductionNoteDetails(base, fetchImpl = fetch) {
  const listResponse = await fetchImpl(`${base}/api/notes`)
  if (!listResponse.ok) throw new Error(`Production notes returned ${listResponse.status}`)
  const list = (await listResponse.json()).notes || []
  return Promise.all(list.map(async (summary) => {
    if (!summary?.slug) throw new Error('Production Note list contains an item without a slug')
    const response = await fetchImpl(`${base}/api/notes?slug=${encodeURIComponent(summary.slug)}`)
    if (!response.ok) throw new Error(`Production Note ${summary.slug} returned ${response.status}`)
    const note = (await response.json()).note
    assertCompletePublishedNote(note, { label: summary.slug })
    return note
  }))
}
