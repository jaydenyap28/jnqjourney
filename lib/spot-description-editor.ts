export type DescriptionFormat = 'H2' | 'H3' | 'H4' | 'Bold' | 'Italic' | 'Link' | 'Quote'

export function formatDescription(value: string, start: number, end: number, format: DescriptionFormat) {
  const selected = value.slice(start, end)
  const placeholder = format === 'Link' ? '链接文字' : format === 'Quote' ? '引用内容' : format.startsWith('H') ? '标题' : '文字'
  const content = selected || placeholder
  let insertion: string
  let selectionStart: number
  let selectionEnd: number
  if (format.startsWith('H') || format === 'Quote') {
    const marker = format === 'Quote' ? '> ' : `${'#'.repeat(Number(format.slice(1)))} `
    const leading = start > 0 && value[start - 1] !== '\n' ? '\n' : ''
    const trailing = end < value.length && value[end] !== '\n' ? '\n' : ''
    const block = content.split('\n').map((line) => marker + line).join('\n')
    insertion = leading + block + trailing
    selectionStart = start + leading.length + marker.length
    selectionEnd = start + leading.length + block.length
  } else {
    const marker = format === 'Bold' ? '**' : format === 'Italic' ? '*' : '['
    insertion = format === 'Link' ? `[${content}](https://example.com)` : `${marker}${content}${marker}`
    selectionStart = start + marker.length
    selectionEnd = selectionStart + content.length
    if (format === 'Link' && selected) {
      selectionStart = start + content.length + 3
      selectionEnd = selectionStart + 'https://example.com'.length
    }
  }
  return { value: value.slice(0, start) + insertion + value.slice(end), selectionStart, selectionEnd }
}
