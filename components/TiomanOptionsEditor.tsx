'use client'

import { useCallback, useEffect, useState } from 'react'
import { Copy, Eye, ImagePlus, Loader2, Save, Trash2 } from 'lucide-react'

import { adminFetch } from '@/lib/admin-fetch'
import { buildWhatsAppUrl } from '@/lib/whatsapp'
import type { TravelPackageOption } from '@/lib/server/travel-packages'

type AdminOption = TravelPackageOption & {
  supplier_ref?: string | null
  supplier_package_name?: string | null
  internal_notes?: string[] | null
}

type OptionForm = AdminOption & {
  galleryText: string
  rowsText: string
  includedText: string
  excludedText: string
  notesText: string
  suitableText: string
  highlightsText: string
  itineraryText: string
  internalNotesText: string
}

const toLines = (items?: string[] | null) => (items || []).join('\n')
const fromLines = (value: string) => value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)

function matchBatamBrochureSlug(fileName: string) {
  const name = fileName.toLowerCase()
  if (name.includes('非常优惠')) return 'amazing-promo-499'
  if (name.includes('新品新版本')) return 'new-version-599'
  if (name.includes('economy')) return 'economy-island'
  if (name.includes('goa cave')) return 'goa-cave'
  if (name.includes('龙虾餐')) return 'lobster-lunch'
  if (name.includes('海盗船')) return 'pirate-afternoon-tea'
  return ''
}

const toForm = (option: AdminOption): OptionForm => ({
  ...option,
  galleryText: JSON.stringify(option.gallery || [], null, 2),
  rowsText: JSON.stringify(option.price_rows || [], null, 2),
  includedText: toLines(option.included_items),
  excludedText: toLines(option.excluded_items),
  notesText: toLines(option.notes),
  suitableText: toLines(option.suitable_for),
  highlightsText: toLines(option.highlights),
  itineraryText: JSON.stringify(option.itinerary_days || [], null, 2),
  internalNotesText: toLines(option.internal_notes),
})

