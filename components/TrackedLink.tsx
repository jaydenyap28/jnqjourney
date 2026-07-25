'use client'

import Link from 'next/link'
import type { MouseEvent, ReactNode } from 'react'

import { getDeviceType, trackEvent, type AnalyticsEventName } from '@/lib/analytics'

interface TrackedLinkProps {
  children: ReactNode
  href: string
  eventName: AnalyticsEventName
  linkLabel: string
  className?: string
  external?: boolean
  title?: string
  ariaLabel?: string
}

export default function TrackedLink({
  children,
  href,
  eventName,
  linkLabel,
  className,
  external = false,
  title,
  ariaLabel,
}: TrackedLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    trackEvent(eventName, {
      link_label: linkLabel,
      link_destination: external ? new URL(href).hostname : href,
      page_path: window.location.pathname,
      device_type: getDeviceType(),
    })
  }

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        title={title}
        aria-label={ariaLabel}
        onClick={handleClick}
      >
        {children}
      </a>
    )
  }

  return (
    <Link
      href={href}
      className={className}
      title={title}
      aria-label={ariaLabel}
      onClick={handleClick}
    >
      {children}
    </Link>
  )
}
