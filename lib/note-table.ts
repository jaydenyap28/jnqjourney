export interface NoteTable {
  headers: string[]
  rows: string[][]
}

function cells(line: string) {
  return line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'))
}

/** Small GFM-style table subset; plain content remains plain if malformed. */
export function parseNoteTable(value?: string): NoteTable | null {
  const lines = String(value || '').trim().split('\n')
  if (lines.length < 2 || !lines[0].includes('|')) return null
  const headers = cells(lines[0])
  const separators = cells(lines[1])
  if (headers.length < 2 || separators.length !== headers.length || !separators.every(cell => /^:?-{3,}:?$/.test(cell))) return null
  const rows = lines.slice(2).map(cells)
  if (rows.some(row => row.length !== headers.length)) return null
  return { headers, rows }
}
