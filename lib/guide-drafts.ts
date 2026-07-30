import type { GuideItinerarySegment, TravelGuide } from '@/lib/guides'
import type { GuidePriceHighlight } from '@/lib/guide-price-highlights'

export const JIANGNAN_GUIDE_DRAFT_SLUG = 'china-jiangnan-autumn-15d14n'

const segments: GuideItinerarySegment[] = [
  {
    id: 'shanghai', dayStart: 1, dayEnd: 3, dateStart: '2025-11-04', dateEnd: '2025-11-06', city: '上海', title: '上海｜City Walk 与夜景',
    summary: '抵达后的三天以上海市区步行与夜景为主。',
    verifiedRoutes: [
      { title: 'Day 1 · 抵达上海', summary: '抵达浦东后进入市区，安顿住宿。', linkedSpots: [], status: 'visited' },
      { title: 'Day 2 · 上海 City Walk', summary: '新天地、南京路步行街、外滩与陆家嘴一带。', linkedSpots: ['新天地', '南京路步行街', '外滩', '陆家嘴'], status: 'visited' },
      { title: 'Day 3 · 梧桐街区与夜景', summary: '武康路、安福路、苏州河、北外滩与豫园。', linkedSpots: ['武康路', '安福路', '苏州河', '北外滩', '豫园'], status: 'visited' },
    ],
    transport: '抵达浦东后进入市区；具体接驳安排保留在原始路线记录中。',
    accommodation: '唯庭世纪酒店（静安区；店名写法待核对）',
    practicalTips: ['凌晨抵达时地铁与磁悬浮已停运；先查守航夜宵线，再决定是否叫车。', '秋冬约 5–6 点转暗；下雨时可改为室内咖啡馆与北外滩。'],
    actualExperiences: ['金陵东路渡口二楼露台适合看浦江两岸。', '武康路秋季梧桐与桂花适合慢走；北外滩与豫园夜景为不同视角。'],
    pendingItems: ['浦东美术馆与部分店铺的精确到访顺序尚待影像时间轴核对。'],
    priceCandidateIds: ['jiangnan-night-airport-bus-2025', 'jiangnan-huangpu-ferry-2025'], imageMatches: [{ level: 'route', label: '上海 City Walk 影片素材', note: '可用于城市区间，不作为单一景点主图。' }], media: [{ label: '上海 2 天游影片', url: 'https://youtu.be/jJhW7qUQFi4' }],
  },
  {
    id: 'suzhou', dayStart: 4, dayEnd: 5, dateStart: '2025-11-07', dateEnd: '2025-11-08', city: '苏州', title: '苏州｜园林、古镇与山塘夜景',
    summary: '由上海转入苏州，园林、古镇与山塘夜景分别安排在两天。',
    verifiedRoutes: [
      { title: 'Day 4 · 上海→苏州与山塘夜景', summary: '西园寺、寒山寺与枫桥、虎丘、山塘街夜景。', linkedSpots: ['西园寺', '寒山寺', '枫桥', '虎丘', '山塘街'], status: 'visited' },
      { title: 'Day 5 · 园林与同里古镇', summary: '拙政园、平江路与同里古镇。', linkedSpots: ['拙政园', '平江路', '同里古镇'], status: 'visited' },
    ],
    accommodation: '市区住宿与同里古镇住宿各一处；两处名称写法均待核对。',
    practicalTips: ['拙政园宜 07:30 入园避开旅行团。', '山塘街夜间沿河通道窄，人多时容易拥挤；同里免票进街区时段不含内部园林。'],
    actualExperiences: ['上海站至苏州站高铁约 30 分钟，出站南广场可见平门。', '李鸿章码头画舫连接虎丘与山塘夜景路线。'],
    pendingItems: ['退思园属于同里隔天早晨路线，尚未映射为全程精确 Day。'],
    priceCandidateIds: ['jiangnan-suzhou-hsr-2025', 'jiangnan-xiyuan-admission-2025', 'jiangnan-shantang-boat-2025', 'jiangnan-tongli-pass-2025'], imageMatches: [{ level: 'route', label: '苏州园林与山塘影片素材' }], media: [{ label: '苏州 2 天游影片', url: 'https://youtu.be/GSe6a93xPTE' }],
  },
  {
    id: 'wuzhen', dayStart: 6, dayEnd: 6, dateStart: '2025-11-09', dateEnd: '2025-11-09', city: '乌镇', title: '乌镇｜西栅水乡',
    summary: 'Day 6 在乌镇西栅办理入住、沿水乡步行，并安排清晨水乡体验。',
    verifiedRoutes: [
      { title: 'Day 6 · 乌镇西栅', summary: '进入西栅、办理住客流程，沿水乡夜景步行；清晨继续水乡与摇橹船路线。', linkedSpots: ['乌镇西栅'], status: 'visited' },
    ],
    accommodation: '乌镇西栅民宿 18 号（临水房型；价格未确认）',
    practicalTips: ['住客应提前一天预约早茶客；名额有限，9 点前适合拍无人古镇。', '夜景整体偏暗，摇橹船无灯，拍摄需预留夜拍能力。'],
    actualExperiences: ['景区统一办理入住、行李托运与住客观光车衔接。', '灵水居水幕秀约每 10 分钟循环；退房前先寄行李可继续游览。'],
    pendingItems: ['住宿、门票与同里至乌镇交通金额未找到可靠实际记录。'],
    priceCandidateIds: ['jiangnan-wuzhen-early-tea-credit-2025', 'jiangnan-wuzhen-rowboat-2025', 'jiangnan-wuzhen-tea-snacks-2025'], imageMatches: [{ level: 'route', label: '乌镇古镇、摇橹船与早茶客素材' }], media: [{ label: '乌镇 2天1晚影片' }],
  },
  {
    id: 'hangzhou', dayStart: 7, dayEnd: 8, dateStart: '2025-11-10', dateEnd: '2025-11-11', city: '杭州', title: '杭州｜西湖漫步与城市夜景',
    summary: '两条已证实城市路线涵盖满觉陇、西湖周边、河坊街与钱江新城夜景。',
    verifiedRoutes: [
      { title: 'Day 7 · 满觉陇与西湖夜景', summary: '满觉陇、城市街区与西湖夜景。', linkedSpots: ['满觉陇', '西湖'], status: 'visited' },
      { title: 'Day 8 · 西湖西线与钱江新城', summary: '太子湾、花港观鱼、曲院风荷、河坊街与钱江新城。', linkedSpots: ['太子湾公园', '花港观鱼', '曲院风荷', '河坊街', '钱江新城'], status: 'visited' },
    ],
    accommodation: '祺悦西湖文化酒店（杭州湖滨银泰 in77 店；名称与细节待核对）',
    practicalTips: ['桂花花期影响满觉陇体验；本次到访时大部分桂花已落。', '断桥人多时可在孤山公园乘 1314 路离开；不虚构票价。', '灯光秀和无人机属于当晚／时效活动，公开前需要复查。'],
    actualExperiences: ['西湖西线相对安静，包含太子湾、花港观鱼、浴鹄湾与乌龟潭。', '钱江新城当晚确有灯光秀与无人机表演，但不可写成每日固定节目。'],
    priceCandidateIds: ['jiangnan-hangzhou-cat-cafe-2025', 'jiangnan-hangzhou-dinner-2025'], imageMatches: [{ level: 'route', label: '杭州西湖与城市夜景影片素材' }], media: [{ label: '杭州 2天1晚影片', url: 'https://youtu.be/j9HJpuuYovg' }],
  },
  {
    id: 'yixian', dayStart: 9, dayEnd: 11, dateStart: '2025-11-12', dateEnd: '2025-11-14', city: '宏村／黟县', title: '宏村／黟县｜古村与秋色',
    summary: '已证实到访宏村、卢村观景点与塔川入口一带；付费景区未进入。部分附近地点仅作顺路参考，不计入主行程。',
    verifiedRoutes: [
      { title: 'Day 9 · 杭州→黟县', summary: '转往黟县并办理入住。', linkedSpots: [], status: 'visited' },
      { title: 'Day 10 · 宏村与卢村', summary: '宏村、南湖与周边步行；卢村观景点。', linkedSpots: ['宏村', '南湖', '卢村'], status: 'visited' },
      { title: 'Day 11 · 塔川入口与古村秋色', summary: '塔川入口区域与周边慢行。', linkedSpots: ['塔川'], status: 'visited' },
    ],
    referenceRoutes: [{ title: '附近延伸选择', summary: '奇墅湖等资料中出现的地点，未确认实际到访，不进入路线地图。', linkedSpots: ['奇墅湖'], status: 'reference' }],
    accommodation: '有巢别院（住三天；英文名待核对）',
    practicalTips: ['宏村入口每次进村需重新检票；提前联系客栈接送。', '卢村观景台需早起，但上山会拥堵；不保证晨雾。', '塔川本次只到入口与外围，未进入收费景区。'],
    actualExperiences: ['宏村外围稻田、南湖与月沼夜景是主要拍摄内容。', '秀里游船河道较小、绕一圈返回，体验较单一；当晚鱼灯表演未观看。'],
    pendingItems: ['奇墅湖为晨雾推荐而非已确认到访；秀里各票种的实际购买状态待核对。'],
    priceCandidateIds: ['jiangnan-yixian-hsr-2025', 'jiangnan-hongcun-bus-2025', 'jiangnan-xiuli-ticket-2025', 'jiangnan-xiuli-boat-2025'], imageMatches: [{ level: 'route', label: '宏村、塔川、卢村、碧山与秀里影片素材' }], media: [{ label: '皖南黟县影片' }],
  },
  {
    id: 'nanjing', dayStart: 12, dayEnd: 15, dateStart: '2025-11-15', dateEnd: '2025-11-18', city: '南京', title: '南京｜秋季城市路线',
    summary: '由黟县转入南京后，依次完成牛首山、秋色与明孝陵周边三条城市路线。',
    verifiedRoutes: [
      { title: 'Day 12 · 黟县→南京', summary: '由黟县东前往南京南，入住新街口一带。', linkedSpots: [], status: 'visited' },
      { title: 'Day 13 · 牛首山与金陵小城', summary: '牛首山与金陵小城。', linkedSpots: ['牛首山', '金陵小城'], status: 'visited' },
      { title: 'Day 14 · 栖霞山与秦淮夜游', summary: '栖霞山、中华门、夫子庙秦淮河与德基广场。', linkedSpots: ['栖霞山', '中华门', '夫子庙', '秦淮河', '德基广场'], status: 'visited' },
      { title: 'Day 15 · 明孝陵周边秋色', summary: '明孝陵周边、燕雀湖、石象路与陵园路银杏大道；明孝陵未确认进入。', linkedSpots: ['燕雀湖', '石象路', '陵园路'], status: 'visited' },
    ],
    accommodation: '新街口古南都弘嘉逸居酒店（名称与价格待核对）',
    practicalTips: ['栖霞山秋色受花期影响；字幕记录 11 月中旬尚未全红。', '明孝陵当天接近 0 度且风大，未继续进入游览。', '门票与夜游场次均为时效信息，公开前必须复查。'],
    actualExperiences: ['牛首山接驳车约 10 分钟；金陵小城的演出场次按当天安排。', '南京路线三仅记录明孝陵周边、燕雀湖与陵园路，不代表完整游览明孝陵。'],
    pendingItems: ['三条影片路线的全程 Day 映射、住宿正式名称与价格、秦淮游船体验状态仍待确认。'],
    priceCandidateIds: ['jiangnan-nanjing-hsr-2025', 'jiangnan-jinling-town-2025', 'jiangnan-qixia-admission-2025', 'jiangnan-zhonghua-gate-night-2025'], imageMatches: [], globalDayMappingStatus: 'pending', media: [{ label: '南京 3天秋季影片' }],
  },
]

