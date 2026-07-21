'use client'

import { useCallback, useEffect, useState } from 'react'
import { Copy, Eye, Loader2, Save } from 'lucide-react'

import { adminFetch } from '@/lib/admin-fetch'
import { buildWhatsAppUrl } from '@/lib/whatsapp'
import type { TravelPackageOption } from '@/lib/server/travel-packages'

type OptionForm = TravelPackageOption & { galleryText: string; rowsText: string; includedText: string; excludedText: string; notesText: string; suitableText: string }
const toLines = (items?: string[] | null) => (items || []).join('\n')
const fromLines = (value: string) => value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)
const toForm = (option: TravelPackageOption): OptionForm => ({ ...option, galleryText: JSON.stringify(option.gallery || [], null, 2), rowsText: JSON.stringify(option.price_rows || [], null, 2), includedText: toLines(option.included_items), excludedText: toLines(option.excluded_items), notesText: toLines(option.notes), suitableText: toLines(option.suitable_for) })

export default function TiomanOptionsEditor({ packageId }: { packageId: number }) {
  const [options, setOptions] = useState<TravelPackageOption[]>([])
  const [form, setForm] = useState<OptionForm | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await adminFetch(`/api/admin/travel-package-options?packageId=${packageId}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || '无法读取住宿选项。')
      setOptions(payload.options || [])
      setForm((current) => current ? toForm((payload.options || []).find((option: TravelPackageOption) => option.id === current.id) || payload.options?.[0]) : toForm(payload.options?.[0]))
    } catch (error) { setMessage(error instanceof Error ? error.message : '无法读取住宿选项。') } finally { setLoading(false) }
  }, [packageId])
  useEffect(() => { void load() }, [load])

  const set = (key: keyof OptionForm, value: unknown) => setForm((current) => current ? { ...current, [key]: value } : current)
  const save = async () => {
    if (!form) return
    setMessage('')
    try {
      const payload = { ...form, gallery: JSON.parse(form.galleryText || '[]'), price_rows: JSON.parse(form.rowsText || '[]'), included_items: fromLines(form.includedText), excluded_items: fromLines(form.excludedText), notes: fromLines(form.notesText), suitable_for: fromLines(form.suitableText) }
      const response = await adminFetch('/api/admin/travel-package-options', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '无法保存住宿选项。')
      setMessage('已保存 option。')
      await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : '无法保存住宿选项。') }
  }
  const copyWhatsApp = async (option: TravelPackageOption) => {
    await navigator.clipboard.writeText(buildWhatsAppUrl({ pageType: 'package', packageName: '刁曼岛 3天2夜浮潜配套 2026', source: option.source_code || undefined, message: option.whatsapp_message || undefined }))
    setMessage('已复制此 Resort 的 WhatsApp 测试链接。')
  }

  if (loading) return <div className="mt-8 flex items-center gap-2 text-sm text-white/55"><Loader2 className="h-4 w-4 animate-spin" />读取住宿选项</div>
  if (!form) return <div className="mt-8 border border-dashed border-white/15 p-5 text-sm text-white/55">尚未建立住宿选项。</div>

  return <section className="mt-10 border-t border-white/10 pt-8"><div><p className="text-xs uppercase text-emerald-200/70">Package options</p><h3 className="mt-2 text-xl font-semibold">Resort 与房价选项</h3><p className="mt-2 text-sm text-white/50">Paya、Aman 与 The Barat 是同一主配套下的选项，不会出现在主配套列表。</p></div>
    <div className="mt-5 grid gap-2 md:grid-cols-3">{options.map((option) => <button type="button" key={option.id} onClick={() => setForm(toForm(option))} className={`border p-4 text-left ${form.id === option.id ? 'border-amber-200/60 bg-amber-200/10' : 'border-white/10 bg-black/15'}`}><p className="font-medium">{option.name_zh}</p><p className="mt-1 text-sm text-amber-100">{option.price_display}</p><p className="mt-2 text-xs text-white/45">{option.status} · {option.price_unit}</p></button>)}</div>
    <div className="mt-6 grid gap-4 md:grid-cols-2">{([['name_zh', 'Resort 名称'], ['slug', 'Option slug'], ['accommodation_name', '住宿名称'], ['accommodation_type', '住宿类型'], ['village_name', 'Kampung'], ['price_from', '价格起点'], ['price_display', '公开价格'], ['validity_label', '有效期'], ['source_code', 'WhatsApp 来源码']] as const).map(([key, label]) => <label key={key}><span className="mb-1 block text-xs text-white/55">{label}</span><input value={String(form[key] ?? '')} onChange={(event) => set(key, key === 'price_from' ? Number(event.target.value) : event.target.value)} className="h-10 w-full border border-white/10 bg-black/25 px-3 text-sm" /></label>)}
      <label><span className="mb-1 block text-xs text-white/55">价格单位</span><select value={form.price_unit} onChange={(event) => set('price_unit', event.target.value as OptionForm['price_unit'])} className="h-10 w-full border border-white/10 bg-[#111827] px-3 text-sm"><option value="person">每人</option><option value="room">每房</option><option value="package">每配套</option><option value="group">每团</option></select></label>
      <label><span className="mb-1 block text-xs text-white/55">状态</span><select value={form.status} onChange={(event) => set('status', event.target.value as OptionForm['status'])} className="h-10 w-full border border-white/10 bg-[#111827] px-3 text-sm"><option value="active">启用</option><option value="inactive">停用</option><option value="archived">归档</option></select></label></div>
    <label className="mt-4 block"><span className="mb-1 block text-xs text-white/55">简介</span><textarea value={form.short_description || ''} onChange={(event) => set('short_description', event.target.value)} rows={3} className="w-full border border-white/10 bg-black/25 p-3 text-sm" /></label>
    {([['rowsText', '价格行 JSON'], ['includedText', '包含项目，每行一项'], ['excludedText', '不包括项目，每行一项'], ['notesText', '注意事项，每行一项'], ['suitableText', '适合对象，每行一项'], ['galleryText', '海报与图库 JSON'], ['whatsapp_message', 'WhatsApp 预填文字']] as const).map(([key, label]) => <label key={key} className="mt-4 block"><span className="mb-1 block text-xs text-white/55">{label}</span><textarea value={String(form[key] || '')} onChange={(event) => set(key, event.target.value)} rows={key === 'whatsapp_message' ? 6 : 4} className="w-full border border-white/10 bg-black/25 p-3 font-mono text-xs" /></label>)}
    <div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={() => void save()} className="inline-flex min-h-10 items-center gap-2 bg-white px-4 text-sm font-medium text-black"><Save className="h-4 w-4" />保存 option</button><button type="button" onClick={() => void copyWhatsApp(form)} className="inline-flex min-h-10 items-center gap-2 border border-white/15 px-4 text-sm"><Copy className="h-4 w-4" />复制 WhatsApp</button>{form.gallery?.[0]?.url ? <a href={form.gallery[0].url} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 border border-white/15 px-4 text-sm"><Eye className="h-4 w-4" />查看海报</a> : null}</div>
    {message ? <p className="mt-4 text-sm text-amber-100">{message}</p> : null}
  </section>
}
