import WhatsAppButton from '@/components/WhatsAppButton'
import FallbackImage from '@/components/FallbackImage'
import { optionPrice, packagePriceUnits, safePackageImageUrl } from '@/lib/package-presentation'
import type { TravelPackage, TravelPackageOption } from '@/lib/server/travel-packages'

/** Reuses the existing parent/options schema for Hainan, Batam and future routes. */
export default function PackageOptionsSection({ item, options, preview = false }: { item: TravelPackage; options: TravelPackageOption[]; preview?: boolean }) {
  const visible = options.filter(o => o.package_id === item.id && (preview || o.status === 'active')).sort((a,b) => (a.sort_order || 0) - (b.sort_order || 0))
  if (!visible.length) return null
  return <section id="package-options" className="scroll-mt-6" aria-labelledby="package-options-heading">
    <h2 id="package-options-heading" className="text-3xl font-semibold">选择配套方案</h2>
    <p className="mt-3 text-sm leading-7 text-white/60">同一主行程下比较方案。价格单位、包含项目和报价有效期分别以各方案为准。</p>
    <div className="mt-6 grid min-w-0 gap-5 md:grid-cols-2">{visible.map(option => <article key={option.id} className="min-w-0 rounded-lg border border-white/15 p-5">
      <h3 className="break-words text-xl font-semibold">{option.name_zh}</h3>
      <p className="mt-3 break-words text-2xl text-amber-100">{optionPrice(option)}</p>
      <p className="mt-2 text-sm text-white/60">{packagePriceUnits[option.price_unit]}{option.validity_label ? ` · ${option.validity_label}` : ''}</p>
      <p className="mt-4 whitespace-pre-line break-words leading-7 text-white/70">{option.short_description}</p>
      {option.price_rows?.length ? <dl className="mt-4 divide-y divide-white/10">{option.price_rows.map((row,index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 py-3"><dt className="break-words text-white/65">{row.label}</dt><dd className="break-words text-right font-medium text-amber-100">{row.price}</dd></div>)}</dl> : null}
      <details className="mt-4 border-t border-white/10"><summary className="min-h-11 cursor-pointer py-3">包含项目、注意事项及照片</summary>
        {[['方案包含',option.included_items],['不包括',option.excluded_items],['注意事项',option.notes]] .map(([label,entries]) => Array.isArray(entries) && entries.length ? <div key={String(label)} className="my-4"><h4 className="font-semibold">{String(label)}</h4><ul className="mt-2 list-inside list-disc space-y-2 break-words text-sm leading-7 text-white/65">{entries.map((entry,index) => <li key={index}>{String(entry)}</li>)}</ul></div> : null)}
        {(option.gallery?.length ? option.gallery : option.brochure_image ? [option.brochure_image] : []).filter(image=>safePackageImageUrl(image.url)).map((image,index) => <a key={`${image.url}-${index}`} href={image.url} target="_blank" rel="noopener noreferrer" className="my-4 block"><div className="relative aspect-[4/5] bg-black/25"><FallbackImage src={image.url} alt={image.alt || `${option.name_zh} 方案照片 ${index+1}`} fill className="object-contain" /></div><span className="block min-h-11 py-3 text-sm underline">{image.caption || '打开完整图片'}</span></a>)}
      </details>
      <WhatsAppButton pageType="package" packageName={item.title_zh} packageId={item.id} optionId={option.id} optionName={option.name_zh} source={option.source_code || undefined} message={option.whatsapp_message || undefined} label={`询问${option.name_zh}`} position="package_option" track={!preview} />
    </article>)}</div>
    <p className="mt-5 text-sm leading-7 text-white/55">报价、房况及安排以最终确认为准，页面保留的资料不代表实时库存。</p>
  </section>
}
