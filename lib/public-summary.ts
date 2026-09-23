export function publicSummaryText(value: unknown, limit = 180) {
  const lines = String(value || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^#{1,6}\s+/.test(line))
    .map((line) =>
      line
        .replace(/^[-*+]\s+/, '')
        .replace(/^>\s?/, '')
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/[*_~`]+/g, '')
        .trim()
    )
    .filter(Boolean)

  const summary = lines.join(' ').replace(/\s+/g, ' ').trim()
  if (!summary) return ''
  return limit > 0 ? summary.slice(0, limit) : summary
}
