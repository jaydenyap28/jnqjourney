import { spotDescriptionExcerpt } from './spot-description.ts'
import { getSpotDescription } from './content-display.ts'
import { publicProse } from './public-prose.ts'

/** Card text uses the same source precedence as the detail; no content mutation. */
export function spotCardExcerpt(spot: Parameters<typeof getSpotDescription>[0], limit = 180) {
  const text = spotDescriptionExcerpt(getSpotDescription(spot))
  if (text.length <= limit) return text
  return [...text].slice(0, Math.max(0, limit - 1)).join('') + '…'
}

export function guideSearchTitle(guide: { title: string; duration?: string }) {
  const duration = String(guide.duration || '').trim().replace(/(\d+)\s*Days?\s*\/\s*(\d+)\s*Nights?/i, '$1天$2夜')
  return `${guide.title}${duration ? `｜${duration}` : ''}自由行攻略`
}

export function regionEditorial(region: { name: string; description?: string | null }, names: string[] = [], locale: 'zh' | 'en' = 'zh') {
  const selected = [...new Set(names.map(name => name.trim()).filter(Boolean))].slice(0, 3)
  const title = locale === 'en' ? `${region.name} travel map and trip notes` : `${region.name}旅游地图与行程参考`
  const introduction = publicProse(region.description, locale) || (locale === 'en'
    ? `Browse the places collected in ${region.name}${selected.length ? `, including ${selected.join(', ')}` : ''}. Open each place for its available details and map location.`
    : `查看 JnQ Journey 已收录的${region.name}地点${selected.length ? `，包括${selected.join('、')}` : ''}。可从下方地点进入详情，结合地图位置安排自己的行程。`)
  return { title, introduction, description: spotDescriptionExcerpt(introduction).slice(0, 160) }
}
