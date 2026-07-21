'use client'

import { useEffect, useMemo, useState } from 'react'
import Image, { ImageProps } from 'next/image'
import { parseImageFocus } from '@/lib/image-focus'

const FALLBACK_SRC = '/placeholder-image.jpg'

function bypassOptimizationForDynamicHost(src: string) {
  try {
    const hostname = new URL(src).hostname.toLowerCase()
    return hostname.endsWith('.fbcdn.net') || hostname === 'fbcdn.net'
  } catch {
    return false
  }
}

type FallbackImageProps = Omit<ImageProps, 'src'> & {
  src?: string | null
  fallbackSrc?: string
}

export default function FallbackImage({
  src,
  alt,
  fallbackSrc = FALLBACK_SRC,
  ...props
}: FallbackImageProps) {
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    setHasError(false)
  }, [src])

  const resolvedSrc = useMemo(() => {
    if (!src || hasError) return fallbackSrc
    return src
  }, [fallbackSrc, hasError, src])

  const resolvedImage = useMemo(() => parseImageFocus(resolvedSrc), [resolvedSrc])
  const bypassOptimization = useMemo(
    () => bypassOptimizationForDynamicHost(resolvedImage.src || fallbackSrc),
    [fallbackSrc, resolvedImage.src]
  )
  const mergedStyle = useMemo(
    () => ({
      ...(props.style || {}),
      objectPosition: `${resolvedImage.focus.x}% ${resolvedImage.focus.y}%`,
    }),
    [props.style, resolvedImage.focus.x, resolvedImage.focus.y]
  )

  return (
    <Image
      {...props}
      src={resolvedImage.src || fallbackSrc}
      alt={alt}
      unoptimized={props.unoptimized ?? bypassOptimization}
      style={mergedStyle}
      onError={(event) => {
        if (!hasError) {
          props.onError?.(event)
          setHasError(true)
        }
      }}
    />
  )
}
