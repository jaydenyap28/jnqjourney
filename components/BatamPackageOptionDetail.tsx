'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { CalendarDays, Check, ChevronRight, Coffee, Hotel, Maximize2, Users, X } from 'lucide-react'

import FallbackImage from '@/components/FallbackImage'
import WhatsAppButton from '@/components/WhatsAppButton'
import { getDeviceType, trackEvent } from '@/lib/analytics'
import type { TravelPackage, TravelPackageOption } from '@/lib/server/travel-packages'

function formatItineraryEntry(entry: string) {
  const value = entry.trim()
  if (value === '酒店早餐') return '早餐：酒店'
  return value
}

const THEMES: Record<string, { eyebrow: string; title: string; subtitle: string; badge: string }> = {
  'value-499': { eyebrow: 'VALUE CLASSIC', title: '经典景点 · 轻松入门', subtitle: '适合先控制预算，再保留主要 Batam 体验', badge: '性价比路线' },
  'amazing-promo-499': { eyebrow: 'VALUE CLASSIC', title: '经典景点 · 轻松入门', subtitle: '适合先控制预算，再保留主要 Batam 体验', badge: '性价比路线' },
  'new-classic-599': { eyebrow: 'RELAX & EXPLORE', title: '经典路线 · 按摩轻享', subtitle: '30分钟按摩搭配景点与 Beach Club', badge: '含按摩' },
  'new-version-599': { eyebrow: 'RELAX & EXPLORE', title: '经典路线 · 按摩轻享', subtitle: '30分钟按摩搭配景点与 Beach Club', badge: '含按摩' },
  'economy-island': { eyebrow: 'ISLAND SLOW TRAVEL', title: '双 Beach Club · 慢节奏', subtitle: '更适合想把海岛时间留得宽松一点', badge: 'Beach Club' },
  'goa-cave': { eyebrow: 'NATURE DISCOVERY', title: 'Goa Cave · 海洞探秘', subtitle: '把特别自然体验放在这趟行程的重点', badge: '自然探索' },
  'ibis-relax-666': { eyebrow: 'DEEP RELAX', title: 'IBIS Styles · 深度放松', subtitle: '90分钟全身按摩 + 30分钟洗头按摩', badge: '深度按摩' },
  'lobster-lunch': { eyebrow: 'FOOD EXPERIENCE', title: '龙虾午餐 · 美食优先', subtitle: '适合把特色餐食放在预算重点的人', badge: '龙虾午餐' },
  'pirate-afternoon-tea': { eyebrow: 'GROUP ESCAPE', title: '海盗船下午茶 · 团体玩法', subtitle: '更适合公司团、朋友团与大型包团', badge: '20人以上' },
}

const GOLDEN_VIEW_2026_SURCHARGE_DATES = [
  { month: '2月', occasion: 'Chinese New Year', dates: '16、17、18、19 February 2026' },
  { month: '4月', occasion: 'Good Friday', dates: '3、4 April 2026' },
  { month: '8月', occasion: 'Singapore National Day', dates: '8、9 August 2026' },
  { month: '11月', occasion: 'Deepavali', dates: '7、8 November 2026' },
  { month: '12月', occasion: 'Christmas & New Year', dates: '25、26、27、31 December 2026' },
] as const

// Golden View Hotel's supplied 2027 surcharge dates; no amounts were supplied.
const GOLDEN_VIEW_2027_SURCHARGE_DATES = [
  { month: '1月', occasion: '新年 · New Year', dates: '2027年1月1–2日' },
  { month: '2月', occasion: '春节 · CNY', dates: '2027年2月4–10日' },
  { month: '3月', occasion: '开斋节 · Idul Fitri', dates: '2027年3月9–13日' },
  { month: '3月', occasion: '耶稣受难日 · Good Friday', dates: '2027年3月26–27日' },
  { month: '4月', occasion: '劳动节 · Hari Buruh', dates: '2027年4月30日' },
  { month: '5月', occasion: '劳动节 · Hari Buruh', dates: '2027年5月1–2日' },
  { month: '5月', occasion: '卫塞节 · Waisak', dates: '2027年5月20–22日' },
  { month: '8月', occasion: '新加坡国庆日 · SG Independence Day', dates: '2027年8月7–9日' },
  { month: '8月', occasion: '马来西亚国庆日 · Malay Independence Day', dates: '2027年8月29–31日' },
  { month: '10月', occasion: '屠妖节 · Deepavali', dates: '2027年10月28–30日' },
  { month: '12月', occasion: '圣诞节 · Christmas', dates: '2027年12月24–26日' },
  { month: '12月', occasion: '跨年 · New Year', dates: '2027年12月30–31日、2028年1月1日' },
] as const

