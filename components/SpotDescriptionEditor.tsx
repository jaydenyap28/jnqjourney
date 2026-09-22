'use client'

import { useLayoutEffect, useRef } from 'react'
import { Textarea } from './ui/textarea'
import { formatDescription, type DescriptionFormat } from '@/lib/spot-description-editor'

const formats: DescriptionFormat[] = ['H2', 'H3', 'H4', 'Bold', 'Italic', 'Link', 'Quote']

export default function SpotDescriptionEditor({
  value,
  onChange,
  id = 'review',
  name = 'review',
  placeholder = '补充景点特色、注意事项、推荐玩法等',
  rows = 5,
  hint = '支持 Markdown：## H2、### H3、#### H4、**粗体**、*斜体*、[链接](https://...)、> 引用、\`行内代码\`。选中文字后点击按钮；未选择时插入占位文字。',
}: {
  value: string
  onChange: (value: string) => void
  id?: string
  name?: string
  placeholder?: string
  rows?: number
  hint?: string
}) {
  const container = useRef<HTMLDivElement>(null)
  const pending = useRef<{ selectionStart: number; selectionEnd: number; scrollTop: number } | null>(null)
  useLayoutEffect(() => {
    const textarea = container.current?.querySelector('textarea')
    if (!textarea || !pending.current) return
    textarea.focus({ preventScroll: true })
    textarea.setSelectionRange(pending.current.selectionStart, pending.current.selectionEnd)
    textarea.scrollTop = pending.current.scrollTop
    pending.current = null
  }, [value])

  function apply(format: DescriptionFormat) {
    const textarea = container.current?.querySelector('textarea')
    if (!textarea) return
    const result = formatDescription(value, textarea.selectionStart, textarea.selectionEnd, format)
    pending.current = { ...result, scrollTop: textarea.scrollTop }
    onChange(result.value)
  }

  return <div ref={container} className="space-y-2">
    <div role="group" aria-label="Description Markdown formatting" className="flex flex-wrap gap-1">
      {formats.map((format) => <button key={format} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => apply(format)} aria-controls={id} className="rounded border border-input bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{format}</button>)}
    </div>
    <Textarea id={id} name={name} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={rows} aria-describedby={`${id}-hint`} />
    <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>
  </div>
}
