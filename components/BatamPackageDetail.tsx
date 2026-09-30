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
  kind: 'theme'
  label: string
  badge: string
  themeText: string
  themeSubtext: string
}> = {
  'value-499': {
    kind: 'theme',
    label: 'VALUE CLASSIC',
    badge: '性价比路线',
    themeText: '经典景点 · 轻松入门',
    themeSubtext: '适合先控制预算，再保留主要 Batam 体验',
  },
  'amazing-promo-499': {
    kind: 'theme',
    label: 'VALUE CLASSIC',
    badge: '性价比路线',
    themeText: '经典景点 · 轻松入门',
    themeSubtext: '适合先控制预算，再保留主要 Batam 体验',
  },
  'new-classic-599': {
    kind: 'theme',
    label: 'RELAX & EXPLORE',
    badge: '含按摩',
    themeText: '经典路线 · 按摩轻享',
    themeSubtext: '30分钟按摩搭配景点与 Beach Club',
  },
  'new-version-599': {
    kind: 'theme',
    label: 'RELAX & EXPLORE',
    badge: '含按摩',
    themeText: '经典路线 · 按摩轻享',
    themeSubtext: '30分钟按摩搭配景点与 Beach Club',
  },
  'economy-island': {
    kind: 'theme',
    label: 'ISLAND SLOW TRAVEL',
    badge: 'Beach Club',
    themeText: '双 Beach Club · 慢节奏',
    themeSubtext: '更适合想把海岛时间留得宽松一点',
  },
  'goa-cave': {
    kind: 'theme',
    label: 'NATURE DISCOVERY',
    badge: '自然探索',
    themeText: 'Goa Cave · 海洞探秘',
    themeSubtext: '把特别自然体验放在这趟行程的重点',
  },
  'ibis-relax-666': {
    kind: 'theme',
    label: 'DEEP RELAX',
    badge: '深度按摩',
    themeText: 'IBIS Styles · 深度放松',
    themeSubtext: '90分钟全身按摩 + 30分钟洗头按摩',
  },
  'lobster-lunch': {
    kind: 'theme',
    label: 'FOOD EXPERIENCE',
    badge: '龙虾午餐',
    themeText: '龙虾午餐 · 美食优先',
    themeSubtext: '适合把特色餐食放在预算重点的人',
  },
  'pirate-afternoon-tea': {
    kind: 'theme',
    label: 'GROUP ESCAPE',
    badge: '20人以上',
    themeText: '海盗船下午茶 · 团体玩法',
    themeSubtext: '更适合公司团、朋友团与大型包团',
  },
}

function optionVisual(option: TravelPackageOption) {
  return OPTION_VISUALS[option.slug] || {
    kind: 'theme' as const,
    label: 'BATAM PACKAGE',
    badge: '精选方案',
    themeText: option.name_zh,
    themeSubtext: '以方案内容、价格与最终确认为准',
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

  const optionHref = (option: TravelPackageOption) => `/packages/${item.slug}/${option.slug}`

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
    window.location.assign(optionHref(option))
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
    { slug: 'amazing-promo-499', icon: CircleDollarSign, title: '预算先看', text: 'RM499 起，保留主要经典景点' },
    { slug: 'new-version-599', icon: Sparkles, title: '想含按摩', text: '30分钟按摩 + Dino’s Gate' },
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
            <div><p className="text-xs uppercase tracking-[0.18em] text-emerald-200/70">Package options</p><h2 className="mt-2 text-3xl font-semibold">巴淡岛 3天2夜方案</h2><p className="mt-3 max-w-3xl leading-7 text-white/60">每个方案都统一整理成价格、住宿、餐食、体验、自费项目和适合人数，直接比较会比一张张看海报更容易选。</p><p className="mt-3 max-w-4xl text-xs leading-6 text-white/42">为了避免把 JnQ 去过的景点误解成我们亲自参加过某个具体配套，下面所有方案卡统一使用「主题视觉」，不把其他实拍照片硬套到单一配套。JnQ 的 Batam 实拍会保留在目的地内容与攻略中。</p></div>
          </div>
          <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {activeOptions.map((option) => {
              const visual = optionVisual(option)
              const suitable = option.suitable_for?.[0]
              return (
                <article key={option.id} className={`group flex flex-col overflow-hidden rounded-[24px] border transition duration-300 ${selected?.id === option.id ? 'border-amber-200/55 bg-amber-200/[0.065] shadow-[0_18px_55px_rgba(251,191,36,0.08)]' : 'border-white/10 bg-white/[0.03] hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.045]'}`}>
                  <button type="button" onClick={() => selectOption(option)} className="relative block aspect-[16/9] overflow-hidden text-left">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(251,191,36,0.18),transparent_34%),radial-gradient(circle_at_82%_72%,rgba(52,211,153,0.10),transparent_32%),linear-gradient(135deg,#13233a_0%,#0a1322_50%,#07101a_100%)]">
                      <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full border border-white/10" />
                      <div className="absolute right-8 top-8 h-24 w-24 rounded-full border border-amber-200/15" />
                      <div className="absolute left-5 top-5 rounded-full border border-white/10 bg-black/15 px-3 py-1.5 text-[10px] font-semibold tracking-[0.16em] text-amber-100/70">{visual.label}</div>
                      <div className="absolute bottom-5 left-5 right-5">
                        <p className="max-w-[88%] text-xl font-semibold leading-snug text-white/94">{visual.themeText}</p>
                        <p className="mt-2 max-w-[90%] text-xs leading-5 text-white/52">{visual.themeSubtext}</p>
                      </div>
                    </div>
                    <div className="absolute bottom-4 right-4 rounded-full bg-amber-100 px-3 py-1.5 text-[11px] font-semibold text-[#171109]">{option.featured ? '性价比推荐' : visual.badge}</div>
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
                      <Link href={optionHref(option)} className="inline-flex min-h-10 items-center rounded-lg bg-white px-4 text-sm font-semibold text-black transition hover:bg-amber-50">查看完整详情</Link>
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

        <section className="border border-white/10 bg-white/[0.03] p-6 md:p-8">
          <h2 className="text-2xl font-semibold">价格为什么会不一样？</h2>
          <p className="mt-4 max-w-4xl whitespace-pre-line leading-8 text-white/65">{item.full_description}</p>
          <div className="mt-6 grid gap-3 text-sm text-white/65 md:grid-cols-2 lg:grid-cols-4">
            <div className="border border-white/10 p-4"><strong className="text-white">① 先看人数</strong><p className="mt-2 leading-6">4–5人、6–10人和20人以上的报价可能完全不同，最低价通常对应特定人数。</p></div>
            <div className="border border-white/10 p-4"><strong className="text-white">② 再看酒店</strong><p className="mt-2 leading-6">同一主题方案也可能有不同酒店或房型，单人房差、周末与旺季附加费要分开看。</p></div>
            <div className="border border-white/10 p-4"><strong className="text-white">③ 看真正包含什么</strong><p className="mt-2 leading-6">餐食、按摩、Beach Club、Goa Cave、海盗船与门票是否包含，才是价格差异的重点。</p></div>
            <div className="border border-white/10 p-4"><strong className="text-white">④ 最后看自费项目</strong><p className="mt-2 leading-6">Go Kart、Airsoft、部分餐食或按摩可能需要另外付费，确认总预算时要一起算。</p></div>
          </div>
          
        </section>
      </div>
    </main>
  )
}
