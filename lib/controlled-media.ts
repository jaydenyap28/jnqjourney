const LEGACY_HOST = 'pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev'

// Exact host/key mapping. A consumer never inherits a Spot's ownership merely
// because its filename resembles that Spot. The byte endpoint must resolve
// all explicit owners and independently verify the current object identity.
export function controlledMediaUrl(value: string) {
  return value.replace(/https:\/\/pub-8ecf7356fcc84618a26557ed36fc53a1\.r2\.dev\/[^\s<>"')]+/g, match => {
    const url = new URL(match)
    if (url.hostname !== LEGACY_HOST || url.search) throw new Error('Unsupported legacy media URL.')
    if (url.pathname.startsWith('/public-data/')) return url.pathname + url.hash
    return `/media/legacy/${encodeURIComponent(url.pathname.slice(1))}${url.hash}`
  })
}
export function controlledMediaValue<T>(value: T): T {
  if (typeof value === 'string') return controlledMediaUrl(value) as T
  if (Array.isArray(value)) return value.map(controlledMediaValue) as T
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [controlledMediaUrl(key), controlledMediaValue(item)])) as T
  return value
}
