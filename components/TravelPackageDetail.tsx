'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Check, ChevronRight, ImageOff, Maximize2, ShieldCheck, X } from 'lucide-react'

import FallbackImage from '@/components/FallbackImage'
import TiomanPackageComparison from '@/components/TiomanPackageComparison'
import WhatsAppButton from '@/components/WhatsAppButton'
import { getDeviceType, trackEvent } from '@/lib/analytics'
import { getTiomanComparison } from '@/lib/tioman-packages'
import type { TravelPackage } from '@/lib/server/travel-packages'

interface TravelPackageDetailProps {
  item: TravelPackage
  preview?: boolean
  comparisonPackages?: TravelPackage[]
  publishCheckMessage?: string
  onPublishCheck?: () => void
}

export default function TravelPackageDetail({ item, preview = false, comparisonPackages = [], publishCheckMessage, onPublishCheck }: TravelPackageDetailProps) {
  const [activeGalleryIndex, setActiveGalleryIndex] = useState<number | null>(null)
  const gallery = (item.gallery || [])
    .map((image, index) => typeof image === 'string'
      ? { url: image, alt: '', caption: '', sort_order: index }
      : { ...image, sort_order: image.sort_order ?? index })
    .filter((image) => image.url)
    .sort((left, right) => left.sort_order - right.sort_order)
  const coverAlt = gallery.find((image) => image.url === item.cover_image)?.alt || item.title_zh
  const activeGalleryImage = activeGalleryIndex === null ? null : gallery[activeGalleryIndex]
  const tiomanComparison = getTiomanComparison(item)

  useEffect(() => {
    if (!activeGalleryImage) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveGalleryIndex(null)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [activeGalleryImage])

  useEffect(() => {
    if (!activeGalleryImage || preview) return
    trackEvent('package_brochure_view', {
      page_path: window.location.pathname,
      page_type: 'package',
      package_id: item.id,
      package_name: item.title_zh,
      resort_name: tiomanComparison?.resortName,
      region_name: item.destination,
      price_from: tiomanComparison?.priceFrom,
      price_unit: tiomanComparison?.priceUnit,
      device_type: getDeviceType(),
      source_code: item.source_code,
    })
  }, [activeGalleryImage, item.destination, item.id, item.source_code, item.title_zh, preview, tiomanComparison?.priceFrom, tiomanComparison?.priceUnit, tiomanComparison?.resortName])

  const cta = (label: string, position: string) => (
    <WhatsAppButton
      pageType="package"
      packageName={item.title_zh}
      packageId={item.id}
      resortName={tiomanComparison?.resortName}
      regionName={item.destination || undefined}
      priceFrom={tiomanComparison?.priceFrom}
      priceUnit={tiomanComparison?.priceUnit}
      source={item.source_code || undefined}
      message={item.whatsapp_message || undefined}
      label={label}
      position={position}
      track={!preview}
    />
  )

  return (
    <main className="min-h-screen bg-[#050816] pb-20 text-white md:pb-0">
      {preview ? (
        <div className="border-b border-amber-200/20 bg-amber-200/10">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between md:px-8">
            <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-amber-200" /><div><p className="text-sm font-semibold text-amber-50">草稿预览｜此配套尚未公开</p><p className="text-xs text-white/50">只有已登录管理员可以查看此页面。</p></div></div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/admin/packages?edit=${item.id}`} className="inline-flex min-h-10 items-center rounded-lg border border-white/15 px-3 text-sm text-white transition hover:bg-white/10">返回编辑</Link>
              {cta('打开 WhatsApp 测试', 'admin_preview')}
              <button type="button" onClick={onPublishCheck} className="inline-flex min-h-10 items-center rounded-lg border border-amber-200/25 bg-amber-200/10 px-3 text-sm text-amber-50 transition hover:bg-amber-200/15">执行发布检查</button>
            </div>
          </div>
          {publishCheckMessage ? <p className="mx-auto max-w-6xl px-5 pb-4 text-sm text-amber-50/80 md:px-8">{publishCheckMessage}</p> : null}
        </div>
      ) : null}

      <section className="relative flex min-h-[78svh] items-end overflow-hidden">
        {item.cover_image ? <FallbackImage src={item.cover_image} alt={coverAlt} fill priority className="object-cover" /> : <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[linear-gradient(135deg,#122238,#08101d_55%,#050816)] text-white/25"><ImageOff className="h-12 w-12" aria-hidden="true" />{preview ? <span className="text-xs">尚未上传封面图</span> : null}</div>}
        <div className="absolute inset-0 bg-gradient-to-t from-[#050816] via-[#050816]/55 to-black/15" />
        <div className="relative mx-auto w-full max-w-6xl px-5 pb-14 pt-36 md:px-8 md:pb-20">
          <nav className="mb-7 flex items-center gap-2 text-xs text-white/55"><Link href="/">首页</Link><ChevronRight className="h-3 w-3" /><Link href="/packages">旅游配套</Link></nav>
          <p className="text-xs uppercase text-amber-200/75">{item.destination} · {item.duration}</p>
          <h1 className="mt-3 max-w-4xl text-4xl font-semibold leading-tight md:text-7xl">{item.title_zh}</h1>
          {item.title_en ? <p className="mt-3 text-lg text-white/55">{item.title_en}</p> : null}
          <p className="mt-6 max-w-3xl text-base leading-8 text-white/72">{item.short_description}</p>
          <div className="mt-8 flex flex-wrap gap-3">{cta('WhatsApp 查询最新价格', 'hero')}<Link href={item.related_guide_slugs?.[0] ? `/guide/${item.related_guide_slugs[0]}` : '/guide'} className="inline-flex min-h-11 items-center rounded-full border border-white/20 bg-black/20 px-5 py-2.5 text-sm">查看相关旅游攻略</Link></div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-16 px-5 py-14 md:px-8 md:py-20">
        {item.full_description ? <section><h2 className="text-3xl font-semibold">配套介绍</h2><div className="mt-5 max-w-4xl whitespace-pre-line text-base leading-8 text-white/65">{item.full_description}</div></section> : null}
        {gallery.length ? <section><h2 className="text-3xl font-semibold">旅程照片</h2><div className="mt-6 grid gap-4 md:grid-cols-2">{gallery.map((image, index) => <button type="button" key={`${image.url}-${index}`} onClick={() => setActiveGalleryIndex(index)} className="group relative overflow-hidden rounded-lg border border-white/10 bg-black/25 text-left transition hover:border-white/25" aria-label={`查看 ${item.title_zh} 实拍照片 ${index + 1} 完整图片`}><div className="relative aspect-[4/3] bg-black/30"><FallbackImage src={image.url} alt={image.alt || `${item.title_zh} 实拍照片 ${index + 1}`} fill className="object-contain p-1.5" /></div><span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-md bg-black/65 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"><Maximize2 className="h-3.5 w-3.5" />查看全图</span>{image.caption ? <span className="block px-4 py-3 text-sm text-white/60">{image.caption}</span> : null}</button>)}</div></section> : preview ? <section className="border-y border-white/10 py-7"><p className="text-sm text-white/45">{tiomanComparison ? '尚未上传原始竖版配套海报。上传后才可发布。' : '尚未上传图集。补齐至少 3 张真实照片后才可发布。'}</p></section> : null}
        {comparisonPackages.length ? <TiomanPackageComparison packages={comparisonPackages} preview={preview} /> : null}
        {item.highlights?.length ? <section><h2 className="text-3xl font-semibold">配套亮点</h2><div className="mt-6 grid gap-3 md:grid-cols-2">{item.highlights.map((text) => <div key={text} className="flex gap-3 rounded-lg border border-white/10 bg-white/5 p-4"><Check className="mt-1 h-4 w-4 shrink-0 text-emerald-300" /><span className="leading-7 text-white/72">{text}</span></div>)}</div><div className="mt-7">{cta(`查询${item.destination || '旅游'}配套价格`, 'inline')}</div></section> : null}
        {item.suitable_for?.length ? <section><h2 className="text-3xl font-semibold">适合谁</h2><div className="mt-5 flex flex-wrap gap-2">{item.suitable_for.map((text) => <span key={text} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70">{text}</span>)}</div></section> : null}
        {item.itinerary_days?.length ? <section><h2 className="text-3xl font-semibold">行程摘要</h2><div className="mt-7 space-y-4">{item.itinerary_days.map((day, index) => <article key={`${day.title}-${index}`} className="grid gap-4 border-l border-amber-200/30 pl-5 md:grid-cols-[7rem_1fr]"><p className="text-sm font-semibold text-amber-200">Day {index + 1}</p><div><h3 className="text-xl font-semibold">{day.title}</h3>{day.summary ? <p className="mt-2 leading-7 text-white/65">{day.summary}</p> : null}{day.items?.length ? <ul className="mt-3 space-y-2 text-sm text-white/60">{day.items.map((entry) => <li key={entry}>· {entry}</li>)}</ul> : null}</div></article>)}</div><div className="mt-8">{cta('WhatsApp 确认日期', 'after_itinerary')}</div></section> : null}
        {(item.included_items?.length || item.excluded_items?.length) ? <section className="grid gap-8 md:grid-cols-2"><div><h2 className="text-2xl font-semibold">配套包含</h2><ul className="mt-5 space-y-3">{item.included_items?.map((text) => <li key={text} className="flex gap-3 text-white/70"><Check className="mt-1 h-4 w-4 shrink-0 text-emerald-300" />{text}</li>)}</ul></div><div><h2 className="text-2xl font-semibold">配套不包含</h2><ul className="mt-5 space-y-3">{item.excluded_items?.map((text) => <li key={text} className="flex gap-3 text-white/70"><X className="mt-1 h-4 w-4 shrink-0 text-rose-300" />{text}</li>)}</ul></div></section> : null}
        <section className="rounded-lg border border-white/10 bg-white/5 p-6 md:p-8"><h2 className="text-2xl font-semibold">价格与确认</h2>{item.price_display ? <p className="mt-4 text-2xl text-amber-100">{item.price_display}</p> : null}<p className="mt-3 max-w-3xl leading-7 text-white/65">{item.price_note || '最新价格会根据出发日期、人数、房型及出发码头调整，请通过 WhatsApp 查询。'}</p><div className="mt-6">{cta('查看是否有位', 'page_bottom')}</div></section>
      </div>
      {activeGalleryImage ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 md:p-8" role="dialog" aria-modal="true" aria-label={`${item.title_zh} 完整照片`} onMouseDown={() => setActiveGalleryIndex(null)}><div className="relative flex h-full w-full max-w-6xl flex-col" onMouseDown={(event) => event.stopPropagation()}><div className="relative min-h-0 flex-1"><FallbackImage src={activeGalleryImage.url} alt={activeGalleryImage.alt || `${item.title_zh} 实拍照片 ${(activeGalleryIndex || 0) + 1}`} fill className="object-contain" priority /></div><div className="flex shrink-0 items-center justify-between gap-4 pt-3"><p className="text-sm text-white/70">{activeGalleryImage.caption || `旅程照片 ${(activeGalleryIndex || 0) + 1} / ${gallery.length}`}</p><button type="button" onClick={() => setActiveGalleryIndex(null)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 bg-black/40 text-white transition hover:bg-white/10" aria-label="关闭完整图片"><X className="h-5 w-5" /></button></div></div></div> : null}
    </main>
  )
}
