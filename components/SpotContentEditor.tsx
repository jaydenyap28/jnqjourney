'use client'
import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/admin-fetch'
import type { SpotContentFields } from '@/lib/spot-content'
import { imageTextKey } from '@/lib/spot-content'
import OrderedRelationPicker from './OrderedRelationPicker'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'

export default function SpotContentEditor({ value, onChange, images }: {
  value: SpotContentFields; onChange: (value: SpotContentFields) => void; images: string[]
}) {
  const [notes, setNotes] = useState<Array<{ slug: string; title: string; published: boolean }>>([])
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    adminFetch('/api/admin/notes').then(async response => {
      if (!response.ok) throw new Error('无法读取 Notes；现有选择会保留。')
      const data = await response.json(); if (!cancelled) setNotes(data.notes || [])
    }).catch(error => { if (!cancelled) setError(error.message) })
    return () => { cancelled = true }
  }, [])
  const patch = (update: Partial<SpotContentFields>) => onChange({ ...value, ...update })
  return <div className="space-y-5">
    <fieldset className="space-y-3 rounded-xl border p-4"><legend className="px-2 font-medium">我们的体验 / JnQ Experience</legend>
      <p className="text-sm text-muted-foreground">仅填写亲身体验；与景点介绍分开。留空不显示。</p>
      {(['zh', 'en'] as const).map(lang => <label key={lang} className="block space-y-2 text-sm">{lang === 'zh' ? '中文体验' : 'English experience'}<Textarea rows={4} value={value[`experience_${lang}`] || ''} onChange={e => patch({ [`experience_${lang}`]: e.target.value })} /></label>)}
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
