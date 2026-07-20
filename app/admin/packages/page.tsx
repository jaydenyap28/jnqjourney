'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, Loader2, Plus, Save } from 'lucide-react'

import { adminFetch } from '@/lib/admin-fetch'

type PackageStatus = 'draft' | 'published' | 'archived'
type PackageRow = Record<string, any> & { id?: number; slug: string; title_zh: string; status: PackageStatus }

const emptyForm: PackageRow = {
  slug: '', title_zh: '', title_en: '', destination: '', duration: '', short_description: '', full_description: '',
  cover_image: '', gallery: [], video_url: '', highlights: [], suitable_for: [], itinerary_days: [], included_items: [],
  excluded_items: [], notes: [], price_display: '', price_note: '', whatsapp_message: '', source_code: '', status: 'draft',
  featured: false, sort_order: 0, seo_title: '', seo_description: '', canonical_url: '', related_location_ids: [],
  related_guide_slugs: [], related_note_slugs: [], affiliate_link_ids: [],
}

const arrayFields = ['gallery', 'highlights', 'suitable_for', 'included_items', 'excluded_items', 'notes', 'related_location_ids', 'related_guide_slugs', 'related_note_slugs', 'affiliate_link_ids']

function lines(value: unknown) { return Array.isArray(value) ? value.join('\n') : '' }
function parseLines(value: string) { return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) }

export default function AdminPackagesPage() {
  const [rows, setRows] = useState<PackageRow[]>([])
  const [form, setForm] = useState<PackageRow>(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [itineraryJson, setItineraryJson] = useState('[]')

  const selectedId = form.id
  const title = useMemo(() => selectedId ? `编辑 #${selectedId}` : '建立旅游配套', [selectedId])

  const loadRows = async () => {
    setLoading(true)
    const response = await adminFetch('/api/admin/travel-packages', { cache: 'no-store' })
    const payload = await response.json()
    setRows(response.ok ? payload.packages || [] : [])
    if (!response.ok) setMessage(payload.error || '无法读取配套；请先执行数据库迁移。')
    setLoading(false)
  }

  useEffect(() => { void loadRows() }, [])

  const selectRow = (row: PackageRow) => {
    setForm({ ...emptyForm, ...row })
    setItineraryJson(JSON.stringify(row.itinerary_days || [], null, 2))
    setMessage('')
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
      setMessage('已保存。公开页面只会显示 published 状态。')
      await loadRows()
      selectRow(payload.package)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败。')
    } finally { setSaving(false) }
  }

  const set = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value }))

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 text-white md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs uppercase text-emerald-300/70">Content management</p><h1 className="mt-2 text-3xl font-semibold">旅游配套管理</h1></div><button onClick={() => { setForm(emptyForm); setItineraryJson('[]'); setMessage('') }} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 px-4 text-sm"><Plus className="h-4 w-4" />新增草稿</button></div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[18rem_1fr]">
        <aside className="space-y-2">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : rows.map((row) => <button key={row.id} onClick={() => selectRow(row)} className={`w-full rounded-xl border p-3 text-left ${row.id === selectedId ? 'border-emerald-300/50 bg-emerald-400/10' : 'border-white/10 bg-white/5'}`}><p className="font-medium">{row.title_zh}</p><p className="mt-1 text-xs text-white/45">{row.slug} · {row.status}</p></button>)}</aside>
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5 md:p-7"><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">{title}</h2>{form.status === 'published' && form.slug ? <Link href={`/packages/${form.slug}`} target="_blank" className="inline-flex items-center gap-2 text-sm text-emerald-200">查看页面 <ExternalLink className="h-4 w-4" /></Link> : null}</div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {[['slug','Slug'],['title_zh','中文标题'],['title_en','英文标题'],['destination','目的地'],['duration','天数'],['source_code','来源代码'],['cover_image','封面图片 URL'],['video_url','影片 URL'],['price_display','价格显示'],['canonical_url','Canonical URL'],['seo_title','SEO 标题'],['seo_description','SEO 描述']].map(([key,label]) => <label key={key} className={['short_description','seo_description'].includes(key) ? 'md:col-span-2' : ''}><span className="mb-1 block text-xs text-white/55">{label}</span><input value={form[key] || ''} onChange={(event) => set(key,event.target.value)} className="h-11 w-full rounded-lg border border-white/10 bg-black/25 px-3 text-sm" /></label>)}
            {[['short_description','简短介绍'],['full_description','完整介绍'],['price_note','价格说明'],['whatsapp_message','WhatsApp 模板']].map(([key,label]) => <label key={key} className="md:col-span-2"><span className="mb-1 block text-xs text-white/55">{label}</span><textarea value={form[key] || ''} onChange={(event) => set(key,event.target.value)} rows={3} className="w-full rounded-lg border border-white/10 bg-black/25 p-3 text-sm" /></label>)}
            {arrayFields.map((key) => <label key={key}><span className="mb-1 block text-xs text-white/55">{key}（每行一项）</span><textarea value={lines(form[key])} onChange={(event) => set(key,parseLines(event.target.value))} rows={5} className="w-full rounded-lg border border-white/10 bg-black/25 p-3 text-sm" /></label>)}
            <label className="md:col-span-2"><span className="mb-1 block text-xs text-white/55">行程 JSON：title、summary、items[]</span><textarea value={itineraryJson} onChange={(event) => setItineraryJson(event.target.value)} rows={12} spellCheck={false} className="w-full rounded-lg border border-white/10 bg-black/25 p-3 font-mono text-xs" /></label>
            <label><span className="mb-1 block text-xs text-white/55">状态</span><select value={form.status} onChange={(event) => set('status',event.target.value)} className="h-11 w-full rounded-lg border border-white/10 bg-[#111827] px-3"><option value="draft">draft</option><option value="published">published</option><option value="archived">archived</option></select></label>
            <label><span className="mb-1 block text-xs text-white/55">排序</span><input type="number" value={form.sort_order || 0} onChange={(event) => set('sort_order',Number(event.target.value))} className="h-11 w-full rounded-lg border border-white/10 bg-black/25 px-3" /></label>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={Boolean(form.featured)} onChange={(event) => set('featured',event.target.checked)} />首页推荐</label>
          </div>
          {message ? <p className="mt-5 rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-white/70">{message}</p> : null}
          <button onClick={save} disabled={saving} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black disabled:opacity-60"><Save className="h-4 w-4" />{saving ? '保存中' : '保存配套'}</button>
        </section>
      </div>
    </main>
  )
}