const BATAM_SMALL_GROUP_SURCHARGES: Record<string, { packageLabel: string; rows: Array<{ people: string; surcharge: string }> }> = {
  'amazing-promo-499': {
    packageLabel: 'Batam 非常优惠',
    rows: [{ people: '2–3人出发', surcharge: '+ RM200 / pax' }],
  },
  'economy-island': {
    packageLabel: 'Batam Economy Package',
    rows: [
      { people: '2人出发', surcharge: '+ RM150 / pax' },
      { people: '3人出发', surcharge: '+ RM80 / pax' },
    ],
  },
  'new-version-599': {
    packageLabel: 'Batam 新品配套',
    rows: [
      { people: '2人出发', surcharge: '+ RM160 / pax' },
      { people: '3人出发', surcharge: '+ RM90 / pax' },
    ],
  },
}

export default function BatamPackageOptionDetail({ item, option }: { item: TravelPackage; option: TravelPackageOption }) {
  const theme = THEMES[option.slug] || { eyebrow: 'BATAM PACKAGE', title: option.name_zh, subtitle: option.short_description || '', badge: '精选方案' }
  const brochure = option.brochure_image?.url ? option.brochure_image : null
  const usesGoldenViewHotel = option.accommodation_name.toLowerCase().includes('golden view hotel')
  const smallGroupSurcharge = BATAM_SMALL_GROUP_SURCHARGES[option.slug]
  const [brochureOpen, setBrochureOpen] = useState(false)

  useEffect(() => {
    trackEvent('package_option_view', {
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
  }, [item.id, item.title_zh, option])

  useEffect(() => {
    if (!brochureOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setBrochureOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [brochureOpen])

  const openBrochure = () => {
    setBrochureOpen(true)
    trackEvent('package_brochure_view', {
      page_path: window.location.pathname,
      page_type: 'package',
      package_id: item.id,
      package_name: item.title_zh,
      option_id: option.id,
      option_name: option.name_zh,
      source_code: option.source_code,
      device_type: getDeviceType(),
    })
  }

  const cta = (label: string, position: string) => (
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
    />
  )

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(251,191,36,0.18),transparent_34%),radial-gradient(circle_at_82%_72%,rgba(52,211,153,0.10),transparent_32%),linear-gradient(135deg,#13233a_0%,#0a1322_50%,#07101a_100%)]" />
        <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-10 md:px-8 md:pb-20 md:pt-14">
          <nav className="flex flex-wrap items-center gap-2 text-xs text-white/50">
            <Link href="/">首页</Link><ChevronRight className="h-3 w-3" />
            <Link href="/packages">旅游配套</Link><ChevronRight className="h-3 w-3" />
            <Link href="/packages/batam-3d2n">巴淡岛 3天2夜</Link>
          </nav>
          <div className="mt-12 max-w-4xl">
            <p className="text-xs font-semibold tracking-[0.18em] text-amber-100/65">{theme.eyebrow}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <h1 className="text-4xl font-semibold leading-tight md:text-6xl">{option.name_zh}</h1>
              <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-[#171109]">{theme.badge}</span>
            </div>
            {option.name_en ? <p className="mt-3 text-base text-white/38">{option.name_en}</p> : null}
            <p className="mt-6 text-xl font-medium text-white/88">{theme.title}</p>
            <p className="mt-2 max-w-3xl leading-7 text-white/55">{theme.subtitle}</p>
            <p className="mt-6 max-w-3xl leading-8 text-white/68">{option.short_description}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm">{option.accommodation_type || '3天2夜'}</span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm">{option.accommodation_name}</span>
            </div>
            <div className="mt-8 flex flex-wrap items-end gap-5">
              <div><p className="text-xs text-white/42">参考价格</p><p className="mt-1 text-3xl font-semibold text-amber-100">{option.price_display}</p><p className="mt-1 text-xs text-white/38">{option.validity_label || '最终价格按日期与人数确认'}</p></div>
              {cta('WhatsApp 查询这个配套', 'option_hero')}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-14 px-5 py-14 md:px-8 md:py-18">
        {option.gallery?.length ? (
          <section>
            <h2 className="text-2xl font-semibold">方案照片</h2>
            <p className="mt-2 text-sm leading-6 text-white/45">这里显示的是这个方案自己的公开照片，不与其他 Batam 配套混用。</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {option.gallery.map((image, index) => (
                <div key={`${image.url}-${index}`} className={`group relative overflow-hidden rounded-xl border border-white/10 bg-black/25 ${index === 0 ? 'sm:col-span-2 lg:col-span-2' : ''}`}>
                  <div className={index === 0 ? 'relative aspect-[16/9]' : 'relative aspect-[4/3]'}>
                    <FallbackImage
                      src={image.url}
                      alt={image.alt || `${option.name_zh} 照片 ${index + 1}`}
                      fill
                      className="object-cover transition duration-500 group-hover:scale-[1.02]"
                    />
                  </div>
                  {image.caption ? <p className="border-t border-white/10 px-4 py-3 text-xs leading-5 text-white/45">{image.caption}</p> : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {option.highlights?.length ? <section><h2 className="text-2xl font-semibold">这个方案的重点</h2><div className="mt-5 grid gap-3 md:grid-cols-2">{option.highlights.map((entry) => <div key={entry} className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4"><Check className="mt-1 h-4 w-4 shrink-0 text-emerald-300" /><span className="leading-7 text-white/72">{entry}</span></div>)}</div></section> : null}

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5"><Hotel className="h-5 w-5 text-amber-200" /><p className="mt-3 text-xs text-white/40">住宿</p><p className="mt-1 text-lg font-semibold">{option.accommodation_name}</p></div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5"><Users className="h-5 w-5 text-amber-200" /><p className="mt-3 text-xs text-white/40">比较适合</p><p className="mt-1 text-lg font-semibold">{option.suitable_for?.[0] || '按人数与需求选择'}</p></div>
        </section>

        {usesGoldenViewHotel ? (
          <section className="rounded-xl border border-amber-200/25 bg-amber-200/[0.055] p-5 md:p-6">
            <div className="flex gap-3">
              <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-amber-100/60">Golden View Hotel · Surcharge Calendar</p>
                <h2 className="mt-2 text-xl font-semibold">Golden View Hotel 旺季附加费日期</h2>
                <p className="mt-3 max-w-4xl text-sm leading-6 text-white/62">
                  仅在本方案最终确认入住 Golden View Hotel，且实际住宿日期落在以下区间时适用。酒店已提供加价日期，但尚未提供具体附加费金额；请在预订时按日期、房型和晚数确认最终费用。
                </p>
              </div>
            </div>

            <h3 className="mt-6 text-base font-semibold text-amber-100">2027 年旺季附加费日期</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {GOLDEN_VIEW_2027_SURCHARGE_DATES.map((entry) => (
                <div key={'2027-' + entry.month + '-' + entry.occasion} className="rounded-lg border border-white/10 bg-black/15 px-4 py-3">
                  <p className="text-sm font-semibold text-amber-100">{entry.month}｜{entry.occasion}</p>
                  <p className="mt-1 text-sm leading-6 text-white/70">{entry.dates}</p>
                </div>
              ))}
            </div>

            <details className="mt-6 rounded-lg border border-white/10 bg-black/10 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-white/75">查看 2026 年旺季附加费日期</summary>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {GOLDEN_VIEW_2026_SURCHARGE_DATES.map((entry) => (
                  <div key={'2026-' + entry.month + '-' + entry.occasion} className="rounded-lg border border-white/10 bg-black/15 px-4 py-3">
                    <p className="text-sm font-semibold text-amber-100">{entry.month}｜{entry.occasion}</p>
                    <p className="mt-1 text-sm leading-6 text-white/66">{entry.dates}</p>
                  </div>
                ))}
              </div>
            </details>
            <p className="mt-4 text-xs leading-5 text-white/45">
              2027 年日期按 Golden View Hotel 提供的加价表列出，包括 2028 年 1 月 1 日。以上为加价适用日期，不代表酒店房间或配套已确认可订；最终收费以正式报价为准。
            </p>
          </section>
        ) : null}

        {option.price_rows?.length ? <section><h2 className="text-2xl font-semibold">人数与价格</h2><div className="mt-5 overflow-hidden rounded-xl border border-white/10"><div className="grid grid-cols-[1fr_auto] gap-4 bg-white/[0.04] px-4 py-3 text-xs text-white/45"><span>人数 / 条件</span><span>价格</span></div>{option.price_rows.map((row) => <div key={`${row.label}-${row.price}`} className="grid grid-cols-[1fr_auto] gap-4 border-t border-white/10 px-4 py-3 text-sm"><span className="text-white/68">{row.label}</span><strong className="font-medium text-amber-100">{row.price}</strong></div>)}</div></section> : null}

        {smallGroupSurcharge ? (
          <section className="rounded-xl border border-sky-200/20 bg-sky-200/[0.045] p-5 md:p-6">
            <div className="flex gap-3">
              <Users className="mt-0.5 h-5 w-5 shrink-0 text-sky-200" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-sky-100/55">Small Group Surcharge</p>
                <h2 className="mt-2 text-xl font-semibold">不足 4 人也可以出发</h2>
                <p className="mt-3 text-sm leading-6 text-white/62">{smallGroupSurcharge.packageLabel} 若不足 4 人成团，可补以下差额安排小团出发：</p>
              </div>
            </div>
            <div className="mt-5 overflow-hidden rounded-lg border border-white/10">
              {smallGroupSurcharge.rows.map((row, index) => (
                <div key={row.people} className={`grid grid-cols-[1fr_auto] gap-4 px-4 py-3 text-sm ${index ? 'border-t border-white/10' : ''}`}>
                  <span className="text-white/70">{row.people}</span>
                  <strong className="font-semibold text-sky-100">{row.surcharge}</strong>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-5 text-white/42">以上为不足 4 人成团时每人需补的差额，最终安排及价格以查询时确认为准。</p>
          </section>
        ) : null}

        {brochure ? (
          <section className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.025]">
            <div className="grid lg:grid-cols-[minmax(0,0.95fr)_minmax(300px,0.65fr)]">
              <button type="button" onClick={openBrochure} className="group relative bg-black/25 p-3 text-left md:p-5" aria-label={`放大查看 ${option.name_zh} 配套详情图`}>
                <img src={brochure.url} alt={brochure.alt || `${option.name_zh} 配套详情图`} className="mx-auto h-auto w-full max-w-[760px] rounded-xl object-contain shadow-[0_18px_70px_rgba(0,0,0,0.34)]" />
                <span className="absolute right-6 top-6 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/65 px-3 py-1.5 text-xs text-white/85 opacity-90 backdrop-blur-sm transition group-hover:bg-black/80"><Maximize2 className="h-3.5 w-3.5" />查看大图</span>
              </button>
              <div className="flex flex-col justify-center border-t border-white/10 p-6 lg:border-l lg:border-t-0 lg:p-8">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200/70">JnQ package visual</p>
                <h2 className="mt-2 text-2xl font-semibold">一张看完这个配套</h2>
                <p className="mt-4 leading-7 text-white/62">这张是 JnQ Journey 重新整理制作的配套详情图，方便快速查看路线、价格和主要包含项目。</p>
                <p className="mt-3 text-sm leading-6 text-white/42">它不代表我们亲自参加过这个具体配套。若图片与最新文字资料出现差异，以本页最新内容和查询时的最终确认为准。</p>
                {brochure.caption ? <p className="mt-4 text-xs text-white/35">{brochure.caption}</p> : null}
                <button type="button" onClick={openBrochure} className="mt-6 inline-flex min-h-11 w-fit items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-5 text-sm font-medium text-white/80 transition hover:bg-white/[0.08]"><Maximize2 className="h-4 w-4" />放大查看完整配套图</button>
              </div>
            </div>
          </section>
        ) : null}

        {option.itinerary_days?.length ? <section><h2 className="text-2xl font-semibold">3天2夜详细行程</h2><div className="mt-6 space-y-4">{option.itinerary_days.map((day, index) => <article key={`${option.id}-day-${index}`} className="grid gap-4 rounded-xl border border-white/10 bg-white/[0.025] p-5 md:grid-cols-[7rem_1fr]"><p className="text-sm font-semibold text-amber-200">Day {index + 1}</p><div><h3 className="text-lg font-semibold">{day.title}</h3>{day.summary ? <p className="mt-2 leading-7 text-white/55">{day.summary}</p> : null}{day.items?.length ? <ul className="mt-4 space-y-2 text-sm leading-6 text-white/68">{day.items.map((entry) => {
  const displayEntry = formatItineraryEntry(entry)
  const isFootnote = displayEntry.startsWith('*')
  return isFootnote
    ? <li key={entry} className="mt-3 rounded-lg border border-amber-200/10 bg-amber-200/[0.04] px-3 py-2 text-xs leading-5 text-amber-100/65">{displayEntry}</li>
    : <li key={entry}>· {displayEntry}</li>
})}</ul> : null}</div></article>)}</div></section> : null}

        <section className="grid gap-8 lg:grid-cols-3">
          <div><h2 className="text-lg font-semibold">配套包含</h2><ul className="mt-4 space-y-2.5 text-sm leading-6 text-white/68">{option.included_items?.map((entry) => <li key={entry} className="flex gap-2"><Check className="mt-1 h-4 w-4 shrink-0 text-emerald-300" />{entry}</li>)}</ul></div>
          <div><h2 className="text-lg font-semibold">不包含</h2><ul className="mt-4 space-y-2.5 text-sm leading-6 text-white/68">{option.excluded_items?.map((entry) => <li key={entry} className="flex gap-2"><X className="mt-1 h-4 w-4 shrink-0 text-rose-300" />{entry}</li>)}</ul></div>
          <div><h2 className="text-lg font-semibold">确认前要知道</h2><ul className="mt-4 space-y-2.5 text-sm leading-6 text-white/68">{option.notes?.map((entry) => <li key={entry} className="flex gap-2"><Coffee className="mt-1 h-4 w-4 shrink-0 text-amber-200" />{entry}</li>)}</ul></div>
        </section>

        {option.suitable_for?.length ? <section><h2 className="text-2xl font-semibold">适合谁</h2><div className="mt-4 flex flex-wrap gap-2">{option.suitable_for.map((entry) => <span key={entry} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/62">{entry}</span>)}</div></section> : null}

        <section className="rounded-xl border border-amber-200/20 bg-amber-200/[0.05] p-6 md:p-8"><h2 className="text-2xl font-semibold">想确认这个方案？</h2><p className="mt-3 max-w-3xl leading-7 text-white/60">把预计日期、成人儿童人数、房间数量和出发地点发给我们，我们会按这个方案重新确认当期价格与可安排情况。</p><div className="mt-6">{cta(`查询「${option.name_zh}」`, 'option_bottom')}</div></section>

        <div><Link href="/packages/batam-3d2n" className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-5 text-sm text-white/70 transition hover:bg-white/5 hover:text-white">← 返回比较全部 Batam 配套</Link></div>
      </div>

      {brochureOpen && brochure ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/92 p-3 md:p-8" role="dialog" aria-modal="true" aria-label={`${option.name_zh} 配套详情图`} onMouseDown={() => setBrochureOpen(false)}>
          <button type="button" onClick={() => setBrochureOpen(false)} className="absolute right-4 top-4 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/65 text-white" aria-label="关闭配套详情图"><X className="h-5 w-5" /></button>
          <div className="max-h-full max-w-5xl overflow-auto" onMouseDown={(event) => event.stopPropagation()}>
            <img src={brochure.url} alt={brochure.alt || `${option.name_zh} 配套详情图`} className="h-auto w-full object-contain" />
          </div>
        </div>
      ) : null}
    </main>
  )
}
