'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, ClipboardCheck, Copy, Eye, ImagePlus, Loader2, Plus, Save, Search, Trash2, Upload } from 'lucide-react'

import FallbackImage from '@/components/FallbackImage'
import TiomanOptionsEditor from '@/components/TiomanOptionsEditor'
import { adminFetch } from '@/lib/admin-fetch'
import { buildWhatsAppUrl } from '@/lib/whatsapp'
import { isTiomanPackage } from '@/lib/tioman-packages'

type PackageStatus = 'draft' | 'published' | 'archived'
type GalleryImage = { url: string; alt: string; caption: string; sort_order: number }
type Region = { id: number; name: string; name_cn?: string; country?: string }
type PackageRow = Record<string, any> & { id?: number; slug: string; title_zh: string; title_en?: string; destination?: string; status: PackageStatus; gallery: GalleryImage[]; updated_at?: string }

const emptyForm: PackageRow = {
  slug: '', title_zh: '', title_en: '', destination: '', region_id: '', duration: '', short_description: '', full_description: '',
  cover_image: '', gallery: [], video_url: '', highlights: [], suitable_for: [], itinerary_days: [], included_items: [],
  excluded_items: [], notes: [], price_display: '', price_note: '', whatsapp_message: '', source_code: '', status: 'draft',
  featured: false, sort_order: 0, seo_title: '', seo_description: '', canonical_url: '', related_location_ids: [],
  related_guide_slugs: [], related_note_slugs: [], affiliate_link_ids: [],
}

