import type { GuideItinerarySegment, TravelGuide } from '@/lib/guides'
import type { GuidePriceHighlight } from '@/lib/guide-price-highlights'

export const JIANGNAN_GUIDE_DRAFT_SLUG = 'china-jiangnan-autumn-15d14n'

const segments: GuideItinerarySegment[] = [
  {
    id: 'shanghai', dayStart: 1, dayEnd: 3, dateStart: '2025-11-04', dateEnd: '2025-11-06', city: '上海', title: '上海｜City Walk 与夜景',
    summary: '抵达后以市区步行为主，资料确认了两条城市路线；路线内的精确单日边界仍以原始影片为准。',
    verifiedRoutes: [
      { title: '路线一', summary: '新天地、南京路步行街、外滩与陆家嘴一带。', linkedSpots: ['新天地', '南京路步行街', '外滩', '陆家嘴'], status: 'visited' },
      { title: '路线二', summary: '武康路、安福路、苏州河、北外滩、豫园与外滩。', linkedSpots: ['武康路', '安福路', '苏州河', '北外滩', '豫园'], status: 'visited' },
    ],
    transport: '抵达浦东后进入市区；具体接驳安排保留在原始路线记录中。',
    media: [{ label: '上海 2 天游影片' }],
  },
  {
    id: 'suzhou', dayStart: 4, dayEnd: 5, dateStart: '2025-11-07', dateEnd: '2025-11-08', city: '苏州', title: '苏州｜园林、古镇与山塘夜景',
    summary: '由上海转入苏州，已证实的行程资料保留为两条路线，不强行拆分成单日。',
    verifiedRoutes: [
      { title: '路线一', summary: '西园寺、寒山寺与枫桥、虎丘、山塘街夜景。', linkedSpots: ['西园寺', '寒山寺', '枫桥', '虎丘', '山塘街'], status: 'visited' },
      { title: '路线二', summary: '拙政园、平江路与同里古镇。', linkedSpots: ['拙政园', '平江路', '同里古镇'], status: 'visited' },
    ],
    media: [{ label: '苏州 2 天游影片' }],
  },
  {
    id: 'wuzhen', dayStart: 6, dayEnd: 6, dateStart: '2025-11-09', dateEnd: '2025-11-09', city: '乌镇', title: '乌镇｜西栅水乡',
    summary: '全程资料确认此段为 Day 6；影片中的两条本地路线不等同于全程 Day 编号。',
    verifiedRoutes: [
      { title: '路线一', summary: '进入西栅、办理住客相关流程，沿水乡夜景步行。', linkedSpots: ['乌镇西栅'], status: 'visited' },
      { title: '路线二', summary: '清晨水乡与摇橹船路线；保留影片内的本地路线顺序。', linkedSpots: ['乌镇西栅'], status: 'visited' },
    ],
    media: [{ label: '乌镇 2天1晚影片' }],
  },
  {
    id: 'hangzhou', dayStart: 7, dayEnd: 8, dateStart: '2025-11-10', dateEnd: '2025-11-11', city: '杭州', title: '杭州｜西湖漫步与城市夜景',
    summary: '两条已证实城市路线涵盖满觉陇、西湖周边、河坊街与钱江新城夜景。',
    verifiedRoutes: [
      { title: '路线一', summary: '满觉陇、城市街区与西湖夜景。', linkedSpots: ['满觉陇', '西湖'], status: 'visited' },
      { title: '路线二', summary: '太子湾、花港观鱼、曲院风荷、河坊街与钱江新城。', linkedSpots: ['太子湾公园', '花港观鱼', '曲院风荷', '河坊街', '钱江新城'], status: 'visited' },
    ],
    media: [{ label: '杭州 2天1晚影片' }],
  },
  {
    id: 'yixian', dayStart: 9, dayEnd: 11, dateStart: '2025-11-12', dateEnd: '2025-11-14', city: '宏村／黟县', title: '宏村／黟县｜古村与秋色',
    summary: '已证实到访宏村、卢村观景点与塔川入口一带；付费景区未进入。部分附近地点仅作顺路参考，不计入主行程。',
    verifiedRoutes: [
      { title: '实际到访', summary: '宏村、南湖与周边步行；卢村观景点；塔川入口区域。', linkedSpots: ['宏村', '南湖', '卢村', '塔川'], status: 'visited' },
    ],
    referenceRoutes: [{ title: '附近延伸选择', summary: '奇墅湖等资料中出现的地点，未确认实际到访，不进入路线地图。', linkedSpots: ['奇墅湖'], status: 'reference' }],
    accommodation: '黟县／宏村一带民宿（名称待后台核对）',
    media: [{ label: '皖南黟县影片' }],
  },
  {
    id: 'nanjing', dayStart: 12, dayEnd: 15, dateStart: '2025-11-15', dateEnd: '2025-11-18', city: '南京', title: '南京｜秋季城市路线',
    summary: '已确认三条影片路线和对应景点；影片内的第 1、2、3 天尚未映射为全程 Day 12–15。',
    verifiedRoutes: [
      { title: '南京路线一', summary: '牛首山与金陵小城。', linkedSpots: ['牛首山', '金陵小城'], status: 'visited' },
      { title: '南京路线二', summary: '栖霞山、中华门、夫子庙秦淮河与德基广场。', linkedSpots: ['栖霞山', '中华门', '夫子庙', '秦淮河', '德基广场'], status: 'visited' },
      { title: '南京路线三', summary: '明孝陵周边、燕雀湖、石象路与陵园路银杏大道；明孝陵未确认进入。', linkedSpots: ['燕雀湖', '石象路', '陵园路'], status: 'visited' },
    ],
    globalDayMappingStatus: 'pending', media: [{ label: '南京 3天秋季影片' }],
  },
]

