'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, ExternalLink, ImagePlus, Loader2, Plus, Save, Trash2, Upload } from 'lucide-react'

import FallbackImage from '@/components/FallbackImage'
import { adminFetch } from '@/lib/admin-fetch'

type PackageStatus = 'draft' | 'published' | 'archived'
type GalleryImage = { url: string; alt: string; caption: string; sort_order: number }
type Region = { id: number; name: string; name_cn?: string; country?: string }
type PackageRow = Record<string, any> & { id?: number; slug: string; title_zh: string; status: PackageStatus; gallery: GalleryImage[] }

const emptyForm: PackageRow = {
  slug: '', title_zh: '', title_en: '', destination: '', region_id: '', duration: '', short_description: '', full_description: '',
  cover_image: '', gallery: [], video_url: '', highlights: [], suitable_for: [], itinerary_days: [], included_items: [],
  excluded_items: [], notes: [], price_display: '', price_note: '', whatsapp_message: '', source_code: '', status: 'draft',
  featured: false, sort_order: 0, seo_title: '', seo_description: '', canonical_url: '', related_location_ids: [],
  related_guide_slugs: [], related_note_slugs: [], affiliate_link_ids: [],
}

const arrayFields = [
  ['highlights', '配套亮点'], ['suitable_for', '适合对象'], ['included_items', '配套包含'], ['excluded_items', '不包含项目'],
  ['notes', '内部备注'], ['related_location_ids', '关联景点 ID'], ['related_guide_slugs', '关联攻略 Slug'],
  ['related_note_slugs', '关联长文 Slug'], ['affiliate_link_ids', '联盟产品 ID'],
]

function lines(value: unknown) { return Array.isArray(value) ? value.join('\n') : '' }
function parseLines(value: string) { return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) }
function normalizeGallery(value: unknown): GalleryImage[] {
  if (!Array.isArray(value)) return []
  return value.map((item, index) => typeof item === 'string'
    ? { url: item, alt: '', caption: '', sort_order: index }
    : { url: String(item?.url || ''), alt: String(item?.alt || ''), caption: String(item?.caption || ''), sort_order: Number(item?.sort_order ?? index) }
  ).filter((item) => item.url)
}

