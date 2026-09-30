'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { Check, ChevronRight, Coffee, Hotel, Users, X } from 'lucide-react'

import WhatsAppButton from '@/components/WhatsAppButton'
import { getDeviceType, trackEvent } from '@/lib/analytics'
import type { TravelPackage, TravelPackageOption } from '@/lib/server/travel-packages'

const THEMES: Record<string, { eyebrow: string; title: string; subtitle: string; badge: string }> = {
  'value-499': { eyebrow: 'VALUE CLASSIC', title: '经典景点 · 轻松入门', subtitle: '适合先控制预算，再保留主要 Batam 体验', badge: '性价比路线' },
  'new-classic-599': { eyebrow: 'RELAX & EXPLORE', title: '经典路线 · 按摩轻享', subtitle: '30分钟按摩搭配景点与 Beach Club', badge: '含按摩' },
  'economy-island': { eyebrow: 'ISLAND SLOW TRAVEL', title: '双 Beach Club · 慢节奏', subtitle: '更适合想把海岛时间留得宽松一点', badge: 'Beach Club' },
  'goa-cave': { eyebrow: 'NATURE DISCOVERY', title: 'Goa Cave · 海洞探秘', subtitle: '把特别自然体验放在这趟行程的重点', badge: '自然探索' },
  'ibis-relax-666': { eyebrow: 'DEEP RELAX', title: 'IBIS Styles · 深度放松', subtitle: '90分钟全身按摩 + 30分钟洗头按摩', badge: '深度按摩' },
  'lobster-lunch': { eyebrow: 'FOOD EXPERIENCE', title: '龙虾午餐 · 美食优先', subtitle: '适合把特色餐食放在预算重点的人', badge: '龙虾午餐' },
  'pirate-afternoon-tea': { eyebrow: 'GROUP ESCAPE', title: '海盗船下午茶 · 团体玩法', subtitle: '更适合公司团、朋友团与大型包团', badge: '20人以上' },
}

export default function BatamPackageOptionDetail({ item, option }: { item: TravelPackage; option: TravelPackageOption }) {
  const theme = THEMES[option.slug] || { eyebrow: 'BATAM PACKAGE', title: option.name_zh, subtitle: option.short_description || '', badge: '精选方案' }

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
        {option.highlights?.length ? <section><h2 className="text-2xl font-semibold">这个方案的重点</h2><div className="mt-5 grid gap-3 md:grid-cols-2">{option.highlights.map((entry) => <div key={entry} className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4"><Check className="mt-1 h-4 w-4 shrink-0 text-emerald-300" /><span className="leading-7 text-white/72">{entry}</span></div>)}</div></section> : null}

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5"><Hotel className="h-5 w-5 text-amber-200" /><p className="mt-3 text-xs text-white/40">住宿</p><p className="mt-1 text-lg font-semibold">{option.accommodation_name}</p></div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5"><Users className="h-5 w-5 text-amber-200" /><p className="mt-3 text-xs text-white/40">比较适合</p><p className="mt-1 text-lg font-semibold">{option.suitable_for?.[0] || '按人数与需求选择'}</p></div>
        </section>

        {option.price_rows?.length ? <section><h2 className="text-2xl font-semibold">人数与价格</h2><div className="mt-5 overflow-hidden rounded-xl border border-white/10"><div className="grid grid-cols-[1fr_auto] gap-4 bg-white/[0.04] px-4 py-3 text-xs text-white/45"><span>人数 / 条件</span><span>价格</span></div>{option.price_rows.map((row) => <div key={`${row.label}-${row.price}`} className="grid grid-cols-[1fr_auto] gap-4 border-t border-white/10 px-4 py-3 text-sm"><span className="text-white/68">{row.label}</span><strong className="font-medium text-amber-100">{row.price}</strong></div>)}</div></section> : null}

        {option.itinerary_days?.length ? <section><h2 className="text-2xl font-semibold">3天2夜详细行程</h2><div className="mt-6 space-y-4">{option.itinerary_days.map((day, index) => <article key={`${option.id}-day-${index}`} className="grid gap-4 rounded-xl border border-white/10 bg-white/[0.025] p-5 md:grid-cols-[7rem_1fr]"><p className="text-sm font-semibold text-amber-200">Day {index + 1}</p><div><h3 className="text-lg font-semibold">{day.title}</h3>{day.summary ? <p className="mt-2 leading-7 text-white/55">{day.summary}</p> : null}{day.items?.length ? <ul className="mt-4 space-y-2 text-sm leading-6 text-white/68">{day.items.map((entry) => <li key={entry}>· {entry}</li>)}</ul> : null}</div></article>)}</div></section> : null}

        <section className="grid gap-8 lg:grid-cols-3">
          <div><h2 className="text-lg font-semibold">配套包含</h2><ul className="mt-4 space-y-2.5 text-sm leading-6 text-white/68">{option.included_items?.map((entry) => <li key={entry} className="flex gap-2"><Check className="mt-1 h-4 w-4 shrink-0 text-emerald-300" />{entry}</li>)}</ul></div>
          <div><h2 className="text-lg font-semibold">不包含</h2><ul className="mt-4 space-y-2.5 text-sm leading-6 text-white/68">{option.excluded_items?.map((entry) => <li key={entry} className="flex gap-2"><X className="mt-1 h-4 w-4 shrink-0 text-rose-300" />{entry}</li>)}</ul></div>
          <div><h2 className="text-lg font-semibold">确认前要知道</h2><ul className="mt-4 space-y-2.5 text-sm leading-6 text-white/68">{option.notes?.map((entry) => <li key={entry} className="flex gap-2"><Coffee className="mt-1 h-4 w-4 shrink-0 text-amber-200" />{entry}</li>)}</ul></div>
        </section>

        {option.suitable_for?.length ? <section><h2 className="text-2xl font-semibold">适合谁</h2><div className="mt-4 flex flex-wrap gap-2">{option.suitable_for.map((entry) => <span key={entry} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/62">{entry}</span>)}</div></section> : null}

        <section className="rounded-xl border border-amber-200/20 bg-amber-200/[0.05] p-6 md:p-8"><h2 className="text-2xl font-semibold">想确认这个方案？</h2><p className="mt-3 max-w-3xl leading-7 text-white/60">把预计日期、成人儿童人数、房间数量和出发地点发给我们，我们会按这个方案重新确认当期价格与可安排情况。</p><div className="mt-6">{cta(`查询「${option.name_zh}」`, 'option_bottom')}</div></section>

        <div><Link href="/packages/batam-3d2n" className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-5 text-sm text-white/70 transition hover:bg-white/5 hover:text-white">← 返回比较全部 Batam 配套</Link></div>
      </div>
    </main>
  )
}
