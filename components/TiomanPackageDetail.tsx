'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronRight, ImageOff, Maximize2, ShipWheel, X } from 'lucide-react'

import FallbackImage from '@/components/FallbackImage'
import WhatsAppButton from '@/components/WhatsAppButton'
import { getDeviceType, trackEvent } from '@/lib/analytics'
import type { TravelPackage, TravelPackageImage, TravelPackageOption } from '@/lib/server/travel-packages'

const unitLabels = { person: '每人', room: '每房', package: '每配套', group: '每团' } as const

function brochureOf(option: TravelPackageOption) {
  return option.brochure_image || option.gallery?.[0] || null
}

export default function TiomanPackageDetail({ item, options, preview = false }: { item: TravelPackage; options: TravelPackageOption[]; preview?: boolean }) {
  const activeOptions = useMemo(() => options.filter((option) => preview || option.status === 'active').sort((left, right) => (left.sort_order || 0) - (right.sort_order || 0)), [options, preview])
  const [unitFilter, setUnitFilter] = useState<'all' | 'person' | 'room'>('all')
  const visibleOptions = activeOptions.filter((option) => unitFilter === 'all' || option.price_unit === unitFilter)
  const [selectedSlug, setSelectedSlug] = useState('')
  const [activePoster, setActivePoster] = useState<TravelPackageImage | null>(null)
  const selected = visibleOptions.find((option) => option.slug === selectedSlug) || visibleOptions[0] || activeOptions[0]

  useEffect(() => {
    if (!selected || preview) return
    trackEvent('package_option_view', {
      page_path: window.location.pathname,
      page_type: 'package',
      package_id: item.id,
      package_name: item.title_zh,
      option_id: selected.id,
      option_name: selected.name_zh,
      accommodation_name: selected.accommodation_name,
      village_name: selected.village_name,
      price_from: selected.price_from,
      price_unit: selected.price_unit,
      source_code: selected.source_code,
      device_type: getDeviceType(),
    })
  }, [item.id, item.title_zh, preview, selected])

  useEffect(() => {
    if (!activePoster) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setActivePoster(null) }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [activePoster])

  const selectOption = (option: TravelPackageOption) => {
    setSelectedSlug(option.slug)
    if (!preview) trackEvent('package_option_select', {
      page_path: window.location.pathname,
      page_type: 'package',
      package_id: item.id,
      package_name: item.title_zh,
      option_id: option.id,
      option_name: option.name_zh,
      accommodation_name: option.accommodation_name,
      village_name: option.village_name,
      price_from: option.price_from,
      price_unit: option.price_unit,
      source_code: option.source_code,
      device_type: getDeviceType(),
    })
    document.getElementById(option.slug)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const compareCta = <WhatsAppButton pageType="package" packageName={item.title_zh} packageId={item.id} regionName={item.destination || undefined} source={item.source_code || undefined} message={item.whatsapp_message || undefined} label="不确定选哪一家？WhatsApp 帮我比较" position="tioman_compare" track={!preview} />
  const optionCta = (option: TravelPackageOption, position: string) => <WhatsAppButton pageType="package" packageName={item.title_zh} packageId={item.id} optionId={option.id} optionName={option.name_zh} accommodationName={option.accommodation_name} villageName={option.village_name || undefined} resortName={option.accommodation_name} regionName={item.destination || undefined} priceFrom={option.price_from ? `RM${option.price_from.toLocaleString('en-MY')}` : undefined} priceUnit={option.price_unit} source={option.source_code || undefined} message={option.whatsapp_message || undefined} label="WhatsApp 查询" position={position} track={!preview} />

  return <main className="min-h-screen bg-[#050816] pb-20 text-white md:pb-0">
    <section className="relative flex min-h-[72svh] items-end overflow-hidden">
      {item.cover_image ? <FallbackImage src={item.cover_image} alt={item.title_zh} fill priority className="object-cover" /> : <div className="absolute inset-0 bg-[#08101d]" />}
      <div className="absolute inset-0 bg-gradient-to-t from-[#050816] via-[#050816]/65 to-black/20" />
      <div className="relative mx-auto w-full max-w-6xl px-5 pb-14 pt-36 md:px-8 md:pb-20">
        <nav className="mb-7 flex items-center gap-2 text-xs text-white/55"><Link href="/">首页</Link><ChevronRight className="h-3 w-3" /><Link href="/packages">旅游配套</Link></nav>
        <p className="text-xs uppercase text-amber-200/75">{item.destination} · {item.duration}</p>
        <h1 className="mt-3 max-w-4xl text-4xl font-semibold leading-tight md:text-7xl">{item.title_zh}</h1>
        <p className="mt-5 max-w-3xl text-base leading-8 text-white/75">{item.short_description}</p>
        <div className="mt-7 flex flex-wrap items-center gap-3"><span className="text-2xl font-semibold text-amber-100">每人 RM509 起</span><span className="text-sm text-white/55">最低价来自 Paya Beach Resort 四人房成人价</span></div>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-white/60">价格会因 Resort、人数、房型、日期、船票和附加费用而不同，请选择住宿方案后查看详情。</p>
        <div className="mt-8">{compareCta}</div>
      </div>
    </section>

    <div className="mx-auto max-w-6xl space-y-16 px-5 py-14 md:px-8 md:py-20">
      <section><p className="text-xs uppercase text-emerald-200/70">Stay options</p><h2 className="mt-2 text-3xl font-semibold">选择 Resort 与价格单位</h2><div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="价格单位筛选">{([['all', '全部'], ['person', '每人配套'], ['room', '每房配套']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setUnitFilter(value)} className={`min-h-10 rounded-lg border px-4 text-sm ${unitFilter === value ? 'border-amber-200/60 bg-amber-200/10 text-amber-50' : 'border-white/15 text-white/65'}`}>{label}</button>)}</div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">{visibleOptions.map((option) => <article key={option.id} className={`border p-5 ${selected?.id === option.id ? 'border-amber-200/55 bg-amber-200/[0.08]' : 'border-white/10 bg-white/[0.03]'}`}><p className="text-xs text-emerald-200/75">{option.accommodation_type || 'Resort'}</p><h3 className="mt-2 text-xl font-semibold">{option.name_zh}</h3><p className="mt-3 text-2xl font-semibold text-amber-100">{option.price_display}</p><p className="mt-2 text-sm text-white/55">{option.price_unit === 'person' ? '船票包含或另计视方案而定' : '船票另计'} · {option.validity_label}</p><p className="mt-4 line-clamp-3 text-sm leading-6 text-white/65">{option.short_description}</p><div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={() => selectOption(option)} className="min-h-10 rounded-lg bg-white px-3 text-sm font-medium text-black">查看详情</button>{optionCta(option, 'option_card')}</div></article>)}</div>
      </section>

      {selected ? <section id={selected.slug} className="scroll-mt-8 border-y border-white/10 py-10 md:py-14"><div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,.9fr)]"><div><p className="text-xs uppercase text-emerald-200/70">Selected option</p><h2 className="mt-2 text-3xl font-semibold">{selected.name_zh}</h2><p className="mt-4 text-3xl font-semibold text-amber-100">{selected.price_display}</p><p className="mt-2 text-sm text-white/55">价格单位：{unitLabels[selected.price_unit]} · {selected.validity_label}</p><p className="mt-6 leading-8 text-white/70">{selected.short_description}</p>
        {selected.price_rows?.length ? <div className="mt-7 border border-white/10"><div className="grid grid-cols-[1fr_auto] gap-4 border-b border-white/10 bg-white/[0.04] px-4 py-3 text-xs text-white/50"><span>房型或人数</span><span>价格</span></div>{selected.price_rows.map((row) => <div key={`${row.label}-${row.price}`} className="grid grid-cols-[1fr_auto] gap-4 border-b border-white/10 px-4 py-3 text-sm last:border-b-0"><span className="text-white/70">{row.label}</span><strong className="font-medium text-amber-100">{row.price}</strong></div>)}</div> : null}
        <div className="mt-7 grid gap-7 md:grid-cols-2"><div><h3 className="text-lg font-semibold">方案包含</h3><ul className="mt-4 space-y-2.5 text-sm leading-6 text-white/70">{selected.included_items?.map((entry) => <li key={entry} className="flex gap-2"><Check className="mt-1 h-4 w-4 shrink-0 text-emerald-300" />{entry}</li>)}</ul></div><div><h3 className="text-lg font-semibold">不包括与注意事项</h3><ul className="mt-4 space-y-2.5 text-sm leading-6 text-white/70">{[...(selected.excluded_items || []), ...(selected.notes || [])].map((entry) => <li key={entry} className="flex gap-2"><X className="mt-1 h-4 w-4 shrink-0 text-rose-300" />{entry}</li>)}</ul></div></div>
        <div className="mt-8">{optionCta(selected, 'option_detail')}</div></div>
        <aside>{brochureOf(selected) ? <button type="button" onClick={() => { const brochure = brochureOf(selected); if (brochure) setActivePoster(brochure) }} className="group block w-full overflow-hidden border border-white/10 bg-black/25 text-left"><div className="relative aspect-[1122/1402] bg-black/35"><FallbackImage src={brochureOf(selected)!.url} alt={brochureOf(selected)!.alt || `${selected.name_zh} 完整价格海报`} fill className="object-contain p-2" /></div><span className="flex min-h-12 items-center justify-center gap-2 px-4 text-sm text-white/75"><Maximize2 className="h-4 w-4" />查看完整价格海报</span></button> : <div className="border border-dashed border-white/20 p-6 text-sm text-white/45">尚未上传此 Resort 海报。</div>}<div className="mt-5 border border-white/10 bg-white/[0.03] p-5 text-sm leading-7 text-white/65"><ShipWheel className="mb-3 h-5 w-5 text-amber-200" />价格、房况、船班、税费与活动安排以旅行社或 Resort 最终确认为准。</div></aside></div></section> : null}

      <section className="border border-white/10 bg-white/[0.03] p-6 md:p-8"><h2 className="text-2xl font-semibold">刁曼岛配套说明</h2><p className="mt-4 max-w-4xl leading-8 text-white/65">{item.full_description}</p><div className="mt-7">{compareCta}</div></section>
    </div>
    {activePoster ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 md:p-8" role="dialog" aria-modal="true" onMouseDown={() => setActivePoster(null)}><div className="relative flex h-full w-full max-w-5xl flex-col" onMouseDown={(event) => event.stopPropagation()}><div className="relative min-h-0 flex-1"><FallbackImage src={activePoster.url} alt={activePoster.alt || '完整价格海报'} fill className="object-contain" priority /></div><button type="button" onClick={() => setActivePoster(null)} className="absolute right-0 top-0 inline-flex h-10 w-10 items-center justify-center border border-white/20 bg-black/60" aria-label="关闭完整价格海报"><X className="h-5 w-5" /></button></div></div> : null}
  </main>
}
