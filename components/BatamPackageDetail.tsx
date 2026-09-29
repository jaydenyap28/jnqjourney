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

function optionCtaLabel(option: TravelPackageOption) {
  return `查询「${option.name_zh}」`
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
    ['住宿', (option: TravelPackageOption) => option.accommodation_name],
    ['餐食', (option: TravelPackageOption) => mealSummary(option)],
    ['按摩', (option: TravelPackageOption) => massageSummary(option)],
    ['特色', (option: TravelPackageOption) => mainExperience(option)],
  ] as const

  const quickPicks = [
    { slug: 'value-499', icon: CircleDollarSign, title: '预算先看', text: 'RM499 起的经典路线' },
    { slug: 'ibis-relax-666', icon: Sparkles, title: '想放松', text: '90分钟按摩 + 30分钟洗头按摩' },
    { slug: 'goa-cave', icon: MapPinned, title: '想玩特别一点', text: 'Goa Cave 海洞乘船体验' },
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
          <h2 className="mt-2 text-3xl font-semibold">你比较在意什么？</h2>
          <p className="mt-3 max-w-3xl leading-7 text-white/60">不用先看一大堆行程字。先按预算、按摩、特别体验、餐食或团体人数找到比较接近的方案，再看完整价格。</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
            <div><p className="text-xs uppercase tracking-[0.18em] text-emerald-200/70">Package options</p><h2 className="mt-2 text-3xl font-semibold">巴淡岛 3天2夜方案</h2><p className="mt-3 max-w-3xl leading-7 text-white/60">公开页面只保留你需要比较的价格、酒店、餐食和玩法，供应来源与后台资料不会显示。</p></div>
          </div>
          <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {activeOptions.map((option) => (
              <article key={option.id} className={`flex flex-col border p-5 transition ${selected?.id === option.id ? 'border-amber-200/55 bg-amber-200/[0.07]' : 'border-white/10 bg-white/[0.03]'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-xs text-emerald-200/70">{option.accommodation_type || '3天2夜'}</p><h3 className="mt-2 text-xl font-semibold">{option.name_zh}</h3>{option.name_en ? <p className="mt-1 text-xs text-white/40">{option.name_en}</p> : null}</div>
                  {option.featured ? <span className="rounded-full bg-amber-200/10 px-2.5 py-1 text-[11px] text-amber-100">预算型</span> : null}
                </div>
                <p className="mt-4 text-2xl font-semibold text-amber-100">{option.price_display}</p>
                <p className="mt-1 text-xs text-white/45">{option.validity_label || '预订前重新确认'}</p>
                <div className="mt-4 flex items-center gap-2 text-sm text-white/65"><Hotel className="h-4 w-4 text-white/40" />{option.accommodation_name}</div>
                <div className="mt-4 flex flex-wrap gap-1.5">{(option.highlights || []).slice(0, 4).map((entry) => <span key={entry} className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-white/58">{entry}</span>)}</div>
                <p className="mt-4 line-clamp-3 text-sm leading-6 text-white/60">{option.short_description}</p>
                <div className="mt-auto flex flex-wrap gap-2 pt-5"><button type="button" onClick={() => selectOption(option)} className="min-h-10 rounded-lg bg-white px-4 text-sm font-medium text-black">查看详情</button>{cta(option, 'batam_option_card')}</div>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-white/10 py-10 md:py-14">
          <p className="text-xs uppercase tracking-[0.18em] text-emerald-200/70">Quick comparison</p>
          <h2 className="mt-2 text-3xl font-semibold">一次看清主要差别</h2>
          <p className="mt-3 max-w-3xl leading-7 text-white/60">桌面版可以横向比较全部方案；手机建议先看上面的方案卡，再进入单一方案详情。</p>
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
          <div className="mt-6 grid gap-3 text-sm text-white/65 md:grid-cols-3">
            <div className="border border-white/10 p-4"><strong className="text-white">人数</strong><p className="mt-2 leading-6">4–5人、6–10人和20人以上的报价可能完全不同，不要只看最低价。</p></div>
            <div className="border border-white/10 p-4"><strong className="text-white">酒店与房型</strong><p className="mt-2 leading-6">同一主题方案也可能提供不同酒店，单人房差与旺季附加费要分开看。</p></div>
            <div className="border border-white/10 p-4"><strong className="text-white">包含项目</strong><p className="mt-2 leading-6">按摩、餐食、Goa Cave、Beach Club 与团体项目是否包含，是价格差异的重要来源。</p></div>
          </div>
          {selected ? <div className="mt-7">{cta(selected, 'batam_bottom', '把日期和人数发给我确认')}</div> : null}
        </section>
      </div>
    </main>
  )
}
