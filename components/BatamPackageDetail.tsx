'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronRight, CircleDollarSign, Coffee, Hotel, MapPinned, Ship, Sparkles, UtensilsCrossed, X } from 'lucide-react'

import FallbackImage from '@/components/FallbackImage'
import WhatsAppButton from '@/components/WhatsAppButton'
import { getDeviceType, trackEvent } from '@/lib/analytics'
import type { TravelPackage, TravelPackageOption } from '@/lib/server/travel-packages'

function mealSummary(option: TravelPackageOption) {
  return option.included_items?.find((item) => item.includes('早餐') || item.includes('午餐') || item.includes('晚餐')) || '按方案确认'
}

function massageSummary(option: TravelPackageOption) {
  const included = option.included_items?.filter((item) => item.includes('按摩')) || []
  if (included.length) return included.join(' + ')
  if (option.excluded_items?.some((item) => item.includes('按摩'))) return '自费 / 不含'
  return '按方案确认'
}

function mainExperience(option: TravelPackageOption) {
  return (option.highlights || []).slice(0, 3).join(' · ') || '查看完整行程'
}

function groupSummary(option: TravelPackageOption) {
  const labels = (option.price_rows || [])
    .map((row) => row.label)
    .filter((label) => /\d+.*人|人以上|团体|领队/.test(label))
    .slice(0, 3)
  return labels.length ? labels.join(' / ') : '按人数重新报价'
}

function selfPaySummary(option: TravelPackageOption) {
  const entries = (option.excluded_items || [])
    .filter((item) => !item.includes('个人消费') && !item.includes('旺季') && !item.includes('未明确'))
    .slice(0, 3)
  return entries.length ? entries.join(' · ') : '以方案详情为准'
}

function optionCtaLabel(option: TravelPackageOption) {
  return `查询「${option.name_zh}」`
}

const OPTION_VISUALS: Record<string, {
  kind: 'photo' | 'theme'
  url?: string
  label: string
  badge: string
  photoPlace?: string
  themeText?: string
}> = {
  'value-499': {
    kind: 'photo',
    url: 'https://pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev/locations/2026-05-31/278-1775028801259-5f6746a2-895d-4354-beda-68600e136857-4-1-4--wa-d8b999a8-b7f3-465f-9b02-d5bf7b25faca.webp',
    label: 'JnQ 实拍 · 行程景点',
    badge: '性价比路线',
    photoPlace: 'Blue Fire Beach Club',
  },
  'new-classic-599': {
    kind: 'photo',
    url: 'https://pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev/locations/2026-05-31/278-1775028811065-0e4d7a22-f636-4d71-ba4e-11480cf2eb36-4-1-1--wa-e180ac4a-029d-420a-a0c3-58977d7dd908.webp',
    label: 'JnQ 实拍 · 行程景点',
    badge: '含按摩',
    photoPlace: 'Blue Fire Beach Club',
  },
  'economy-island': {
    kind: 'photo',
    url: 'https://pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev/locations/2026-05-31/276-1775031040868-eb590ade-2680-4104-9b56-ca9e8001f2a3-4-1-10--w-238db8e2-7f34-4848-b949-174ec6addc5a.webp',
    label: 'JnQ 实拍 · 行程景点',
    badge: '海岛慢游',
    photoPlace: 'Barelang Bridge',
  },
  'goa-cave': {
    kind: 'theme',
    label: '方案主题 · 非行程实拍',
    badge: '自然探索',
    themeText: 'Goa Cave · 海洞探秘',
  },
  'ibis-relax-666': {
    kind: 'photo',
    url: 'https://pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev/locations/2026-05-31/276-1775031046155-61512f34-b064-49db-a7db-0efcbdef25d8-4-1-5--wa-23f67a6c-451d-42b0-9bcc-69de46e8315b.webp',
    label: 'JnQ 实拍 · 行程景点',
    badge: '深度按摩',
    photoPlace: 'Barelang Bridge',
  },
  'lobster-lunch': {
    kind: 'photo',
    url: 'https://pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev/locations/2026-05-31/278-1775028812082-70f11ab7-a19a-4fb0-be02-bb2fe1f26f4f-4-1-5--wa-e6855506-db46-42bc-b9fe-1c632d37b675.webp',
    label: 'JnQ 实拍 · 行程景点',
    badge: '龙虾午餐',
    photoPlace: 'Blue Fire Beach Club',
  },
  'pirate-afternoon-tea': {
    kind: 'photo',
    url: 'https://pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev/locations/2026-05-31/277-1775030198550-318fe90d-4e88-4f51-a8db-2e32a053c4fb-4-1-6--wa-6b446cc1-1c63-4bae-b1e6-961f7eb246e6.webp',
    label: 'JnQ 实拍 · 行程景点',
    badge: '20人以上',
    photoPlace: 'Puncak Beliung',
  },
}