export const jiangnanGuideDraft: TravelGuide = {
  slug: JIANGNAN_GUIDE_DRAFT_SLUG,
  tripStartDate: '2025-11-04', tripEndDate: '2025-11-18',
  title: '中国江南秋季游', shortTitle: '江南秋季游',
  tagline: '15 天 14 夜，上海、苏州、乌镇、杭州、宏村／黟县与南京。',
  summary: '从上海一路南下，经苏州、乌镇、杭州与皖南，最后在南京收尾的秋季旅程。',
  duration: '15天14夜', budget: '', budgetScope: 'unspecified', travelStyle: '自由行',
  route: segments.map((item) => ({ stopLabel: `Day ${item.dayStart}${item.dayEnd > item.dayStart ? `–${item.dayEnd}` : ''}`, name: item.city, summary: item.summary })),
  coverAccent: 'bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.34),transparent_22%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.2),transparent_18%),linear-gradient(135deg,rgba(255,255,255,0.16),rgba(255,255,255,0.03))]',
  highlightTags: ['秋季', '城市漫步', '古镇', '江南'], heroBullets: ['2025年11月4日－11月18日', '6 个已证实城市区间'], budgetItems: [], days: [],
  itineraryMode: 'segment', itinerarySegments: segments,
  bestFor: ['希望按真实城市区间规划江南路线的旅客'],
  notes: ['秋季天气、花期与景区活动会影响当天体验。'],
}

