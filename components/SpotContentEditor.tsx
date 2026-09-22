'use client'
import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/admin-fetch'
import type { SpotContentFields } from '@/lib/spot-content'
import { imageTextKey, spotContentChineseSource } from '@/lib/spot-content'
import OrderedRelationPicker from './OrderedRelationPicker'
import SpotDescriptionEditor from './SpotDescriptionEditor'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'

export default function SpotContentEditor({ value, onChange, images, spotId }: {
  value: SpotContentFields; onChange: (value: SpotContentFields) => void; images: string[]; spotId?: number
}) {
  const [notes, setNotes] = useState<Array<{ slug: string; title: string; published: boolean }>>([])
  const [error, setError] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generationMessage, setGenerationMessage] = useState('')
  useEffect(() => {
    let cancelled = false
    adminFetch('/api/admin/notes').then(async response => {
      if (!response.ok) throw new Error('无法读取 Notes；现有选择会保留。')
      const data = await response.json(); if (!cancelled) setNotes(data.notes || [])
    }).catch(error => { if (!cancelled) setError(error.message) })
    return () => { cancelled = true }
  }, [])
  const patch = (update: Partial<SpotContentFields>) => onChange({ ...value, ...update })
  async function generateEnglishDraft() {
    if (!spotId) return
    if (['experience_en', 'seo_title_en', 'seo_description_en'].some((key) => String(value[key as keyof SpotContentFields] || '').trim()) && !window.confirm('这会覆盖当前未保存的 Experience / SEO 英文内容，继续生成？')) return
    const source = spotContentChineseSource(value)
    setGenerating(true); setGenerationMessage('')
    try {
      const response = await adminFetch(`/api/admin/spot-content/${spotId}/generate-english`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'AI 英文草稿生成失败。')
      patch(payload.fields)
      setGenerationMessage('AI 草稿已生成，请检查后再保存。')
    } catch (generationError) { setGenerationMessage(generationError instanceof Error ? generationError.message : 'AI 英文草稿生成失败。') } finally { setGenerating(false) }
  }
  return <div className="space-y-5">
    {spotId ? <div className="flex flex-wrap items-center gap-3"><button type="button" disabled={generating} onClick={generateEnglishDraft} className="rounded border border-blue-600 px-3 py-1.5 text-sm text-blue-700 disabled:opacity-50">{generating ? 'AI 生成中…' : 'AI 生成 Experience + SEO 英文'}</button>{generationMessage ? <p role="status" className="text-sm">{generationMessage}</p> : null}</div> : null}
    <fieldset className="space-y-4 rounded-xl border p-4"><legend className="px-2 font-medium">我们的体验 / JnQ Experience</legend>
      <p className="text-sm text-muted-foreground">只写亲身体验、主观感受和实际建议；不要重复景点资讯。留空就不会显示。支持与景点资讯相同的 Markdown 排版。</p>
      {(['zh', 'en'] as const).map(lang => (
        <div key={lang} className="space-y-2 text-sm">
          <p className="font-medium">{lang === 'zh' ? '中文体验' : 'English experience'}</p>
          <SpotDescriptionEditor
            id={`experience-${lang}`}
            name={`experience_${lang}`}
            rows={6}
            value={value[`experience_${lang}`] || ''}
            onChange={next => patch({ [`experience_${lang}`]: next })}
            placeholder={lang === 'zh' ? '例如：我们实际几点到、人潮如何、哪个角度最好拍、值不值得特地来…' : 'What we actually experienced, what worked, what we would do differently, and practical tips.'}
            hint={lang === 'zh'
              ? '支持 Markdown：## H2、### H3、#### H4、**粗体**、*斜体*、[链接](https://...)、> 引用、`行内代码`'
              : 'Markdown supported: H2–H4, bold, italic, links, quotes, and inline code.'}
          />
        </div>
      ))}
    </fieldset>
    <details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">SEO</summary><div className="mt-4 grid gap-4 md:grid-cols-2">
      {(['zh', 'en'] as const).map(lang => <div key={lang} className="space-y-3">
        <label className="block space-y-2 text-sm">SEO Title ({lang})<Input value={value[`seo_title_${lang}`] || ''} onChange={e => patch({ [`seo_title_${lang}`]: e.target.value })} placeholder="留空使用景点名称 + JnQ Journey" /></label>
        <label className="block space-y-2 text-sm">Meta Description ({lang})<Textarea rows={3} value={value[`seo_description_${lang}`] || ''} onChange={e => patch({ [`seo_description_${lang}`]: e.target.value })} placeholder="留空使用景点介绍" /></label>
      </div>)}
    </div></details>
    <details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">Relationships / 内容关联</summary><div className="mt-4">
      {error ? <p role="alert">{error}</p> : null}
      <OrderedRelationPicker label="Related Notes / 相关攻略" options={notes.map(n => ({ id: n.slug, label: `${n.title}${n.published ? '' : '（草稿）'}` }))} value={value.related_note_slugs || []} onChange={ids => patch({ related_note_slugs: ids })} />
    </div></details>
    <details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">Image Alt / 图片说明</summary><div className="mt-4 space-y-4">
      {[...new Set(images.filter(Boolean).map(imageTextKey))].map((url, index) => <fieldset key={url} className="space-y-2 rounded border p-3"><legend>照片 {index + 1}</legend>
        <a href={url} target="_blank" rel="noreferrer" className="text-sm underline">查看图片</a>
        {(['alt_zh', 'alt_en', 'caption'] as const).map(key => <label key={key} className="block text-sm">{key}<Input value={value.image_metadata?.[url]?.[key] || ''} onChange={e => patch({ image_metadata: { ...value.image_metadata, [url]: { ...value.image_metadata?.[url], [key]: e.target.value } } })} /></label>)}
      </fieldset>)}
    </div></details>
    <details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">Redirect / Advanced</summary><div className="mt-4 space-y-3">
      <label className="block text-sm">发布状态 / Publication<select className="ml-3 rounded border bg-background p-2" value={value.publication_status || ''} onChange={e => patch({ publication_status: (e.target.value || null) as SpotContentFields['publication_status'] })}><option value="">沿用原有发布行为</option><option value="published">Published</option><option value="draft">Draft</option><option value="hidden">Hidden</option></select></label>
      <label className="block text-sm">Redirect URL<Input value={value.redirect_url || ''} onChange={e => patch({ redirect_url: e.target.value })} placeholder="/notes/article-slug" /></label>
      <label className="block text-sm">Redirect type<select className="ml-3 rounded border bg-background p-2" value={value.redirect_type || 301} onChange={e => patch({ redirect_type: Number(e.target.value) as 301 | 302 })}><option value={301}>301 Permanent</option><option value={302}>302 Temporary</option></select></label>
      <p className="text-sm text-muted-foreground">仅接受站内 /notes/ 或 /spot/ 地址。设置后旧网址将返回 HTTP 重定向；留空恢复正常发布状态。</p>
    </div></details>
  </div>
}
