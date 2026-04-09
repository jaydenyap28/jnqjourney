export interface ImageFocusPoint {
  x: number
  y: number
}

const DEFAULT_FOCUS: ImageFocusPoint = { x: 50, y: 50 }

export function parseImageFocus(value?: string | null) {
  const raw = String(value || '').trim()
  if (!raw) {
    return { src: '', focus: DEFAULT_FOCUS }
  }

  const [src, hash = ''] = raw.split('#')
  const match = hash.match(/focus=(\d{1,3})[x,](\d{1,3})/i)

  if (!match) {
    return { src, focus: DEFAULT_FOCUS }
  }

  const x = Math.min(100, Math.max(0, Number(match[1])))
  const y = Math.min(100, Math.max(0, Number(match[2])))

  return {
    src,
    focus: { x, y },
  }
}

export function withImageFocus(value: string, focus: ImageFocusPoint) {
  const base = parseImageFocus(value).src
  if (!base) return ''
  return `${base}#focus=${Math.round(focus.x)},${Math.round(focus.y)}`
}