function optionVisual(option: TravelPackageOption) {
  return OPTION_VISUALS[option.slug] || {
    kind: 'theme' as const,
    label: '方案主题 · 非行程实拍',
    badge: '精选方案',
    themeText: option.name_zh,
  }
}

export default function BatamPackageDetail({ item, options, preview = false }: { item: TravelPackage; options: TravelPackageOption[]; preview?: boolean }) {
  const activeOptions = useMemo(
    () => options.filter((option) => preview || option.status === 'active').sort((left, right) => (left.sort_order || 0) - (right.sort_order || 0)),
    [options, preview],
  )
  const featured = activeOptions.find((option) => option.featured) || activeOptions[0]
  const [selectedSlug, setSelectedSlug] = useState('')
  const selected = activeOptions.find((option) => option.slug === selectedSlug) || featured
  const lowestPrice = activeOptions.reduce<number | null>((lowest, option) => {
    if (!option.price_from) return lowest
    return lowest === null ? Number(option.price_from) : Math.min(lowest, Number(option.price_from))
  }, null)

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
      price_from: selected.price_from,
      price_unit: selected.price_unit,
      source_code: selected.source_code,
      device_type: getDeviceType(),
    })
  }, [item.id, item.title_zh, preview, selected])

  const selectOption = (option: TravelPackageOption) => {
    setSelectedSlug(option.slug)
    if (!preview) {
      trackEvent('package_option_select', {
        page_path: window.location.pathname,
        page_type: 'package',
        package_id: item.id,
        package_name: item.title_zh,
        option_id: option.id,
        option_name: option.name_zh,
        accommodation_name: option.accommodation_name,
        price_from: option.price_from,
        price_unit: option.price_unit,
        source_code: option.source_code,
        device_type: getDeviceType(),
      })
    }
    requestAnimationFrame(() => document.getElementById('batam-option-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const cta = (option: TravelPackageOption, position: string, label = 'WhatsApp 查询') => (
    <WhatsAppButton
      pageType="package"
      packageName={item.title_zh}
      packageId={item.id}
      optionId={option.id}
      optionName={option.name_zh}
      accommodationName={option.accommodation_name}
      regionName={item.destination || undefined}
      priceFrom={option.price_from ? `RM${Number(option.price_from).toLocaleString('en-MY')}` : undefined}
      priceUnit={option.price_unit}
      source={option.source_code || undefined}
      message={option.whatsapp_message || undefined}
      label={label}
      position={position}
      track={!preview}
    />
  )

  const comparisonRows = [
    ['价格', (option: TravelPackageOption) => option.price_display],
    ['人数', (option: TravelPackageOption) => groupSummary(option)],
    ['住宿', (option: TravelPackageOption) => option.accommodation_name],
    ['餐食', (option: TravelPackageOption) => mealSummary(option)],
    ['按摩', (option: TravelPackageOption) => massageSummary(option)],
    ['特色', (option: TravelPackageOption) => mainExperience(option)],
    ['主要自费', (option: TravelPackageOption) => selfPaySummary(option)],
  ] as const

  const quickPicks = [
    { slug: 'value-499', icon: CircleDollarSign, title: '预算先看', text: 'RM499 起，保留主要经典景点' },
    { slug: 'new-classic-599', icon: Sparkles, title: '想含按摩', text: '30分钟按摩 + Dino’s Gate' },
    { slug: 'economy-island', icon: Ship, title: '想慢一点', text: '双 Beach Club + 下午茶' },
    { slug: 'goa-cave', icon: MapPinned, title: '想玩特别一点', text: 'Goa Cave 海洞乘船体验' },
    { slug: 'ibis-relax-666', icon: Sparkles, title: '想深度放松', text: '90分钟按摩 + 30分钟洗头按摩' },
    { slug: 'lobster-lunch', icon: UtensilsCrossed, title: '比较重视吃', text: '每人半只龙虾午餐' },
    { slug: 'pirate-afternoon-tea', icon: Ship, title: '20人以上团体', text: '海盗船下午茶路线' },
  ].map((entry) => ({ ...entry, option: activeOptions.find((option) => option.slug === entry.slug) })).filter((entry) => entry.option)

  if (!activeOptions.length) return null

  return (
    <main className="min-h-screen bg-[#050816] pb-20 text-white md:pb-0">
      <section className="relative flex min-h-[72svh] items-end overflow-hidden">
        {item.cover_image ? <FallbackImage src={item.cover_image} alt={item.title_zh} fill priority className="object-cover" /> : <div className="absolute inset-0 bg-[#08101d]" />}
        <div className="absolute inset-0 bg-gradient-to-t from-[#050816] via-[#050816]/65 to-black/20" />
        <div className="relative mx-auto w-full max-w-6xl px-5 pb-14 pt-36 md:px-8 md:pb-20">
          <nav className="mb-7 flex items-center gap-2 text-xs text-white/55"><Link href="/">首页</Link><ChevronRight className="h-3 w-3" /><Link href="/packages">旅游配套</Link></nav>
          <p className="text-xs uppercase text-amber-200/75">{item.destination} · {item.duration}</p>
          <h1 className="mt-3 max-w-4xl text-4xl font-semibold leading-tight md:text-7xl">{item.title_zh}</h1>
          {item.title_en ? <p className="mt-3 text-lg text-white/55">{item.title_en}</p> : null}
          <p className="mt-6 max-w-3xl text-base leading-8 text-white/75">{item.short_description}</p>
          <div className="mt-7 flex flex-wrap gap-3 text-sm">
            <span className="rounded-full border border-amber-200/25 bg-amber-200/10 px-4 py-2 text-amber-50">{activeOptions.length} 个方案可选</span>
            {lowestPrice !== null ? <span className="rounded-full border border-white/15 bg-black/20 px-4 py-2">RM{lowestPrice.toLocaleString('en-MY')} 起 / 人</span> : null}
            <span className="rounded-full border border-white/15 bg-black/20 px-4 py-2">来回船票 + 酒店 + 当地交通</span>
          </div>
          {featured ? <div className="mt-8">{cta(featured, 'batam_hero', '先看方案 / WhatsApp 查询')}</div> : null}
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-16 px-5 py-14 md:px-8 md:py-20">
        <section>
          <p className="text-xs uppercase tracking-[0.18em] text-emerald-200/70">Choose by priority</p>
          <h2 className="mt-2 text-3xl font-semibold">先按你最在意的东西选</h2>
          <p className="mt-3 max-w-3xl leading-7 text-white/60">不用先读完全部行程。先从预算、按摩、Beach Club、海洞、餐食或团体玩法切入，再进入完整方案看人数价格与包含项目。</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {quickPicks.map(({ option, icon: Icon, title, text }) => option ? (
              <button key={option.id} type="button" onClick={() => selectOption(option)} className="border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-amber-200/35 hover:bg-white/[0.06]">
                <Icon className="h-5 w-5 text-amber-200" />
                <p className="mt-3 font-semibold">{title}</p>
                <p className="mt-2 text-xs leading-5 text-white/55">{text}</p>
              </button>
            ) : null)}
          </div>
        </section>

        <section>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="text-xs uppercase tracking-[0.18em] text-emerald-200/70">Package options</p><h2 className="mt-2 text-3xl font-semibold">巴淡岛 3天2夜方案</h2><p className="mt-3 max-w-3xl leading-7 text-white/60">每个方案都统一整理成价格、住宿、餐食、体验、自费项目和适合人数，直接比较会比一张张看海报更容易选。</p><p className="mt-3 max-w-4xl text-xs leading-6 text-white/42">图片标注「JnQ 实拍 · 行程景点」时，只代表该方案包含的相关景点，并不表示我们亲自参加过这个具体配套；没有准确对应实拍的方案会使用主题视觉。</p></div>
          </div>
          <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {activeOptions.map((option) => {
              const visual = optionVisual(option)
              const suitable = option.suitable_for?.[0]
              return (
                <article key={option.id} className={`group flex flex-col overflow-hidden rounded-[24px] border transition duration-300 ${selected?.id === option.id ? 'border-amber-200/55 bg-amber-200/[0.065] shadow-[0_18px_55px_rgba(251,191,36,0.08)]' : 'border-white/10 bg-white/[0.03] hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.045]'}`}>
                  <button type="button" onClick={() => selectOption(option)} className="relative block aspect-[16/9] overflow-hidden text-left">
                    {visual.kind === 'photo' && visual.url ? (
                      <>
                        <FallbackImage src={visual.url} alt={`${visual.photoPlace || 'Batam'}｜JnQ Journey 实拍`} fill className="object-cover transition duration-500 group-hover:scale-[1.03]" />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#080d19] via-black/10 to-black/10" />
                        <div className="absolute left-4 top-4 rounded-full border border-white/20 bg-black/55 px-3 py-1.5 text-[11px] font-medium text-white/85 backdrop-blur-sm">{visual.label}</div>
                        {visual.photoPlace ? <div className="absolute bottom-4 right-4 max-w-[58%] rounded-full border border-white/15 bg-black/45 px-3 py-1.5 text-right text-[10px] text-white/70 backdrop-blur-sm">{visual.photoPlace}</div> : null}
                      </>
                    ) : (
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(251,191,36,0.18),transparent_35%),linear-gradient(135deg,#13233a_0%,#0a1322_48%,#07101a_100%)]">
                        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full border border-white/10" />
                        <div className="absolute right-8 top-8 h-24 w-24 rounded-full border border-amber-200/15" />
                        <div className="absolute bottom-5 left-5 right-5">
                          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-amber-100/60">{visual.label}</p>
                          <p className="mt-2 max-w-[85%] text-xl font-semibold leading-snug text-white/92">{visual.themeText || option.name_zh}</p>
                        </div>
                      </div>
                    )}
                    <div className="absolute bottom-4 left-4 rounded-full bg-amber-100 px-3 py-1.5 text-[11px] font-semibold text-[#171109]">{option.featured ? '性价比推荐' : visual.badge}</div>
                  </button>

                  <div className="flex flex-1 flex-col p-5">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-emerald-200/65">{option.accommodation_type || '3天2夜方案'}</p>
                      <h3 className="mt-2 text-xl font-semibold leading-snug">{option.name_zh}</h3>
                      {option.name_en ? <p className="mt-1 text-xs text-white/36">{option.name_en}</p> : null}
                    </div>

                    <div className="mt-4">
                      <p className="text-[11px] text-white/42">参考价格</p>
                      <p className="mt-1 text-2xl font-semibold tracking-tight text-amber-100">{option.price_display}</p>
                      <p className="mt-1 text-[11px] text-white/38">{option.validity_label || '最终价格按日期与人数确认'}</p>
                    </div>

                    <div className="mt-4 flex items-start gap-2 text-sm leading-6 text-white/64">
                      <Hotel className="mt-1 h-4 w-4 shrink-0 text-white/38" />
                      <span>{option.accommodation_name}</span>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {(option.highlights || []).slice(0, 3).map((entry) => <span key={entry} className="rounded-full border border-white/10 bg-black/15 px-2.5 py-1 text-[11px] text-white/58">{entry}</span>)}
                    </div>

                    {suitable ? <div className="mt-4 border-l-2 border-amber-200/45 pl-3"><p className="text-[11px] text-white/38">比较适合</p><p className="mt-1 text-sm font-medium text-white/78">{suitable}</p></div> : null}

                    <p className="mt-4 line-clamp-2 text-sm leading-6 text-white/55">{option.short_description}</p>

                    <div className="mt-auto flex flex-wrap gap-2 pt-5">
                      <button type="button" onClick={() => selectOption(option)} className="min-h-10 rounded-lg bg-white px-4 text-sm font-semibold text-black transition hover:bg-amber-50">查看详情</button>
                      {cta(option, 'batam_option_card')}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <section className="border-y border-white/10 py-10 md:py-14">
          <p className="text-xs uppercase tracking-[0.18em] text-emerald-200/70">Quick comparison</p>
          <h2 className="mt-2 text-3xl font-semibold">一次看清主要差别</h2>
          <p className="mt-3 max-w-3xl leading-7 text-white/60">重点看价格以外的差别：人数门槛、酒店、餐食、按摩和主要自费项目。手机建议先看上面的方案卡，再进入单一方案详情。</p>
          <div className="mt-7 hidden overflow-x-auto border border-white/10 md:block">
            <table className="min-w-[92rem] border-collapse text-left text-sm">
              <thead className="bg-white/5"><tr><th className="sticky left-0 z-10 w-32 bg-[#0c1220] p-4 font-medium text-white/50">比较</th>{activeOptions.map((option) => <th key={option.id} className="min-w-48 p-4"><button type="button" onClick={() => selectOption(option)} className="text-left font-semibold hover:text-amber-100">{option.name_zh}</button></th>)}</tr></thead>
              <tbody>{comparisonRows.map(([label, getValue]) => <tr key={label} className="border-t border-white/10"><th className="sticky left-0 z-10 bg-[#070b16] p-4 font-medium text-white/45">{label}</th>{activeOptions.map((option) => <td key={option.id} className="p-4 align-top leading-6 text-white/68">{getValue(option)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </section>

        {selected ? (
          <section id="batam-option-detail" className="scroll-mt-8 border border-white/10 bg-white/[0.025] p-5 md:p-8">
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div><p className="text-xs uppercase tracking-[0.18em] text-emerald-200/70">Selected package</p><h2 className="mt-2 text-3xl font-semibold">{selected.name_zh}</h2>{selected.name_en ? <p className="mt-2 text-white/40">{selected.name_en}</p> : null}<p className="mt-5 max-w-3xl leading-8 text-white/68">{selected.short_description}</p></div>
              <div className="shrink-0 md:text-right"><p className="text-3xl font-semibold text-amber-100">{selected.price_display}</p><p className="mt-2 text-xs text-white/45">{selected.validity_label}</p></div>
            </div>

            {selected.price_rows?.length ? <div className="mt-7 overflow-hidden border border-white/10"><div className="grid grid-cols-[1fr_auto] gap-4 bg-white/[0.04] px-4 py-3 text-xs text-white/45"><span>人数 / 条件</span><span>价格</span></div>{selected.price_rows.map((row) => <div key={`${row.label}-${row.price}`} className="grid grid-cols-[1fr_auto] gap-4 border-t border-white/10 px-4 py-3 text-sm"><span className="text-white/68">{row.label}</span><strong className="font-medium text-amber-100">{row.price}</strong></div>)}</div> : null}

            {selected.itinerary_days?.length ? <div className="mt-10"><h3 className="text-2xl font-semibold">3天2夜行程</h3><div className="mt-6 grid gap-4 lg:grid-cols-3">{selected.itinerary_days.map((day, index) => <article key={`${selected.id}-day-${index}`} className="border border-white/10 bg-black/15 p-5"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Day {index + 1}</p><h4 className="mt-2 text-lg font-semibold">{day.title}</h4>{day.summary ? <p className="mt-2 text-sm leading-6 text-white/55">{day.summary}</p> : null}{day.items?.length ? <ul className="mt-4 space-y-2 text-sm leading-6 text-white/68">{day.items.map((entry) => <li key={entry}>· {entry}</li>)}</ul> : null}</article>)}</div></div> : null}

            <div className="mt-10 grid gap-8 lg:grid-cols-3">
              <div><h3 className="text-lg font-semibold">配套包含</h3><ul className="mt-4 space-y-2.5 text-sm leading-6 text-white/68">{selected.included_items?.map((entry) => <li key={entry} className="flex gap-2"><Check className="mt-1 h-4 w-4 shrink-0 text-emerald-300" />{entry}</li>)}</ul></div>
              <div><h3 className="text-lg font-semibold">不包含</h3><ul className="mt-4 space-y-2.5 text-sm leading-6 text-white/68">{selected.excluded_items?.map((entry) => <li key={entry} className="flex gap-2"><X className="mt-1 h-4 w-4 shrink-0 text-rose-300" />{entry}</li>)}</ul></div>
              <div><h3 className="text-lg font-semibold">确认前要知道</h3><ul className="mt-4 space-y-2.5 text-sm leading-6 text-white/68">{selected.notes?.map((entry) => <li key={entry} className="flex gap-2"><Coffee className="mt-1 h-4 w-4 shrink-0 text-amber-200" />{entry}</li>)}</ul></div>
            </div>

            {selected.suitable_for?.length ? <div className="mt-8"><p className="text-sm font-medium text-white/75">这个方案比较适合</p><div className="mt-3 flex flex-wrap gap-2">{selected.suitable_for.map((entry) => <span key={entry} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/60">{entry}</span>)}</div></div> : null}
            <div className="mt-8">{cta(selected, 'batam_option_detail', optionCtaLabel(selected))}</div>
          </section>
        ) : null}

        <section className="border border-white/10 bg-white/[0.03] p-6 md:p-8">
          <h2 className="text-2xl font-semibold">价格为什么会不一样？</h2>
          <p className="mt-4 max-w-4xl whitespace-pre-line leading-8 text-white/65">{item.full_description}</p>
          <div className="mt-6 grid gap-3 text-sm text-white/65 md:grid-cols-2 lg:grid-cols-4">
            <div className="border border-white/10 p-4"><strong className="text-white">① 先看人数</strong><p className="mt-2 leading-6">4–5人、6–10人和20人以上的报价可能完全不同，最低价通常对应特定人数。</p></div>
            <div className="border border-white/10 p-4"><strong className="text-white">② 再看酒店</strong><p className="mt-2 leading-6">同一主题方案也可能有不同酒店或房型，单人房差、周末与旺季附加费要分开看。</p></div>
            <div className="border border-white/10 p-4"><strong className="text-white">③ 看真正包含什么</strong><p className="mt-2 leading-6">餐食、按摩、Beach Club、Goa Cave、海盗船与门票是否包含，才是价格差异的重点。</p></div>
            <div className="border border-white/10 p-4"><strong className="text-white">④ 最后看自费项目</strong><p className="mt-2 leading-6">Go Kart、Airsoft、部分餐食或按摩可能需要另外付费，确认总预算时要一起算。</p></div>
          </div>
          {selected ? <div className="mt-7">{cta(selected, 'batam_bottom', '把日期和人数发给我确认')}</div> : null}
        </section>
      </div>
    </main>
  )
}