export const jiangnanGuideDraft: TravelGuide = {
  slug: JIANGNAN_GUIDE_DRAFT_SLUG,
  title: '中国江南秋季游', shortTitle: '江南秋季游',
  tagline: '15 天 14 夜，上海、苏州、乌镇、杭州、宏村／黟县与南京。',
  summary: '一段按当时完整路线整理的江南秋季旅程；个别景点的精确单日顺序仍在根据原始影像资料校对。',
  duration: '15天14夜', budget: '', budgetScope: 'unspecified', travelStyle: '自由行',
  route: segments.map((item) => ({ stopLabel: `Day ${item.dayStart}${item.dayEnd > item.dayStart ? `–${item.dayEnd}` : ''}`, name: item.city, summary: item.summary })),
  coverAccent: 'bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.34),transparent_22%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.2),transparent_18%),linear-gradient(135deg,rgba(255,255,255,0.16),rgba(255,255,255,0.03))]',
  highlightTags: ['秋季', '城市漫步', '古镇', '江南'], heroBullets: ['2025年11月4日－11月18日', '6 个已证实城市区间'], budgetItems: [], days: [],
  itineraryMode: 'segment', itinerarySegments: segments,
  bestFor: ['希望按真实城市区间规划江南路线的旅客'],
  notes: ['部分城市行程按当时完整路线整理；个别景点的精确单日顺序仍在根据原始影像资料校对。'],
}

export const jiangnanPriceCandidates: GuidePriceHighlight[] = [
  {
    id: 'jiangnan-huangpu-ferry-2025', titleZh: '黄浦江轮渡', optionLabelZh: '轮渡票', displayTargetType: 'route', displayTargetId: 'shanghai-huangpu-ferry', priceCategory: 'transport', guideSlug: JIANGNAN_GUIDE_DRAFT_SLUG, dayNumber: 0,
    priceType: 'actual_paid', amountMinor: 200, currency: 'CNY', unit: 'per_person', paidDate: null, includes: ['单程轮渡'], excludes: [], sources: [{ sourceType: 'subtitle', sourceReference: '上海影片旁白字幕', context: '旁白提及票价，日期未能独立核对。' }], confidence: 'medium', evidenceStatus: 'missing', reviewStatus: 'pending', displayPriority: 10, isKeyPrice: false, lastVerifiedAt: '2026-07-29',
  },
  {
    id: 'jiangnan-suzhou-shantang-boat-2025', titleZh: '山塘街游船', optionLabelZh: '游船', displayTargetType: 'route', displayTargetId: 'suzhou-shantang-boat', priceCategory: 'activity', guideSlug: JIANGNAN_GUIDE_DRAFT_SLUG, dayNumber: 0,
    priceType: 'actual_paid', amountMinor: 5000, currency: 'CNY', unit: 'per_person', paidDate: null, includes: ['游船体验'], excludes: [], sources: [{ sourceType: 'subtitle', sourceReference: '苏州影片旁白字幕', context: '旁白提及金额，精确日期待核对。' }], confidence: 'medium', evidenceStatus: 'missing', reviewStatus: 'pending', displayPriority: 20, isKeyPrice: false, lastVerifiedAt: '2026-07-29',
  },
  {
    id: 'jiangnan-xiuli-ticket-2025', titleZh: '秀里水镇', optionLabelZh: '门票＋游船', displayTargetType: 'attraction', displayTargetId: 'xiuli-water-town', attractionSlug: 'xiuli-water-town', priceCategory: 'package', guideSlug: JIANGNAN_GUIDE_DRAFT_SLUG, dayNumber: 0,
    priceType: 'listed_at_the_time', amountMinor: 3000, currency: 'CNY', unit: 'per_person', paidDate: null, includes: ['门票', '游船'], excludes: [], sources: [{ sourceType: 'subtitle', sourceReference: '皖南黟县影片旁白字幕', context: '字幕提及票种金额；实际是否购买与日期待确认。' }], confidence: 'medium', evidenceStatus: 'missing', reviewStatus: 'pending', displayPriority: 30, isKeyPrice: false, lastVerifiedAt: '2026-07-29',
  },
]
