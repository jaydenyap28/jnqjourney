export type Locale = 'zh' | 'en'

export function getLocale(path = '/'): Locale {
  return /^\/en(?:\/|$)/.test(path.split(/[?#]/)[0]) ? 'en' : 'zh'
}

/** Preserve entity identity, query and fragment; only change the locale prefix. */
export function localizedPath(path: string, locale: Locale): string {
  if (!path.startsWith('/') || path.startsWith('//')) return path
  const match = path.match(/^([^?#]*)(.*)$/)!
  let pathname = match[1].replace(/^\/en(?=\/|$)/, '') || '/'
  pathname = pathname.replace(/^\/regions(?=\/|$)/, '/region')
  return (locale === 'en' ? `/en${pathname === '/' ? '' : pathname}` : pathname) + match[2]
}

export const dictionary = {
  zh: {
    home: '首页', regions: '地区', guides: '完整游记', places: '景点', search: '搜索', about: '关于我们',
    route: '旅行路线', cost: '旅行预算', itinerary: '每日行程', stay: '住宿', gallery: '图库', video: '影片',
    day: '第 {n} 天', nights: '晚', days: '天', perPerson: '每人', totalCost: '总费用',
    address: '地址', hours: '营业时间', admission: '门票', duration: '建议停留', parking: '停车',
    practical: '实用资讯', nearby: '附近景点', relatedGuides: '相关游记',
    searchPlaceholder: '搜索景点、地区和游记', noResults: '无结果', more: '查看更多', details: '查看详情',
    back: '返回', next: '下一页', previous: '上一页', playVideo: '播放影片', playJourney: '播放我的旅程',
    fallback: '英文翻译尚未完成；部分正文保留原文。', visited: '实际到访地点', reference: '参考路线',
    pending: '待确认', notes: '旅行笔记', map: '打开地图', language: '选择语言',
    intro: '一起看世界', introBody: '旅游地图、景点资料、路线攻略与旅行记录，由 JnQ Journey 持续整理。',
    historicalCost: '本次旅行历史消费，非当前报价。', summary: '旅程概览', transport: '交通',
  },
  en: {
    home: 'Home', regions: 'Regions', guides: 'Travel Guides', places: 'Places', search: 'Search', about: 'About',
    route: 'Route', cost: 'Trip Cost', itinerary: 'Daily Itinerary', stay: 'Stay', gallery: 'Gallery', video: 'Video',
    day: 'Day {n}', nights: 'Nights', days: 'Days', perPerson: 'Per Person', totalCost: 'Total Cost',
    address: 'Address', hours: 'Opening Hours', admission: 'Admission', duration: 'Recommended Duration', parking: 'Parking',
    practical: 'Practical Information', nearby: 'Nearby Places', relatedGuides: 'Related Guides',
    searchPlaceholder: 'Search places, regions and travel guides', noResults: 'No results found', more: 'View More', details: 'View Details',
    back: 'Back', next: 'Next', previous: 'Previous', playVideo: 'Play Video', playJourney: 'Play My Journey',
    fallback: 'English translation is in progress. Some content is shown in its original language.',
    visited: 'Places We Visited', reference: 'Reference Routes', pending: 'To Be Confirmed', notes: 'Travel Notes',
    map: 'Open Map', language: 'Choose language', intro: 'See the world together',
    introBody: 'Travel maps, places, routes and stories, collected along the way by JnQ Journey.',
    historicalCost: 'Historical spending from this trip, not a current quote.', summary: 'Journey Overview', transport: 'Transport',
  },
} satisfies Record<Locale, Record<string, string>>

export type UIKey = keyof typeof dictionary.zh
export function ui(locale: Locale, key: UIKey) { return dictionary[locale][key] }
