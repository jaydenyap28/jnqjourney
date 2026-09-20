'use client'
import { useState } from 'react'
import { Input } from './ui/input'
import { Button } from './ui/button'

export default function OrderedRelationPicker({ label, options, value, onChange }: {
  label: string; options: Array<{ id: string; label: string }>; value: string[]; onChange: (ids: string[]) => void
}) {
  const [query, setQuery] = useState('')
  const results = options.filter(o => !value.includes(o.id) && o.label.toLowerCase().includes(query.toLowerCase())).slice(0, 20)
  function move(index: number, direction: number) {
    const next = [...value]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; onChange(next)
  }
  return <fieldset className="space-y-3 rounded-xl border p-4">
    <legend className="px-2 text-sm font-medium">{label}</legend>
    <ol className="space-y-2">{value.map((id, index) => <li key={id} className="flex items-center gap-2 text-sm">
      <span className="min-w-0 flex-1 break-words">{index + 1}. {options.find(o => o.id === id)?.label || `${id}（未公开或不可用）`}</span>
      <Button type="button" variant="outline" size="sm" className="text-foreground" aria-label={`上移 ${id}`} disabled={index === 0} onClick={() => move(index, -1)}>↑</Button>
      <Button type="button" variant="outline" size="sm" className="text-foreground" aria-label={`下移 ${id}`} disabled={index === value.length - 1} onClick={() => move(index, 1)}>↓</Button>
      <Button type="button" variant="outline" size="sm" className="text-foreground" aria-label={`移除 ${id}`} onClick={() => onChange(value.filter(item => item !== id))}>移除</Button>
    </li>)}</ol>
    <Input aria-label={`搜索 ${label}`} placeholder="搜索名称…" value={query} onChange={event => setQuery(event.target.value)} />
    <div className="max-h-48 space-y-1 overflow-y-auto">{results.map(o => <button key={o.id} type="button" className="block w-full rounded px-2 py-2 text-left text-sm hover:bg-muted hover:text-foreground" onClick={() => onChange([...value, o.id])}>＋ {o.label}</button>)}</div>
  </fieldset>
}
