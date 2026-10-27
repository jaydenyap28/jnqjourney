import { createHash, randomUUID } from 'node:crypto'

/** Called only when the existing outer collection cache needs regeneration. */
export function freshNoteSnapshotUrl(base: string) {
  return `${base.replace(/\/+$/, '')}/public-data/notes.json?fresh=${randomUUID()}`
}

export async function verifyNotePublication(base: string, expected: Uint8Array, fetcher: typeof fetch = fetch) {
  const response = await fetcher(freshNoteSnapshotUrl(base), { cache: 'no-store', signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error('Note saved, but public snapshot read-back failed.')
  const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
  if (hash(new Uint8Array(await response.arrayBuffer())) !== hash(expected)) throw new Error('Note saved, but public snapshot verification failed.')
}