export default function AdminPackagesPage() {
  const [rows, setRows] = useState<PackageRow[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [form, setForm] = useState<PackageRow>(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<'cover' | 'gallery' | ''>('')
  const [message, setMessage] = useState('')
  const [itineraryJson, setItineraryJson] = useState('[]')

  const selectedId = form.id
  const title = useMemo(() => selectedId ? `编辑配套 #${selectedId}` : '建立旅游配套', [selectedId])
  const missingImages = !form.cover_image || form.gallery.length < 3

  const loadRows = async () => {
    setLoading(true)
    const response = await adminFetch('/api/admin/travel-packages', { cache: 'no-store' })
    const payload = await response.json()
    setRows(response.ok ? (payload.packages || []).map((row: PackageRow) => ({ ...row, gallery: normalizeGallery(row.gallery) })) : [])
    setRegions(response.ok ? payload.regions || [] : [])
    if (!response.ok) setMessage(payload.error || '无法读取配套，请确认数据库迁移已经执行。')
    setLoading(false)
  }

  useEffect(() => { void loadRows() }, [])

  const selectRow = (row: PackageRow) => {
    const next = { ...emptyForm, ...row, gallery: normalizeGallery(row.gallery) }
    setForm(next)
    setItineraryJson(JSON.stringify(row.itinerary_days || [], null, 2))
    setMessage('')
  }

  const set = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value }))

  const updateGallery = (index: number, patch: Partial<GalleryImage>) => {
    set('gallery', form.gallery.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  }

  const moveGallery = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= form.gallery.length) return
    const next = [...form.gallery]
    ;[next[index], next[target]] = [next[target], next[index]]
    set('gallery', next.map((item, sort_order) => ({ ...item, sort_order })))
  }

  const uploadImages = async (files: FileList | null, target: 'cover' | 'gallery') => {
    if (!files?.length) return
    setUploading(target)
    setMessage('')
    try {
      const data = new FormData()
      Array.from(files).forEach((file) => data.append('files', file))
      data.append('category', 'packages')
      data.append('country', 'Indonesia')
      data.append('city', 'Batam')
      data.append('locationSlug', form.slug || 'travel-package')
      data.append('field', target)
      const response = await adminFetch('/api/upload/r2', { method: 'POST', body: data })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || '图片上传失败。')
      const urls = Array.isArray(payload.urls) ? payload.urls : payload.url ? [payload.url] : []
      if (target === 'cover') {
        set('cover_image', urls[0] || '')
      } else {
        const start = form.gallery.length
        set('gallery', [...form.gallery, ...urls.map((url: string, index: number) => ({ url, alt: '', caption: '', sort_order: start + index }))])
      }
      setMessage(`已上传 ${urls.length} 张图片，保存配套后才会写入资料。`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '图片上传失败。')
    } finally {
      setUploading('')
    }
  }

  const save = async () => {
    setSaving(true)
    setMessage('')
    try {
      const itinerary = JSON.parse(itineraryJson || '[]')
      if (!Array.isArray(itinerary)) throw new Error('行程 JSON 必须是数组。')
      const response = await adminFetch('/api/admin/travel-packages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, itinerary_days: itinerary }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || '保存失败。')
      const saved = { ...payload.package, gallery: normalizeGallery(payload.package.gallery) }
      setMessage('已保存。公开页面只会显示 published 状态的配套。')
      await loadRows()
      selectRow(saved)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败。')
    } finally { setSaving(false) }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 text-white md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs uppercase text-emerald-300/70">Content management</p><h1 className="mt-2 text-3xl font-semibold">旅游配套管理</h1></div>
        <button type="button" onClick={() => { setForm(emptyForm); setItineraryJson('[]'); setMessage('') }} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/15 px-4 text-sm"><Plus className="h-4 w-4" />新增草稿</button>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[18rem_1fr]">
        <aside className="space-y-2">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : rows.map((row) => <button key={row.id} type="button" onClick={() => selectRow(row)} className={`w-full rounded-lg border p-3 text-left ${row.id === selectedId ? 'border-emerald-300/50 bg-emerald-400/10' : 'border-white/10 bg-white/5'}`}><p className="font-medium">{row.title_zh}</p><p className="mt-1 text-xs text-white/45">{row.slug} · {row.status}</p></button>)}</aside>

        <section className="rounded-lg border border-white/10 bg-white/5 p-5 md:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">{title}</h2>{form.slug ? <Link href={`/packages/${form.slug}`} target="_blank" className="inline-flex items-center gap-2 text-sm text-emerald-200">{form.status === 'published' ? '查看公开页面' : '公开路径（草稿会显示 404）'} <ExternalLink className="h-4 w-4" /></Link> : null}</div>

          {missingImages ? <div className="mt-5 rounded-lg border border-amber-300/25 bg-amber-300/10 p-4 text-sm text-amber-50">请上传至少 1 张封面图和 3 张巴淡岛实拍照片后再发布。当前会继续保持草稿状态。</div> : null}

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {[['slug','Slug'],['title_zh','中文标题'],['title_en','英文标题'],['destination','目的地'],['duration','天数'],['source_code','来源代码'],['video_url','影片 URL'],['price_display','价格显示'],['canonical_url','Canonical URL'],['seo_title','SEO 标题']].map(([key,label]) => <label key={key}><span className="mb-1 block text-xs text-white/55">{label}</span><input value={form[key] || ''} onChange={(event) => set(key,event.target.value)} className="h-11 w-full rounded-lg border border-white/10 bg-black/25 px-3 text-sm" /></label>)}
            <label><span className="mb-1 block text-xs text-white/55">地区</span><select value={form.region_id || ''} onChange={(event) => set('region_id', Number(event.target.value) || '')} className="h-11 w-full rounded-lg border border-white/10 bg-[#111827] px-3"><option value="">请选择地区</option>{regions.map((region) => <option key={region.id} value={region.id}>{region.name_cn || region.name} · {region.name} · {region.country}</option>)}</select></label>
            <label className="md:col-span-2"><span className="mb-1 block text-xs text-white/55">SEO 描述</span><textarea value={form.seo_description || ''} onChange={(event) => set('seo_description',event.target.value)} rows={3} className="w-full rounded-lg border border-white/10 bg-black/25 p-3 text-sm" /></label>
            {[['short_description','简短介绍'],['full_description','完整介绍'],['price_note','价格说明'],['whatsapp_message','WhatsApp 预填信息']].map(([key,label]) => <label key={key} className="md:col-span-2"><span className="mb-1 block text-xs text-white/55">{label}</span><textarea value={form[key] || ''} onChange={(event) => set(key,event.target.value)} rows={key === 'full_description' || key === 'whatsapp_message' ? 7 : 3} className="w-full rounded-lg border border-white/10 bg-black/25 p-3 text-sm" /></label>)}
          </div>

          <div className="mt-8 border-t border-white/10 pt-6">
            <h3 className="text-lg font-semibold">图片</h3>
            <div className="mt-4 grid gap-5 md:grid-cols-[14rem_1fr]">
              <div><p className="text-xs text-white/55">封面图</p><div className="relative mt-2 aspect-[4/3] overflow-hidden rounded-lg border border-white/10 bg-black/25">{form.cover_image ? <FallbackImage src={form.cover_image} alt={form.title_zh || '旅游配套封面'} fill className="object-cover" /> : <div className="flex h-full items-center justify-center text-white/30"><ImagePlus className="h-8 w-8" /></div>}</div><label className="mt-3 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-white/15 px-3 text-sm"><Upload className="h-4 w-4" />{uploading === 'cover' ? '上传中' : '上传封面'}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={(event) => void uploadImages(event.target.files, 'cover')} disabled={Boolean(uploading)} /></label><input value={form.cover_image || ''} onChange={(event) => set('cover_image', event.target.value)} placeholder="或输入封面 URL" className="mt-3 h-10 w-full rounded-lg border border-white/10 bg-black/25 px-3 text-xs" /></div>
              <div><div className="flex items-center justify-between gap-3"><p className="text-xs text-white/55">实拍图集</p><label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-white/15 px-3 text-sm"><ImagePlus className="h-4 w-4" />{uploading === 'gallery' ? '上传中' : '添加图片'}<input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={(event) => void uploadImages(event.target.files, 'gallery')} disabled={Boolean(uploading)} /></label></div><div className="mt-3 space-y-3">{form.gallery.map((image, index) => <div key={`${image.url}-${index}`} className="grid gap-3 rounded-lg border border-white/10 bg-black/20 p-3 sm:grid-cols-[7rem_1fr_auto]"><div className="relative aspect-square overflow-hidden rounded-lg bg-black/30"><FallbackImage src={image.url} alt={image.alt || `图集照片 ${index + 1}`} fill className="object-cover" /></div><div className="space-y-2"><input value={image.url} onChange={(event) => updateGallery(index, { url: event.target.value })} aria-label={`图片 ${index + 1} URL`} className="h-9 w-full rounded-lg border border-white/10 bg-black/25 px-3 text-xs" /><input value={image.alt} onChange={(event) => updateGallery(index, { alt: event.target.value })} placeholder="Alt text：描述照片内容" className="h-9 w-full rounded-lg border border-white/10 bg-black/25 px-3 text-xs" /><input value={image.caption} onChange={(event) => updateGallery(index, { caption: event.target.value })} placeholder="图片说明（可选）" className="h-9 w-full rounded-lg border border-white/10 bg-black/25 px-3 text-xs" /></div><div className="flex gap-1 sm:flex-col"><button type="button" title="向前移动" onClick={() => moveGallery(index, -1)} className="rounded-lg border border-white/10 p-2 disabled:opacity-30" disabled={index === 0}><ArrowUp className="h-4 w-4" /></button><button type="button" title="向后移动" onClick={() => moveGallery(index, 1)} className="rounded-lg border border-white/10 p-2 disabled:opacity-30" disabled={index === form.gallery.length - 1}><ArrowDown className="h-4 w-4" /></button><button type="button" title="删除图片" onClick={() => set('gallery', form.gallery.filter((_, itemIndex) => itemIndex !== index).map((item, sort_order) => ({ ...item, sort_order })))} className="rounded-lg border border-rose-300/20 p-2 text-rose-200"><Trash2 className="h-4 w-4" /></button></div></div>)}{!form.gallery.length ? <p className="rounded-lg border border-dashed border-white/15 p-5 text-sm text-white/40">尚未上传实拍图。</p> : null}</div></div>
            </div>
          </div>

          <div className="mt-8 grid gap-4 border-t border-white/10 pt-6 md:grid-cols-2">{arrayFields.map(([key, label]) => <label key={key}><span className="mb-1 block text-xs text-white/55">{label}（每行一项）</span><textarea value={lines(form[key])} onChange={(event) => set(key,parseLines(event.target.value))} rows={5} className="w-full rounded-lg border border-white/10 bg-black/25 p-3 text-sm" /></label>)}<label className="md:col-span-2"><span className="mb-1 block text-xs text-white/55">行程 JSON：title、summary、items[]</span><textarea value={itineraryJson} onChange={(event) => setItineraryJson(event.target.value)} rows={12} spellCheck={false} className="w-full rounded-lg border border-white/10 bg-black/25 p-3 font-mono text-xs" /></label><label><span className="mb-1 block text-xs text-white/55">状态</span><select value={form.status} onChange={(event) => set('status',event.target.value)} className="h-11 w-full rounded-lg border border-white/10 bg-[#111827] px-3"><option value="draft">draft</option><option value="published">published</option><option value="archived">archived</option></select></label><label><span className="mb-1 block text-xs text-white/55">排序</span><input type="number" value={form.sort_order || 0} onChange={(event) => set('sort_order',Number(event.target.value))} className="h-11 w-full rounded-lg border border-white/10 bg-black/25 px-3" /></label><label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={Boolean(form.featured)} onChange={(event) => set('featured',event.target.checked)} />首页推荐</label></div>

          {message ? <p className="mt-5 rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-white/70">{message}</p> : null}
          <button type="button" onClick={save} disabled={saving} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-5 text-sm font-semibold text-black disabled:opacity-60"><Save className="h-4 w-4" />{saving ? '保存中' : '保存配套'}</button>
        </section>
      </div>
    </main>
  )
}
