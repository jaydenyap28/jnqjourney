import type { LongformNote } from './notes'

export class NoteConflictError extends Error {
  constructor() { super('Newer cloud version detected') }
}

export function mergeNoteSave(notes: LongformNote[], payload: LongformNote, previousSlug: string, expectedUpdatedAt: unknown) {
  const matches = notes.filter((item) =>
    item.slug === payload.slug || item.slug === previousSlug ||
    item.aliases?.includes(payload.slug) || (previousSlug && item.aliases?.includes(previousSlug)))
  const existing = matches[0]
  if (matches.length > 1 || (previousSlug && !existing) || (existing && !previousSlug) ||
    (existing && (typeof expectedUpdatedAt !== 'string' || (existing.updatedAt || '') !== expectedUpdatedAt))) {
    throw new NoteConflictError()
  }
  const timestamp = new Date(Math.max(Date.now(), (Date.parse(existing?.updatedAt || '') || 0) + 1)).toISOString()
  const saved = { ...payload, createdAt: existing?.createdAt || timestamp, updatedAt: timestamp }
  return existing ? notes.map((note) => note === existing ? saved : note) : [saved, ...notes]
}

export function noteEditorKey(note: LongformNote, markdown: string) {
  const { updatedAt, createdAt, ...editable } = note
  return JSON.stringify([editable, markdown])
}

export function scheduleNoteAutosave(save: () => void, dirty: boolean, blocked: boolean) {
  if (!dirty || blocked) return () => {}
  const timer = setTimeout(save, 3000)
  return () => clearTimeout(timer)
}
