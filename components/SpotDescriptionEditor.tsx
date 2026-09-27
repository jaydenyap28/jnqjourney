'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { Textarea } from './ui/textarea'
import { formatDescription, insertDescriptionImage, type DescriptionFormat } from '@/lib/spot-description-editor'

const formats: DescriptionFormat[] = ['H2', 'H3', 'H4', 'Bold', 'Italic', 'Link', 'Quote']

type SelectionSnapshot = {
  selectionStart: number
  selectionEnd: number
  scrollTop: number
}

export default function SpotDescriptionEditor({
  value,
  onChange,
  id = 'review',
  name = 'review',
  placeholder = '补充景点特色、注意事项、推荐玩法等',
  rows = 5,
  hint = '支持 Markdown：## H2、### H3、#### H4、**粗体**、*斜体*、[链接](https://...)、> 引用、`行内代码`。需要时可用 Image 直接上传一张正文图到 Cloudflare R2。',
  onUploadImage,
  imageAlt,
}: {
  value: string
  onChange: (value: string) => void
  id?: string
  name?: string
  placeholder?: string
  rows?: number
  hint?: string
  onUploadImage?: (file: File) => Promise<string>
  imageAlt?: string
}) {
  const container = useRef<HTMLDivElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const pending = useRef<SelectionSnapshot | null>(null)
  const imageSelection = useRef<SelectionSnapshot | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [imageError, setImageError] = useState('')

  useLayoutEffect(() => {
    const textarea = container.current?.querySelector('textarea')
    if (!textarea || !pending.current) return
    textarea.focus({ preventScroll: true })
    textarea.setSelectionRange(pending.current.selectionStart, pending.current.selectionEnd)
    textarea.scrollTop = pending.current.scrollTop
    pending.current = null
  }, [value])

  function currentSelection() {
    const textarea = container.current?.querySelector('textarea')
    if (!textarea) return null
    return {
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
      scrollTop: textarea.scrollTop,
    }
  }

  function apply(format: DescriptionFormat) {
    const textarea = container.current?.querySelector('textarea')
    if (!textarea) return
    const result = formatDescription(value, textarea.selectionStart, textarea.selectionEnd, format)
    pending.current = { ...result, scrollTop: textarea.scrollTop }
    onChange(result.value)
  }

  function chooseImage() {
    const selection = currentSelection()
    if (selection) imageSelection.current = selection
    setImageError('')
    imageInput.current?.click()
  }

  async function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !onUploadImage) return

    const selection = imageSelection.current || currentSelection() || {
      selectionStart: value.length,
      selectionEnd: value.length,
      scrollTop: 0,
    }

    setUploadingImage(true)
    setImageError('')

    try {
      const url = await onUploadImage(file)
      const fileNameAlt = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
      const alt = imageAlt?.trim() ? `${imageAlt.trim()} 景点图` : fileNameAlt || '景点图片'
      const result = insertDescriptionImage(value, selection.selectionStart, selection.selectionEnd, { url, alt })
      pending.current = { ...result, scrollTop: selection.scrollTop }
      onChange(result.value)
    } catch (error: any) {
      setImageError(error?.message || '图片上传失败')
    } finally {
      setUploadingImage(false)
      imageSelection.current = null
    }
  }

  return <div ref={container} className="space-y-2">
    <div role="group" aria-label="Description Markdown formatting" className="flex flex-wrap gap-1">
      {formats.map((format) => <button key={format} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => apply(format)} aria-controls={id} className="rounded border border-input bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{format}</button>)}
      {onUploadImage ? (
        <>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={chooseImage}
            disabled={uploadingImage}
            aria-controls={id}
            className="rounded border border-input bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploadingImage ? 'Uploading...' : 'Image'}
          </button>
          <input
            ref={imageInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={handleImageChange}
          />
        </>
      ) : null}
    </div>
    <Textarea id={id} name={name} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={rows} aria-describedby={`${id}-hint`} />
    <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>
    {imageError ? <p className="text-xs text-red-600">图片上传失败：{imageError}</p> : null}
  </div>
}
