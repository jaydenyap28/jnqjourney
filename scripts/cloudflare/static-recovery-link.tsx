'use client'
import { forwardRef, type ComponentProps } from 'react'
import type NextLink from 'next/link'

type Props = ComponentProps<typeof NextLink> & { onNavigate?: unknown }
function address(href: Props['href']) {
  if (typeof href === 'string') return href
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(href.query || {})) {
    for (const item of Array.isArray(value) ? value : [value]) if (item != null) query.append(key, String(item))
  }
  const origin = href.host ? `${href.protocol || 'https:'}//${href.host}` : ''
  return origin + (href.pathname || '/') + (href.search || (query.size ? '?' + query : '')) + (href.hash || '')
}

// Static hosting uses ordinary document navigation and the existing page UI.
const StaticRecoveryLink = forwardRef<HTMLAnchorElement, Props>(function StaticRecoveryLink(props, ref) {
  const { href, as, prefetch, replace, scroll, shallow, locale, legacyBehavior, passHref, onNavigate, ...anchor } = props
  return <a {...anchor} ref={ref} href={typeof as === 'string' ? as : address(href)} />
})
export default StaticRecoveryLink