function pendingPriceCandidate(input: Pick<GuidePriceHighlight, 'id' | 'titleZh' | 'optionLabelZh' | 'displayTargetType' | 'displayTargetId' | 'attractionSlug' | 'priceCategory' | 'amountMinor' | 'currency' | 'unit' | 'includes' | 'priceType' | 'sources' | 'confidence'>): GuidePriceHighlight {
  return { ...input, guideSlug: JIANGNAN_GUIDE_DRAFT_SLUG, dayNumber: 0, paidDate: null, excludes: [], evidenceStatus: 'missing', reviewStatus: 'pending', displayPriority: 100, isKeyPrice: false, lastVerifiedAt: '2026-07-29' }
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
  pendingPriceCandidate({ id: 'jiangnan-night-airport-bus-2025', titleZh: '浦东机场守航夜宵线', optionLabelZh: '机场巴士', displayTargetType: 'route', displayTargetId: 'pudong-airport-to-jingan', priceCategory: 'transport', amountMinor: 2400, currency: 'CNY', unit: 'per_person', includes: ['机场至静安寺一带'], priceType: 'listed_at_the_time', confidence: 'medium', sources: [{ sourceType: 'video_script', sourceReference: '上海 City Walk 攻略', context: '正文记录本次乘坐；金额为约价，缺精确订单日期。' }] }),
  pendingPriceCandidate({ id: 'jiangnan-suzhou-hsr-2025', titleZh: '上海至苏州高铁', optionLabelZh: '二等座', displayTargetType: 'route', displayTargetId: 'shanghai-to-suzhou', priceCategory: 'transport', amountMinor: 3500, currency: 'CNY', unit: 'per_person', includes: ['上海站至苏州站'], priceType: 'listed_at_the_time', confidence: 'low', sources: [{ sourceType: 'video_script', sourceReference: '苏州影片攻略提炼', context: 'AI 提供参考价；字幕只确认约 30 分钟。' }] }),
  pendingPriceCandidate({ id: 'jiangnan-xiyuan-admission-2025', titleZh: '西园寺', optionLabelZh: '门票', displayTargetType: 'attraction', displayTargetId: 'xiyuan-temple', attractionSlug: 'xiyuan-temple', priceCategory: 'admission', amountMinor: 500, currency: 'CNY', unit: 'per_person', includes: ['入园'], priceType: 'listed_at_the_time', confidence: 'low', sources: [{ sourceType: 'video_script', sourceReference: '苏州 City Walk 攻略', context: '攻略记录金额，实际支付日期待核对。' }] }),
  pendingPriceCandidate({ id: 'jiangnan-tongli-pass-2025', titleZh: '同里古镇', optionLabelZh: '古镇联票', displayTargetType: 'attraction', displayTargetId: 'tongli-water-town', attractionSlug: 'tongli-water-town', priceCategory: 'admission', amountMinor: 6000, currency: 'CNY', unit: 'per_person', includes: ['镇内小景点'], priceType: 'listed_at_the_time', confidence: 'low', sources: [{ sourceType: 'video_script', sourceReference: '苏州 City Walk 攻略', context: '攻略记录金额；是否实际购买与日期待核对。' }] }),
  pendingPriceCandidate({ id: 'jiangnan-wuzhen-early-tea-credit-2025', titleZh: '乌镇早茶客', optionLabelZh: '预约消费额度', displayTargetType: 'route', displayTargetId: 'wuzhen-early-tea', priceCategory: 'food', amountMinor: 3000, currency: 'CNY', unit: 'per_person', includes: ['预约消费额度'], priceType: 'listed_at_the_time', confidence: 'medium', sources: [{ sourceType: 'subtitle', sourceReference: '乌镇影片旁白字幕', context: '字幕确认预约与额度，实际是否使用待核对。' }] }),
  pendingPriceCandidate({ id: 'jiangnan-wuzhen-rowboat-2025', titleZh: '乌镇摇橹船', optionLabelZh: '安渡坊至如意桥', displayTargetType: 'route', displayTargetId: 'wuzhen-rowboat', priceCategory: 'activity', amountMinor: 6000, currency: 'CNY', unit: 'per_person', includes: ['约 30 分钟水路'], priceType: 'listed_at_the_time', confidence: 'low', sources: [{ sourceType: 'video_script', sourceReference: '乌镇影片攻略提炼', context: 'AI 金额；字幕仅确认航程。' }] }),
  pendingPriceCandidate({ id: 'jiangnan-wuzhen-tea-snacks-2025', titleZh: '乌镇书场茶点', optionLabelZh: '茶点套餐', displayTargetType: 'attraction', displayTargetId: 'wuzhen-storytelling-venue', attractionSlug: 'wuzhen-storytelling-venue', priceCategory: 'food', amountMinor: 12800, currency: 'CNY', unit: 'package', includes: ['茶点套餐'], priceType: 'listed_at_the_time', confidence: 'low', sources: [{ sourceType: 'video_script', sourceReference: '乌镇影片攻略提炼', context: 'AI 金额；字幕仅确认点了茶点。' }] }),
  pendingPriceCandidate({ id: 'jiangnan-hangzhou-cat-cafe-2025', titleZh: '猫猫寺', optionLabelZh: '内部艺术商店区门票', displayTargetType: 'attraction', displayTargetId: 'miaosy-cat-cafe', attractionSlug: 'miaosy-cat-cafe', priceCategory: 'activity', amountMinor: 6800, currency: 'CNY', unit: 'per_person', includes: ['内部区域'], priceType: 'listed_at_the_time', confidence: 'low', sources: [{ sourceType: 'video_script', sourceReference: '杭州影片攻略提炼', context: 'AI 金额，项目性质与实际购买待核对。' }] }),
  pendingPriceCandidate({ id: 'jiangnan-hangzhou-dinner-2025', titleZh: '杭州城市晚餐', optionLabelZh: '叫花鸡套餐', displayTargetType: 'day', displayTargetId: 'hangzhou-segment', priceCategory: 'food', amountMinor: 8400, currency: 'CNY', unit: 'package', includes: ['套餐'], priceType: 'listed_at_the_time', confidence: 'low', sources: [{ sourceType: 'video_script', sourceReference: '杭州影片攻略提炼', context: 'AI 金额，精确消费日期待核对。' }] }),
  pendingPriceCandidate({ id: 'jiangnan-yixian-hsr-2025', titleZh: '杭州西至黟县东高铁', optionLabelZh: '二等座', displayTargetType: 'route', displayTargetId: 'hangzhou-to-yixian', priceCategory: 'transport', amountMinor: 11900, currency: 'CNY', unit: 'per_person', includes: ['杭州西至黟县东'], priceType: 'listed_at_the_time', confidence: 'low', sources: [{ sourceType: 'video_script', sourceReference: '皖南黟县影片攻略提炼', context: 'AI 参考价；字幕仅确认时长。' }] }),
  pendingPriceCandidate({ id: 'jiangnan-hongcun-bus-2025', titleZh: '黟县东至宏村巴士', optionLabelZh: '巴士', displayTargetType: 'route', displayTargetId: 'yixian-to-hongcun', priceCategory: 'transport', amountMinor: 1300, currency: 'CNY', unit: 'per_person', includes: ['黟县东至宏村'], priceType: 'listed_at_the_time', confidence: 'low', sources: [{ sourceType: 'video_script', sourceReference: '皖南黟县影片攻略提炼', context: 'AI 参考价；字幕仅确认约 30 分钟。' }] }),
  pendingPriceCandidate({ id: 'jiangnan-xiuli-boat-2025', titleZh: '秀里水镇', optionLabelZh: '单船', displayTargetType: 'attraction', displayTargetId: 'xiuli-water-town', attractionSlug: 'xiuli-water-town', priceCategory: 'activity', amountMinor: 2500, currency: 'CNY', unit: 'per_person', includes: ['游船'], priceType: 'listed_at_the_time', confidence: 'medium', sources: [{ sourceType: 'subtitle', sourceReference: '皖南黟县影片旁白字幕', context: '字幕记录票种金额；实际购买状态待核对。' }] }),
  pendingPriceCandidate({ id: 'jiangnan-nanjing-hsr-2025', titleZh: '黟县东至南京南高铁', optionLabelZh: '二等座', displayTargetType: 'route', displayTargetId: 'yixian-to-nanjing', priceCategory: 'transport', amountMinor: 14500, currency: 'CNY', unit: 'per_person', includes: ['黟县东至南京南'], priceType: 'listed_at_the_time', confidence: 'low', sources: [{ sourceType: 'video_script', sourceReference: '南京影片攻略提炼', context: 'AI 参考价；字幕仅确认约 2.5 小时。' }] }),
  pendingPriceCandidate({ id: 'jiangnan-jinling-town-2025', titleZh: '金陵小城', optionLabelZh: '成人票', displayTargetType: 'attraction', displayTargetId: 'jinling-town', attractionSlug: 'jinling-town', priceCategory: 'admission', amountMinor: 5000, currency: 'CNY', unit: 'per_person', includes: ['入园'], priceType: 'listed_at_the_time', confidence: 'medium', sources: [{ sourceType: 'subtitle', sourceReference: '南京影片旁白字幕', context: '字幕记录成人票；精确日期待核对。' }] }),
  pendingPriceCandidate({ id: 'jiangnan-qixia-admission-2025', titleZh: '栖霞山', optionLabelZh: '7 点后门票', displayTargetType: 'attraction', displayTargetId: 'qixia-mountain', attractionSlug: 'qixia-mountain', priceCategory: 'admission', amountMinor: 8000, currency: 'CNY', unit: 'per_person', includes: ['入园'], priceType: 'listed_at_the_time', confidence: 'medium', sources: [{ sourceType: 'subtitle', sourceReference: '南京影片旁白字幕', context: '时效规则，实际支付与日期待核对。' }] }),
  pendingPriceCandidate({ id: 'jiangnan-zhonghua-gate-night-2025', titleZh: '中华门', optionLabelZh: '夜游含演出', displayTargetType: 'attraction', displayTargetId: 'zhonghua-gate', attractionSlug: 'zhonghua-gate', priceCategory: 'package', amountMinor: 9000, currency: 'CNY', unit: 'per_person', includes: ['夜游', '演出'], priceType: 'listed_at_the_time', confidence: 'medium', sources: [{ sourceType: 'subtitle', sourceReference: '南京影片旁白字幕', context: '时效资讯，实际购买状态待核对。' }] }),
]