export default function TiomanOptionsEditor({ packageId, packageSlug = 'tioman-3d2n', packageTitle = '旅游配套' }: { packageId: number; packageSlug?: string; packageTitle?: string }) {
  const [options, setOptions] = useState<AdminOption[]>([])
  const [form, setForm] = useState<OptionForm | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [uploadingBrochure, setUploadingBrochure] = useState(false)
  const [uploadingGallery, setUploadingGallery] = useState(false)
  const [batchUploading, setBatchUploading] = useState(false)
  const isBatam = packageSlug === 'batam-3d2n'
  const isHainan = packageSlug === 'hainan'
  const hasRichOptionMedia = isBatam || isHainan
  const uploadCountry = isBatam ? 'Indonesia' : isHainan ? 'China' : 'Malaysia'
  const uploadCity = isBatam ? 'Batam' : isHainan ? 'Hainan' : 'Pulau Tioman'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await adminFetch(`/api/admin/travel-package-options?packageId=${packageId}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || '无法读取配套选项。')
      const nextOptions = (payload.options || []) as AdminOption[]
      setOptions(nextOptions)
      setForm((current) => {
        const selected = current ? nextOptions.find((option) => option.id === current.id) : nextOptions[0]
        return selected ? toForm(selected) : null
      })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法读取配套选项。')
    } finally {
      setLoading(false)
    }
  }, [packageId])

  useEffect(() => { void load() }, [load])

  const set = (key: keyof OptionForm, value: unknown) => setForm((current) => current ? { ...current, [key]: value } : current)

  const save = async () => {
    if (!form) return
    setMessage('')
    try {
      const payload = {
        ...form,
        gallery: JSON.parse(form.galleryText || '[]'),
        price_rows: JSON.parse(form.rowsText || '[]'),
        itinerary_days: JSON.parse(form.itineraryText || '[]'),
        included_items: fromLines(form.includedText),
        excluded_items: fromLines(form.excludedText),
        notes: fromLines(form.notesText),
        suitable_for: fromLines(form.suitableText),
        highlights: fromLines(form.highlightsText),
        internal_notes: fromLines(form.internalNotesText),
      }
      const response = await adminFetch('/api/admin/travel-package-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '无法保存配套选项。')
      setMessage('已保存 option。供应商字段只保留在后台。')
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法保存配套选项。')
    }
  }

  const copyWhatsApp = async (option: AdminOption) => {
    await navigator.clipboard.writeText(buildWhatsAppUrl({
      pageType: 'package',
      packageName: packageTitle,
      source: option.source_code || undefined,
      message: option.whatsapp_message || undefined,
    }))
    setMessage('已复制这个方案的 WhatsApp 测试链接。')
  }


  const uploadBrochure = async (files: FileList | null) => {
    if (!form || !files?.length) return
    const file = files[0]
    setUploadingBrochure(true)
    setMessage('')
    try {
      const data = new FormData()
      data.append('file', file)
      data.append('category', 'packages')
      data.append('country', uploadCountry)
      data.append('city', uploadCity)
      data.append('locationSlug', `${packageSlug}/${form.slug}`)
      data.append('field', 'brochure')
      const response = await adminFetch('/api/upload/r2', { method: 'POST', body: data })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || '配套详情图上传失败。')
      const url = String(payload.url || payload.urls?.[0] || '')
      if (!url) throw new Error('上传成功但没有返回图片 URL。')
      set('brochure_image', {
        url,
        alt: `${form.name_zh} 配套详情图`,
        caption: 'JnQ Journey 重新整理配套详情图',
        sort_order: 0,
      })
      setMessage('配套详情图已上传。请再按「保存 option」写入资料。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '配套详情图上传失败。')
    } finally {
      setUploadingBrochure(false)
    }
  }


  const parseGalleryText = () => {
    if (!form) return []
    const parsed = JSON.parse(form.galleryText || '[]')
    if (!Array.isArray(parsed)) throw new Error('方案照片资料格式不正确。')
    return parsed
      .map((entry, index) => typeof entry === 'string'
        ? { url: entry, alt: '', caption: '', sort_order: index }
        : {
            url: String(entry?.url || ''),
            alt: String(entry?.alt || ''),
            caption: String(entry?.caption || ''),
            sort_order: Number(entry?.sort_order ?? index),
          })
      .filter((entry) => entry.url)
  }

  const setGalleryItems = (items: Array<{ url: string; alt?: string; caption?: string; sort_order?: number }>) => {
    const normalized = items.map((entry, index) => ({ ...entry, sort_order: index }))
    set('galleryText', JSON.stringify(normalized, null, 2))
  }

  const uploadOptionGallery = async (files: FileList | null) => {
    if (!form || !files?.length) return
    setUploadingGallery(true)
    setMessage('')
    try {
      const data = new FormData()
      Array.from(files).forEach((file) => data.append('files', file))
      data.append('category', 'packages')
      data.append('country', uploadCountry)
      data.append('city', uploadCity)
      data.append('locationSlug', `${packageSlug}/${form.slug}`)
      data.append('field', 'gallery')
      const response = await adminFetch('/api/upload/r2', { method: 'POST', body: data })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || '方案照片上传失败。')
      const urls = Array.isArray(payload.urls) ? payload.urls : payload.url ? [payload.url] : []
      if (!urls.length) throw new Error('上传成功但没有返回图片 URL。')

      const current = parseGalleryText()
      const start = current.length
      setGalleryItems([
        ...current,
        ...urls.map((url: string, index: number) => ({
          url,
          alt: `${form.name_zh} 照片 ${start + index + 1}`,
          caption: '',
          sort_order: start + index,
        })),
      ])
      if (isHainan && !form.cover_image && urls[0]) set('cover_image', urls[0])
      setMessage(`已上传 ${urls.length} 张方案照片。第一张会作为公开卡片主图；请再按「保存 option」。`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '方案照片上传失败。')
    } finally {
      setUploadingGallery(false)
    }
  }

  const moveGalleryItemToFront = (index: number) => {
    try {
      const current = parseGalleryText()
      if (index <= 0 || index >= current.length) return
      const next = [...current]
      const [selected] = next.splice(index, 1)
      next.unshift(selected)
      setGalleryItems(next)
      setMessage('已设为卡片主图。请按「保存 option」完成保存。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法调整方案照片。')
    }
  }

  const removeGalleryItem = (index: number) => {
    try {
      const current = parseGalleryText()
      setGalleryItems(current.filter((_, itemIndex) => itemIndex !== index))
      setMessage('已从方案照片中移除。请按「保存 option」完成保存。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法移除方案照片。')
    }
  }

  const batchUploadBatamBrochures = async (files: FileList | null) => {
    if (!isBatam || !files?.length) return
    setBatchUploading(true)
    setMessage('')
    try {
      const selectedFiles = Array.from(files)
      const mapped = selectedFiles.map((file) => ({ file, slug: matchBatamBrochureSlug(file.name) }))
      const unknown = mapped.filter((entry) => !entry.slug)
      if (unknown.length) throw new Error(`无法自动识别：${unknown.map((entry) => entry.file.name).join('、')}`)

      const duplicateSlugs = mapped.map((entry) => entry.slug).filter((slug, index, all) => all.indexOf(slug) !== index)
      if (duplicateSlugs.length) throw new Error('检测到同一配套选择了多张图片，请每个配套只保留一张。')

      let savedCount = 0
      for (const { file, slug } of mapped) {
        const option = options.find((entry) => entry.slug === slug)
        if (!option) throw new Error(`找不到对应配套：${slug}`)

        const data = new FormData()
        data.append('file', file)
        data.append('category', 'packages')
        data.append('country', 'Indonesia')
        data.append('city', 'Batam')
        data.append('locationSlug', `${packageSlug}/${slug}`)
        data.append('field', 'brochure')
        const uploadResponse = await adminFetch('/api/upload/r2', { method: 'POST', body: data })
        const uploadPayload = await uploadResponse.json()
        if (!uploadResponse.ok) throw new Error(uploadPayload.error || `${file.name} 上传失败。`)
        const url = String(uploadPayload.url || uploadPayload.urls?.[0] || '')
        if (!url) throw new Error(`${file.name} 上传成功但没有返回图片 URL。`)

        const saveResponse = await adminFetch('/api/admin/travel-package-options', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...option,
            brochure_image: {
              url,
              alt: `${option.name_zh} 配套详情图`,
              caption: 'JnQ Journey 重新整理配套详情图',
              sort_order: 0,
            },
            gallery: option.gallery || [],
            internal_notes: option.internal_notes || [],
          }),
        })
        const savePayload = await saveResponse.json()
        if (!saveResponse.ok) throw new Error(savePayload.error || `${option.name_zh} 保存失败。`)
        savedCount += 1
      }

      setMessage(`已自动匹配并保存 ${savedCount} 张 JnQ 配套详情图。`)
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '批量导入配套详情图失败。')
    } finally {
      setBatchUploading(false)
    }
  }

  if (loading) return <div className="mt-8 flex items-center gap-2 text-sm text-white/55"><Loader2 className="h-4 w-4 animate-spin" />读取配套选项</div>
  if (!form) return <div className="mt-8 border border-dashed border-white/15 p-5 text-sm text-white/55">尚未建立配套选项。</div>

  return (
    <section className="mt-10 border-t border-white/10 pt-8">
      <div>
        <p className="text-xs uppercase text-emerald-200/70">Package options</p>
        <h3 className="mt-2 text-xl font-semibold">{isBatam ? 'Batam 多方案管理' : isHainan ? '海南 4天3夜 / 5天4夜方案管理' : 'Resort 与房价选项'}</h3>
        <p className="mt-2 text-sm text-white/50">{isBatam ? '公开页面只显示 JnQ 方案名称。Supplier Ref 与供应商原方案名只在后台保存，不会传到公开页面。重新制作的 JnQ 配套详情图可以单独上传，并会显示在该方案自己的详情页。' : isHainan ? '海南现在是一个主配套，4天3夜与5天4夜都在这里管理。价格、酒店、行程、亮点、图片与 SEO 各自独立，不会再出现在主配套列表。' : 'Paya、Aman 与 The Barat 是同一主配套下的选项，不会出现在主配套列表。'}</p>
        {isBatam ? (
          <div className="mt-4">
            <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-emerald-200/20 bg-emerald-200/[0.08] px-4 text-sm font-medium text-emerald-50">
              <ImagePlus className="h-4 w-4" />
              {batchUploading ? '批量上传中…' : '批量导入 JnQ 配套图'}
              <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" disabled={batchUploading} onChange={(event) => void batchUploadBatamBrochures(event.target.files)} />
            </label>
            <p className="mt-2 text-xs leading-5 text-white/35">可一次选择「非常优惠 / 新品新版本 / Economy / Goa Cave / 龙虾餐 / 海盗船」6 张图，系统会按文件名自动对应到各自配套并保存。</p>
          </div>
        ) : null}
      </div>

      <div className="mt-5 grid gap-2 md:grid-cols-3">{options.map((option) => (
        <button type="button" key={option.id} onClick={() => setForm(toForm(option))} className={`border p-4 text-left ${form.id === option.id ? 'border-amber-200/60 bg-amber-200/10' : 'border-white/10 bg-black/15'}`}>
          <p className="font-medium">{option.name_zh}</p>
          <p className="mt-1 text-sm text-amber-100">{option.price_display}</p>
          <p className="mt-2 text-xs text-white/45">{option.status} · {option.price_unit}{option.supplier_ref ? ` · 内部：${option.supplier_ref}` : ''}</p>
        </button>
      ))}</div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {([
          ['name_zh', '公开方案名称'],
          ['name_en', '英文方案名称'],
          ['slug', 'Option slug'],
          ['duration', '行程天数'],
          ['accommodation_name', '住宿名称'],
          ['accommodation_type', '住宿类型'],
          ['village_name', isBatam ? '额外地区标签' : 'Kampung'],
          ['price_from', '价格起点'],
          ['price_display', '公开价格'],
          ['price_note', '价格说明'],
          ['cover_image', '方案封面 URL'],
          ['seo_title', 'SEO 标题'],
          ['seo_description', 'SEO Description'],
          ['canonical_url', 'Canonical URL'],
          ['validity_label', '有效期 / 价格说明'],
          ['source_code', '公开追踪来源码'],
        ] as const).map(([key, label]) => <label key={key}><span className="mb-1 block text-xs text-white/55">{label}</span><input value={String(form[key] ?? '')} onChange={(event) => set(key, key === 'price_from' ? Number(event.target.value) : event.target.value)} className="h-10 w-full border border-white/10 bg-black/25 px-3 text-sm" /></label>)}
        <label><span className="mb-1 block text-xs text-white/55">价格单位</span><select value={form.price_unit} onChange={(event) => set('price_unit', event.target.value as OptionForm['price_unit'])} className="h-10 w-full border border-white/10 bg-[#111827] px-3 text-sm"><option value="person">每人</option><option value="room">每房</option><option value="package">每配套</option><option value="group">每团</option></select></label>
        <label><span className="mb-1 block text-xs text-white/55">状态</span><select value={form.status} onChange={(event) => set('status', event.target.value as OptionForm['status'])} className="h-10 w-full border border-white/10 bg-[#111827] px-3 text-sm"><option value="active">启用</option><option value="inactive">停用</option><option value="archived">归档</option></select></label>
      </div>

      <label className="mt-4 block"><span className="mb-1 block text-xs text-white/55">简介</span><textarea value={form.short_description || ''} onChange={(event) => set('short_description', event.target.value)} rows={3} className="w-full border border-white/10 bg-black/25 p-3 text-sm" /></label>
      {isHainan ? <label className="mt-4 block"><span className="mb-1 block text-xs text-white/55">完整说明</span><textarea value={form.full_description || ''} onChange={(event) => set('full_description', event.target.value)} rows={7} className="w-full border border-white/10 bg-black/25 p-3 text-sm" /></label> : null}
      {hasRichOptionMedia ? (
        <section className="mt-5 rounded-xl border border-emerald-200/20 bg-emerald-200/[0.04] p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100">JnQ 配套详情图</p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">这里放你重新制作过的单一配套图。它会出现在该方案独立详情页；如果这个方案没有另外上传「方案照片」，这张图也会自动作为外面方案卡片的封面。不会被当成 JnQ 实拍，也不会显示供应商资料。</p>
            </div>
            <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-black">
              <ImagePlus className="h-4 w-4" />
              {uploadingBrochure ? '上传中…' : form.brochure_image?.url ? '更换详情图' : '上传详情图'}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={uploadingBrochure} onChange={(event) => void uploadBrochure(event.target.files)} />
            </label>
          </div>
          {form.brochure_image?.url ? (
            <div className="mt-5 grid gap-4 md:grid-cols-[180px_1fr]">
              <a href={form.brochure_image.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-white/10 bg-black/25">
                <img src={form.brochure_image.url} alt={form.brochure_image.alt || `${form.name_zh} 配套详情图`} className="h-auto w-full" />
              </a>
              <div className="text-sm text-white/55">
                <p className="font-medium text-white/80">公开详情页会优先显示这张图</p>
                <p className="mt-2 leading-6">建议上传你重新排版后的 JnQ 版本，不要放供应商原海报。顾客点击图片后可以放大查看完整内容。</p>
                <button type="button" onClick={() => set('brochure_image', null)} className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-lg border border-rose-300/20 px-3 text-xs text-rose-200"><Trash2 className="h-3.5 w-3.5" />移除详情图</button>
              </div>
            </div>
          ) : <p className="mt-4 text-xs text-white/35">目前这个方案还没有独立详情图。</p>}
        </section>
      ) : null}

      {hasRichOptionMedia ? (
        <section className="mt-5 rounded-xl border border-sky-200/20 bg-sky-200/[0.035] p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-100">方案照片</p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">这些是真正属于这个方案的公开照片。第一张会作为方案卡片主图，其余照片会显示在方案详情页。海南方案也可以在上方「方案封面 URL」单独指定封面。</p>
            </div>
            <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-sky-200/20 bg-sky-200/[0.08] px-4 text-sm font-medium text-sky-50">
              <ImagePlus className="h-4 w-4" />
              {uploadingGallery ? '上传中…' : '添加方案照片'}
              <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" disabled={uploadingGallery} onChange={(event) => void uploadOptionGallery(event.target.files)} />
            </label>
          </div>

          {(() => {
            let gallery: Array<{ url: string; alt?: string; caption?: string; sort_order?: number }> = []
            try { gallery = parseGalleryText() } catch {}
            return gallery.length ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {gallery.map((image, index) => (
                  <div key={`${image.url}-${index}`} className="overflow-hidden rounded-lg border border-white/10 bg-black/20">
                    <div className="relative aspect-[16/10] bg-black/30">
                      <img src={image.url} alt={image.alt || `${form.name_zh} 照片 ${index + 1}`} className="h-full w-full object-cover" />
                      {index === 0 ? <span className="absolute left-2 top-2 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold text-[#171109]">卡片主图</span> : null}
                    </div>
                    <div className="flex flex-wrap gap-2 p-3">
                      {index > 0 ? <button type="button" onClick={() => moveGalleryItemToFront(index)} className="min-h-8 rounded-lg border border-white/10 px-2.5 text-xs text-white/70">设为主图</button> : null}
                      <button type="button" onClick={() => removeGalleryItem(index)} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-rose-300/20 px-2.5 text-xs text-rose-200"><Trash2 className="h-3.5 w-3.5" />移除</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="mt-4 text-xs text-white/35">这个方案还没有公开照片。上传后第一张会直接用于方案卡片。</p>
          })()}
        </section>
      ) : null}

      {([
        ['highlightsText', '公开亮点，每行一项'],
        ['rowsText', '价格行 JSON'],
        ['itineraryText', '行程 JSON'],
        ['includedText', '包含项目，每行一项'],
        ['excludedText', '不包括项目，每行一项'],
        ['notesText', '公开注意事项，每行一项'],
        ['suitableText', '适合对象，每行一项'],
        ['galleryText', isBatam ? '方案照片 JSON（通常无需手改，上方可直接上传）' : '海报与图库 JSON'],
        ['whatsapp_message', 'WhatsApp 预填文字'],
      ] as const).map(([key, label]) => <label key={key} className="mt-4 block"><span className="mb-1 block text-xs text-white/55">{label}</span><textarea value={String(form[key] || '')} onChange={(event) => set(key, event.target.value)} rows={key === 'whatsapp_message' || key === 'itineraryText' ? 7 : 4} className="w-full border border-white/10 bg-black/25 p-3 font-mono text-xs" /></label>)}

      <div className="mt-6 border border-amber-200/20 bg-amber-200/[0.05] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-100">Internal only · 不公开</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label><span className="mb-1 block text-xs text-white/55">Supplier Ref</span><input value={form.supplier_ref || ''} onChange={(event) => set('supplier_ref', event.target.value)} className="h-10 w-full border border-white/10 bg-black/25 px-3 text-sm" /></label>
          <label><span className="mb-1 block text-xs text-white/55">供应商原方案名</span><input value={form.supplier_package_name || ''} onChange={(event) => set('supplier_package_name', event.target.value)} className="h-10 w-full border border-white/10 bg-black/25 px-3 text-sm" /></label>
        </div>
        <label className="mt-4 block"><span className="mb-1 block text-xs text-white/55">内部备注，每行一项</span><textarea value={form.internalNotesText} onChange={(event) => set('internalNotesText', event.target.value)} rows={4} className="w-full border border-white/10 bg-black/25 p-3 text-xs" /></label>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={() => void save()} className="inline-flex min-h-10 items-center gap-2 bg-white px-4 text-sm font-medium text-black"><Save className="h-4 w-4" />保存 option</button>
        <button type="button" onClick={() => void copyWhatsApp(form)} className="inline-flex min-h-10 items-center gap-2 border border-white/15 px-4 text-sm"><Copy className="h-4 w-4" />复制 WhatsApp</button>
        {(form.brochure_image?.url || form.gallery?.[0]?.url) ? <a href={form.brochure_image?.url || form.gallery?.[0]?.url} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 border border-white/15 px-4 text-sm"><Eye className="h-4 w-4" />查看公开图片</a> : null}
      </div>
      {message ? <p className="mt-4 text-sm text-amber-100">{message}</p> : null}
    </section>
  )
}
