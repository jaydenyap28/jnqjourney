import { createHash, randomUUID } from 'node:crypto'

// Only called when the outer Next Guide cache is refreshed. A unique CDN key
// also bypasses objects cached before their cache headers were corrected.
export function freshGuideSnapshotUrl(base: string) {
  return `${base.replace(/\/+$/, '')}/public-data/guides.json?fresh=${randomUUID()}`
}

export async function verifyGuidePublication(base: string, expected: Uint8Array, fetcher: typeof fetch = fetch) {
  const response = await fetcher(freshGuideSnapshotUrl(base), { cache: 'no-store', signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error('Guide saved, but public snapshot read-back failed.')
  const actual = new Uint8Array(await response.arrayBuffer())
  const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
  if (hash(actual) !== hash(expected)) throw new Error('Guide saved, but public snapshot verification failed.')
}
