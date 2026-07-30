/** Removes only a terminal sentence stop from compact UI copy. */
export function formatShortText(value?: string | null) {
  const text = String(value || '').trim()
  if (!text) return ''
  return text.replace(/[。]$/u, '').replace(/(?<!\d)\.$/u, '')
}
