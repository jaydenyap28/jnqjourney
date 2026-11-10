import { cache } from 'react'

// React's RSC dispatcher exposes cache(), whereas the installed React 18 Pages
// runtime does not. Outside RSC, use the live loader itself, never a process
// cache or stale data fallback.
export function requestCache<T extends (...args: any[]) => any>(loader: T): T {
  return typeof cache === 'function' ? cache(loader) : loader
}
