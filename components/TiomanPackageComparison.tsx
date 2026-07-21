'use client'

import { useEffect } from 'react'

import WhatsAppButton from '@/components/WhatsAppButton'
import { getDeviceType, trackEvent } from '@/lib/analytics'
import { getTiomanComparison, isTiomanPackageSlug, TIOMAN_PACKAGE_SLUGS } from '@/lib/tioman-packages'
import type { TravelPackage } from '@/lib/server/travel-packages'

export default function TiomanPackageComparison({ packages, preview = false }: { packages: TravelPackage[]; preview?: boolean }) {
  const items = packages
    .filter((item) => isTiomanPackageSlug(item.slug))
    .sort((left, right) => TIOMAN_PACKAGE_SLUGS.indexOf(left.slug as typeof TIOMAN_PACKAGE_SLUGS[number]) - TIOMAN_PACKAGE_SLUGS.indexOf(right.slug as typeof TIOMAN_PACKAGE_SLUGS[number]))

  useEffect(() => {
    if (preview || items.length < 2) return
    trackEvent('package_comparison_view', {
      page_path: window.location.pathname,
      page_type: 'package_comparison',
      region_name: 'Pulau Tioman',
      package_count: items.length,
      device_type: getDeviceType(),
    })
  }, [items.length, preview])

  if (items.length < 2) return null

  const rows = [
    ['起价', (item: TravelPackage) => {
      const comparison = getTiomanComparison(item)
      return `${comparison?.priceFrom}／${comparison?.priceUnit}`
    }],
    ['船票', (item: TravelPackage) => getTiomanComparison(item)?.ferry],
    ['住宿', (item: TravelPackage) => getTiomanComparison(item)?.accommodation],
    ['餐食', (item: TravelPackage) => getTiomanComparison(item)?.meals],
    ['浮潜', (item: TravelPackage) => getTiomanComparison(item)?.snorkeling],
    ['码头接送', (item: TravelPackage) => getTiomanComparison(item)?.jettyTransfer],
    ['适合对象', (item: TravelPackage) => getTiomanComparison(item)?.suitableFor],
    ['价格期间', (item: TravelPackage) => getTiomanComparison(item)?.pricePeriod],
  ] as const

  return (
    <section className="border-y border-white/10 py-10 md:py-14">
      <p className="text-xs uppercase text-emerald-200/70">Pulau Tioman / 刁曼岛</p>
      <h2 className="mt-2 text-3xl font-semibold">3天2夜浮潜配套比较</h2>
      <p className="mt-3 max-w-3xl leading-7 text-white/60">三间 Resort 为独立配套，价格单位、船票和接送安排不同；付款前请以旅行社或 Resort 的最终确认资料为准。</p>

      <div className="mt-7 hidden overflow-x-auto border border-white/10 md:block">
        <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
          <thead className="bg-white/5 text-white">
            <tr><th className="w-36 p-4 font-medium text-white/55">Resort</th>{items.map((item) => <th key={item.id} className="min-w-56 p-4 text-base font-semibold">{getTiomanComparison(item)?.resortName}</th>)}</tr>
          </thead>
          <tbody>{rows.map(([label, getValue]) => <tr key={label} className="border-t border-white/10"><th className="p-4 font-medium text-white/55">{label}</th>{items.map((item) => <td key={item.id} className="p-4 leading-6 text-white/75">{getValue(item)}</td>)}</tr>)}</tbody>
          <tfoot><tr className="border-t border-white/10 bg-white/[0.03]"><th className="p-4" /><td colSpan={items.length} className="p-4 text-xs leading-6 text-white/45">配套资料与价格根据旅行社提供的 2026 配套整理。房况、船班、税费、活动安排和最终价格可能调整，付款前请以旅行社或 Resort 最终确认为准。</td></tr></tfoot>
        </table>
      </div>

      <div className="mt-6 grid gap-4 md:hidden">{items.map((item) => {
        const comparison = getTiomanComparison(item)
        return <article key={item.id} className="border border-white/10 bg-white/[0.03] p-5"><h3 className="text-xl font-semibold">{comparison?.resortName}</h3><p className="mt-2 text-2xl text-amber-100">{comparison?.priceFrom}／{comparison?.priceUnit}</p><dl className="mt-5 space-y-3 text-sm">{rows.slice(1).map(([label, getValue]) => <div key={label} className="grid grid-cols-[5.5rem_1fr] gap-3"><dt className="text-white/45">{label}</dt><dd className="leading-6 text-white/75">{getValue(item)}</dd></div>)}</dl><div className="mt-6"><WhatsAppButton pageType="package" packageName={item.title_zh} packageId={item.id} resortName={comparison?.resortName} regionName={item.destination || undefined} priceFrom={comparison?.priceFrom} priceUnit={comparison?.priceUnit} source={item.source_code || undefined} message={item.whatsapp_message || undefined} label="查询此配套" position="comparison_mobile" track={!preview} /></div></article>
      })}</div>
    </section>
  )
}
