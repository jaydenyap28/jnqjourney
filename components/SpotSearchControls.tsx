'use client'

import { useId } from 'react'
import type { SpotFilters, SearchableSpot } from '@/lib/spot-search'
import { EMPTY_SPOT_FILTERS } from '@/lib/spot-search'

export default function SpotSearchControls({ spots, value, onChange, locale = 'zh', compact = false }: {
  spots: SearchableSpot[]; value: SpotFilters; onChange: (value: SpotFilters) => void; locale?: string; compact?: boolean
}) {
  const id = useId()
  const countries = [...new Set(spots.map(spot => spot.region?.country).filter((name): name is string => Boolean(name)))].sort()
  const regions = [...new Map(spots.filter(spot => !value.country || spot.region?.country === value.country)
    .flatMap(spot => spot.region?.id ? [[spot.region.id, spot.region] as const] : [])).values()]
  const en = locale === 'en'
  const selectClass = 'min-h-11 min-w-0 rounded-xl border border-white/20 bg-slate-950 px-2 text-sm text-white focus-visible:outline-amber-200'
  return <div className={`grid gap-2 ${compact ? 'grid-cols-3' : 'sm:grid-cols-4'}`}>
    {([
      ['country', en ? 'Country' : '国家', countries.map(name => ({ value: name, label: name }))],
      ['region', en ? 'Region / city' : '地区 / 城市', regions.map(region => ({ value: String(region.id), label: region.name }))],
      ['category', en ? 'Category' : '分类', [{ value: 'attraction', label: en ? 'Spots' : '景点' }, { value: 'food', label: en ? 'Food' : '餐厅 / 美食' }, { value: 'accommodation', label: en ? 'Stays' : '住宿' }]],
    ] as const).map(([key, label, options]) => <label key={key} htmlFor={`${id}-${key}`} className="min-w-0">
      <span className="sr-only">{label}</span>
      <select id={`${id}-${key}`} aria-label={label} value={value[key]} className={`${selectClass} w-full`}
        onChange={event => onChange({ ...value, [key]: event.target.value, ...(key === 'country' ? { region: '' } : {}) })}>
        <option value="">{label}</option>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>)}
    {Object.values(value).some(Boolean) ? <button type="button" onClick={() => onChange(EMPTY_SPOT_FILTERS)} className="min-h-11 rounded-xl border border-white/20 px-3 text-sm text-amber-100">{en ? 'Clear filters' : '清除条件'}</button> : null}
  </div>
}