const arrayFields = [
  ['highlights', '配套亮点'], ['suitable_for', '适合对象'], ['included_items', '配套包含'], ['excluded_items', '不包含项目'],
  ['notes', '行程与内部历史备注'], ['related_location_ids', '关联景点 ID'], ['related_guide_slugs', '关联攻略 Slug'],
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
function formatUpdated(value?: string) {
  if (!value) return '尚未记录'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })
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
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [destinationFilter, setDestinationFilter] = useState('all')
  const [sortDirection, setSortDirection] = useState<'newest' | 'oldest'>('newest')

  const selectedId = form.id
  const destinations = useMemo(() => Array.from(new Set(rows.map((row) => String(row.destination || '').trim()).filter(Boolean))).sort(), [rows])
  const filteredRows = useMemo(() => rows
    .filter((row) => !search.trim() || `${row.title_zh} ${row.title_en || ''} ${row.slug}`.toLowerCase().includes(search.trim().toLowerCase()))
    .filter((row) => statusFilter === 'all' || row.status === statusFilter)
    .filter((row) => destinationFilter === 'all' || row.destination === destinationFilter)
    .sort((left, right) => {
      const diff = Date.parse(right.updated_at || '') - Date.parse(left.updated_at || '')
      return sortDirection === 'newest' ? diff : -diff
    }), [destinationFilter, rows, search, sortDirection, statusFilter])

  const selectRow = useCallback((row: PackageRow) => {
    const next = { ...emptyForm, ...row, gallery: normalizeGallery(row.gallery) }
    setForm(next)
    setItineraryJson(JSON.stringify(row.itinerary_days || [], null, 2))
    setMessage('')
  }, [])

  const loadRows = useCallback(async () => {
    setLoading(true)
    try {
      const response = await adminFetch('/api/admin/travel-packages', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || '无法读取旅游配套。')
      const nextRows = (payload.packages || []).map((row: PackageRow) => ({ ...row, gallery: normalizeGallery(row.gallery) }))
      setRows(nextRows)
      setRegions(payload.regions || [])
      const editId = Number(new URLSearchParams(window.location.search).get('edit') || 0)
      const selected = nextRows.find((row: PackageRow) => row.id === editId)
      if (selected) selectRow(selected)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法读取旅游配套。')
    } finally { setLoading(false) }
  }, [selectRow])

  useEffect(() => { void loadRows() }, [loadRows])

  const set = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value }))
  const updateGallery = (index: number, patch: Partial<GalleryImage>) => set('gallery', form.gallery.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
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
      const isTioman = isTiomanPackage(form.slug)
      data.append('country', isTioman ? 'Malaysia' : 'Indonesia')
      data.append('city', isTioman ? 'Pulau Tioman' : form.destination || 'travel-package')
      data.append('locationSlug', form.slug || 'travel-package')
      data.append('field', target)
      const response = await adminFetch('/api/upload/r2', { method: 'POST', body: data })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || '图片上传失败。')
      const urls = Array.isArray(payload.urls) ? payload.urls : payload.url ? [payload.url] : []
      if (target === 'cover') set('cover_image', urls[0] || '')
      else {
        const start = form.gallery.length
        set('gallery', [...form.gallery, ...urls.map((url: string, index: number) => ({ url, alt: '', caption: '', sort_order: start + index }))])
      }
      setMessage(`已上传 ${urls.length} 张图片，保存后写入资料。`)
    } catch (error) { setMessage(error instanceof Error ? error.message : '图片上传失败。') }
    finally { setUploading('') }
  }

  const packagePayload = () => {
    const itinerary = JSON.parse(itineraryJson || '[]')
    if (!Array.isArray(itinerary)) throw new Error('行程 JSON 必须是数组。')
    return { ...form, itinerary_days: itinerary }
  }

  const save = async () => {
    setSaving(true); setMessage('')
    try {
      const response = await adminFetch('/api/admin/travel-packages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(packagePayload()) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || '保存失败。')
      const saved = { ...payload.package, gallery: normalizeGallery(payload.package.gallery) }
      setMessage('已保存。公开页面只会显示 published 状态。')
      await loadRows(); selectRow(saved)
    } catch (error) { setMessage(error instanceof Error ? error.message : '保存失败。') }
    finally { setSaving(false) }
  }

  const runPublishCheck = async (row = form) => {
    try {
      const payload = row.id === form.id ? packagePayload() : row
      const response = await adminFetch('/api/admin/travel-packages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, status: 'published', action: 'validate' }) })
      const result = await response.json()
      setMessage(response.ok ? result.message || '发布检查通过。' : result.error || '发布检查未通过。')
    } catch (error) { setMessage(error instanceof Error ? error.message : '发布检查失败。') }
  }

  const copyWhatsApp = async (row: PackageRow) => {
    const url = buildWhatsAppUrl({ pageType: 'package', packageName: row.title_zh, source: row.source_code, message: row.whatsapp_message })
    await navigator.clipboard.writeText(url)
    setMessage('已复制 WhatsApp 测试链接。')
  }

  const deletePackage = async (row: PackageRow) => {
    if (!row.id || !window.confirm(`确定删除“${row.title_zh}”吗？此操作无法恢复。`)) return
    const response = await adminFetch('/api/admin/travel-packages', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, confirmSlug: row.slug }) })
    const payload = await response.json()
    if (!response.ok) { setMessage(payload.error || '删除失败。'); return }
    setMessage('旅游配套已删除。'); setForm(emptyForm); setItineraryJson('[]'); await loadRows()
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 text-white md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs uppercase text-emerald-300/70">Content management</p><h1 className="mt-2 text-3xl font-semibold">旅游配套管理</h1><p className="mt-2 text-sm text-white/45">草稿、图片与发布检查集中管理</p></div><button type="button" onClick={() => { setForm(emptyForm); setItineraryJson('[]'); setMessage('') }} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/15 px-4 text-sm"><Plus className="h-4 w-4" />新增草稿</button></div>

      <div className="mt-7 grid gap-6 lg:grid-cols-[23rem_1fr]">
        <aside>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <label className="relative sm:col-span-2 lg:col-span-1"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-white/35" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索标题或 Slug" className="h-11 w-full rounded-lg border border-white/10 bg-white/5 pl-10 pr-3 text-sm" /></label>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-11 rounded-lg border border-white/10 bg-[#111827] px-3 text-sm"><option value="all">全部状态</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select>
            <select value={destinationFilter} onChange={(event) => setDestinationFilter(event.target.value)} className="h-11 rounded-lg border border-white/10 bg-[#111827] px-3 text-sm"><option value="all">全部目的地</option>{destinations.map((destination) => <option key={destination}>{destination}</option>)}</select>
            <button type="button" onClick={() => setSortDirection((value) => value === 'newest' ? 'oldest' : 'newest')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 text-sm"><ArrowDown className="h-4 w-4" />更新时间：{sortDirection === 'newest' ? '最新优先' : '最早优先'}</button>
          </div>

          <div className="mt-4 space-y-3">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : filteredRows.map((row) => {
            const missingCover = !row.cover_image
            const missingGallery = normalizeGallery(row.gallery).length < (isTiomanPackage(row.slug) ? 0 : 3)
            return <article key={row.id} className={`rounded-lg border p-4 ${row.id === selectedId ? 'border-emerald-300/45 bg-emerald-400/10' : 'border-white/10 bg-white/5'}`}><button type="button" onClick={() => selectRow(row)} className="w-full text-left"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{row.title_zh}</h2>{row.title_en ? <p className="mt-1 text-xs text-white/45">{row.title_en}</p> : null}</div><span className={`rounded-full px-2 py-1 text-[10px] uppercase ${row.status === 'published' ? 'bg-emerald-300/15 text-emerald-200' : 'bg-amber-300/15 text-amber-100'}`}>{row.status === 'draft' ? '草稿 Draft' : row.status}</span></div><p className="mt-2 text-xs text-white/40">{row.destination || '未设置目的地'} · {formatUpdated(row.updated_at)}</p><div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">{missingCover ? <span className="rounded bg-rose-300/10 px-2 py-1 text-rose-200">缺少封面图</span> : null}{missingGallery ? <span className="rounded bg-amber-300/10 px-2 py-1 text-amber-100">缺少至少 3 张图集</span> : null}{row.status !== 'published' ? <span className="rounded bg-white/5 px-2 py-1 text-white/45">尚未发布</span> : null}</div></button><div className="mt-4 flex flex-wrap gap-1.5"><button type="button" onClick={() => selectRow(row)} className="rounded-lg border border-white/10 p-2" title="编辑"><Save className="h-4 w-4" /></button><Link href={`/admin/packages/${row.id}/preview`} className="rounded-lg border border-white/10 p-2" title="草稿预览"><Eye className="h-4 w-4" /></Link><button type="button" onClick={() => void copyWhatsApp(row)} className="rounded-lg border border-white/10 p-2" title="复制 WhatsApp 测试链接"><Copy className="h-4 w-4" /></button><button type="button" onClick={() => void runPublishCheck(row)} className="rounded-lg border border-white/10 p-2" title="发布检查"><ClipboardCheck className="h-4 w-4" /></button><button type="button" onClick={() => void deletePackage(row)} className="rounded-lg border border-rose-300/20 p-2 text-rose-200" title="删除"><Trash2 className="h-4 w-4" /></button></div></article>
          })}{!loading && !filteredRows.length ? <p className="rounded-lg border border-dashed border-white/15 p-5 text-sm text-white/40">没有符合筛选条件的旅游配套。</p> : null}</div>
        </aside>

        <section className="rounded-lg border border-white/10 bg-white/5 p-5 md:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">{selectedId ? `编辑配套 #${selectedId}` : '建立旅游配套'}</h2>{selectedId ? <Link href={`/admin/packages/${selectedId}/preview`} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/15 px-3 text-sm text-emerald-100"><Eye className="h-4 w-4" />安全草稿预览</Link> : null}</div>
          {(!form.cover_image || (!isTiomanPackage(form.slug) && form.gallery.length < 3)) ? <div className="mt-5 rounded-lg border border-amber-300/25 bg-amber-300/10 p-4 text-sm text-amber-50">{isTiomanPackage(form.slug) ? '主配套使用横向地区封面；每个 Resort 海报在下方 options 中维护。当前状态应保持 draft。' : '请上传至少 1 张封面图和 3 张真实照片后再发布。当前状态应保持 draft。'}</div> : null}
          {form.slug === 'tioman-aman-resort-3d2n' ? <div className="mt-3 rounded-lg border border-amber-300/25 bg-amber-300/10 p-4 text-sm text-amber-50">海报中的儿童年龄 4 岁存在区间重叠。请在向旅行社确认前保持 draft；公开说明将提示儿童年龄及收费以最终确认资料为准。</div> : null}

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {[['slug','Slug'],['title_zh','中文标题'],['title_en','英文标题'],['destination','目的地'],['duration','天数'],['source_code','WhatsApp 来源代码'],['video_url','影片 URL'],['price_display','公开价格文字'],['canonical_url','Canonical URL'],['seo_title','SEO 标题']].map(([key,label]) => <label key={key}><span className="mb-1 block text-xs text-white/55">{label}</span><input value={form[key] || ''} onChange={(event) => set(key,event.target.value)} className="h-11 w-full rounded-lg border border-white/10 bg-black/25 px-3 text-sm" /></label>)}
            <label><span className="mb-1 block text-xs text-white/55">地区</span><select value={form.region_id || ''} onChange={(event) => set('region_id', Number(event.target.value) || '')} className="h-11 w-full rounded-lg border border-white/10 bg-[#111827] px-3"><option value="">请选择地区</option>{regions.map((region) => <option key={region.id} value={region.id}>{region.name_cn || region.name} · {region.name} · {region.country}</option>)}</select></label>
            <label className="md:col-span-2"><span className="mb-1 block text-xs text-white/55">Meta Description</span><textarea value={form.seo_description || ''} onChange={(event) => set('seo_description',event.target.value)} rows={3} className="w-full rounded-lg border border-white/10 bg-black/25 p-3 text-sm" /></label>
            {[['short_description','短简介'],['full_description','完整说明'],['price_note','价格说明'],['whatsapp_message','WhatsApp 文案']].map(([key,label]) => <label key={key} className="md:col-span-2"><span className="mb-1 block text-xs text-white/55">{label}</span><textarea value={form[key] || ''} onChange={(event) => set(key,event.target.value)} rows={key === 'full_description' || key === 'whatsapp_message' ? 7 : 3} className="w-full rounded-lg border border-white/10 bg-black/25 p-3 text-sm" /></label>)}
          </div>

          <div className="mt-8 border-t border-white/10 pt-6"><h3 className="text-lg font-semibold">图片</h3><div className="mt-4 grid gap-5 md:grid-cols-[14rem_1fr]"><div><p className="text-xs text-white/55">封面图</p><div className="relative mt-2 aspect-[4/3] overflow-hidden rounded-lg border border-white/10 bg-black/25">{form.cover_image ? <FallbackImage src={form.cover_image} alt={form.title_zh || '旅游配套封面'} fill className="object-cover" /> : <div className="flex h-full items-center justify-center text-white/30"><ImagePlus className="h-8 w-8" /></div>}</div><label className="mt-3 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-white/15 px-3 text-sm"><Upload className="h-4 w-4" />{uploading === 'cover' ? '上传中' : '上传封面'}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={(event) => void uploadImages(event.target.files, 'cover')} disabled={Boolean(uploading)} /></label><input value={form.cover_image || ''} onChange={(event) => set('cover_image', event.target.value)} placeholder="或输入封面 URL" className="mt-3 h-10 w-full rounded-lg border border-white/10 bg-black/25 px-3 text-xs" /></div><div><div className="flex items-center justify-between gap-3"><p className="text-xs text-white/55">实拍图集</p><label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-white/15 px-3 text-sm"><ImagePlus className="h-4 w-4" />{uploading === 'gallery' ? '上传中' : '添加图片'}<input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={(event) => void uploadImages(event.target.files, 'gallery')} disabled={Boolean(uploading)} /></label></div><div className="mt-3 space-y-3">{form.gallery.map((image, index) => <div key={`${image.url}-${index}`} className="grid gap-3 rounded-lg border border-white/10 bg-black/20 p-3 sm:grid-cols-[7rem_1fr_auto]"><div className="relative aspect-square overflow-hidden rounded-lg bg-black/30"><FallbackImage src={image.url} alt={image.alt || `图集照片 ${index + 1}`} fill className="object-cover" /></div><div className="space-y-2"><input value={image.url} onChange={(event) => updateGallery(index, { url: event.target.value })} aria-label={`图片 ${index + 1} URL`} className="h-9 w-full rounded-lg border border-white/10 bg-black/25 px-3 text-xs" /><input value={image.alt} onChange={(event) => updateGallery(index, { alt: event.target.value })} placeholder="Alt text" className="h-9 w-full rounded-lg border border-white/10 bg-black/25 px-3 text-xs" /><input value={image.caption} onChange={(event) => updateGallery(index, { caption: event.target.value })} placeholder="图片说明" className="h-9 w-full rounded-lg border border-white/10 bg-black/25 px-3 text-xs" /></div><div className="flex gap-1 sm:flex-col"><button type="button" title="向前移动" onClick={() => moveGallery(index, -1)} className="rounded-lg border border-white/10 p-2" disabled={index === 0}><ArrowUp className="h-4 w-4" /></button><button type="button" title="向后移动" onClick={() => moveGallery(index, 1)} className="rounded-lg border border-white/10 p-2" disabled={index === form.gallery.length - 1}><ArrowDown className="h-4 w-4" /></button><button type="button" title="删除图片" onClick={() => set('gallery', form.gallery.filter((_, itemIndex) => itemIndex !== index).map((item, sort_order) => ({ ...item, sort_order })))} className="rounded-lg border border-rose-300/20 p-2 text-rose-200"><Trash2 className="h-4 w-4" /></button></div></div>)}{!form.gallery.length ? <p className="rounded-lg border border-dashed border-white/15 p-5 text-sm text-white/40">尚未上传实拍图。</p> : null}</div></div></div></div>

          <div className="mt-8 grid gap-4 border-t border-white/10 pt-6 md:grid-cols-2">{arrayFields.map(([key, label]) => <label key={key}><span className="mb-1 block text-xs text-white/55">{label}（每行一项）</span><textarea value={lines(form[key])} onChange={(event) => set(key,parseLines(event.target.value))} rows={5} className="w-full rounded-lg border border-white/10 bg-black/25 p-3 text-sm" /></label>)}<label className="md:col-span-2"><span className="mb-1 block text-xs text-white/55">Day 1 / Day 2 / Day 3 行程 JSON：title、summary、items[]</span><textarea value={itineraryJson} onChange={(event) => setItineraryJson(event.target.value)} rows={12} spellCheck={false} className="w-full rounded-lg border border-white/10 bg-black/25 p-3 font-mono text-xs" /></label><label><span className="mb-1 block text-xs text-white/55">状态</span><select value={form.status} onChange={(event) => set('status',event.target.value)} className="h-11 w-full rounded-lg border border-white/10 bg-[#111827] px-3"><option value="draft">draft</option><option value="published">published</option><option value="archived">archived</option></select></label><label><span className="mb-1 block text-xs text-white/55">排序</span><input type="number" value={form.sort_order || 0} onChange={(event) => set('sort_order',Number(event.target.value))} className="h-11 w-full rounded-lg border border-white/10 bg-black/25 px-3" /></label><label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={Boolean(form.featured)} onChange={(event) => set('featured',event.target.checked)} />首页推荐</label></div>
          {form.slug === 'tioman-3d2n' && form.id ? <TiomanOptionsEditor packageId={Number(form.id)} /> : null}
          {message ? <p className="mt-5 rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-white/70">{message}</p> : null}
          <div className="mt-6 flex flex-wrap gap-2"><button type="button" onClick={save} disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-5 text-sm font-semibold text-black disabled:opacity-60"><Save className="h-4 w-4" />{saving ? '保存中' : '保存配套'}</button><button type="button" onClick={() => void runPublishCheck()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/15 px-4 text-sm"><ClipboardCheck className="h-4 w-4" />发布检查</button></div>
        </section>
      </div>
    </main>
  )
}
