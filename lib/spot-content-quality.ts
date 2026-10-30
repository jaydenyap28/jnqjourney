import { parsePriceInfo } from './price-utils.ts'
import { formatOpeningHoursDisplay } from './opening-hours.ts'

/** Editorial suggestions only: never invent facts or change stored data. */
export function cleanSpotEditorialDraft(value: string) {
  const seen = new Set<string>()
  let fenced = false
  return value.replace(/\r\n?/g, '\n').split(/\n[\t ]*\n/).filter(block => {
    const text = block.trim()
    const code = fenced || /^(?:```|~~~)/m.test(text)
    if ((text.match(/^```|^~~~/gm) || []).length % 2) fenced = !fenced
    if (code || /^(?:!\[|>|#{1,6}\s+[^\n]+$)/.test(text)) return true
    if (/^(?:好的[，,！!。]?\s*)?(?:以下是|下面是)(?:为你|我为你)整理的(?:景点)?(?:介绍|文案|内容)[：:]$/.test(text) || /^Here is the (?:revised|updated) (?:description|copy)(?: you requested)?:$/i.test(text)) return false
    if (!text) return false
    if (seen.has(text)) return false
    seen.add(text)
    return true
  }).join('\n\n').trim()
}

export function spotContentIssues(value?: string | null, category = 'attraction') {
  const text = String(value || '')
  const issues: string[] = []
  if (!text.trim()) issues.push('缺少景点介绍')
  else if (text.replace(/\s/g, '').length < contentCategory(category).reviewBelow) issues.push('介绍较短，请核对是否缺少已有资料；不要为了字数编造内容')
  if (/作为(?:一个|一名)?(?:AI|人工智能)|as an AI|希望以上.*(?:帮助|帮到)|如果你需要.*(?:修改|补充)/i.test(text)) issues.push('疑似 AI 对话残留，请逐段核对')
  if (cleanSpotEditorialDraft(text) !== text.replace(/\r\n?/g, '\n').trim()) issues.push('可预览移除完全重复段落或明确的对话包装')
  const headings = [...text.matchAll(/^\s*#{1,4}\s+(.+)$/gm)].map(match => match[1].replace(/\s+#+\s*$/, '').replace(/[*_`]/g, '').trim().toLowerCase())
  if (new Set(headings).size !== headings.length) issues.push('存在重复章节标题，请保留各段独有资料后整理')
  if (/\\n/.test(text)) issues.push('含字面量换行符，请确认格式后处理')
  if (/[\u3400-\u9fff]/.test(text) && (text.match(/\b[a-zA-Z]{3,}\b/g) || []).length > 45) issues.push('中英文段落混用，请核对语言；专有名词无需翻译')
  return issues
}

export function contentCategory(category?: string | null) {
  if (/^(accommodation|hotel|stay)$/.test(category || '')) return { label: '住宿', reviewBelow: 120, guidance: '核对已有住宿位置、房型与入住资料；不补写未经证实的入住体验。' }
  if (/^(cafe|coffee)$/.test(category || '')) return { label: '咖啡馆', reviewBelow: 60, guidance: '简洁说明特色即可，品牌名与饮品英文可保留。' }
  if (/^(food|restaurant)$/.test(category || '')) return { label: '餐饮', reviewBelow: 80, guidance: '核对已有菜品与环境资料；短餐饮记录也可以完整。' }
  if (category === 'attraction') return { label: '景点', reviewBelow: 160, guidance: '核对已有看点与游览资料；不以字数代替质量判断。' }
  return { label: '其他地点', reviewBelow: 80, guidance: '按地点用途人工判断，短文不代表低质量。' }
}

export type SpotQualityInput = {
  category?: string | null; description?: string | null; review?: string | null
  name?: string | null; name_cn?: string | null; tags?: string[] | null
  seo_title_zh?: string | null; seo_description_zh?: string | null
  price_info?: unknown; opening_hours?: string | null; image_url?: string | null; images?: string[] | null
}
export function spotEditorialCategory(spot: SpotQualityInput) {
  return spot.category === 'food' && /(?:\bcaf[eé]\b|\bcoffee\b|咖啡)/i.test([spot.name, spot.name_cn, ...(spot.tags || [])].join(' ')) ? 'cafe' : spot.category || ''
}
export type SpotQualityCode = 'missing' | 'short' | 'duplicate' | 'ai' | 'language' | 'link' | 'format' | 'seo' | 'verification' | 'conflict' | 'media'
export function assessSpotContent(spot: SpotQualityInput) {
  const text = String(spot.description ?? spot.review ?? '')
  const issues: Array<{ code: SpotQualityCode; level: 'error' | 'review' | 'info'; message: string }> = []
  const add = (code: SpotQualityCode, level: 'error' | 'review' | 'info', message: string) => issues.push({ code, level, message })
  const category = spotEditorialCategory(spot)
  for (const message of spotContentIssues(text, category)) {
    if (message.startsWith('缺少')) add('missing', 'error', message)
    else if (message.startsWith('介绍较短')) add('short', 'info', message)
    else if (message.includes('AI')) add('ai', 'review', message)
    else if (message.includes('重复') || message.includes('清理')) add('duplicate', 'review', message)
    else if (message.includes('中英文')) add('language', 'review', message)
    else add('format', 'review', message)
  }
  if (/[\u3400-\u9fff]/.test(text) && /(?:^|\n)\s*(?:[A-Za-z][A-Za-z'-]*[ ,]+){11,}[A-Za-z][^\n]*[.!?]/m.test(text) && !issues.some(i => i.code === 'language')) add('language', 'review', '疑似夹有完整英文段落；请人工区分译文与专有名词')
  const links = [...text.matchAll(/\]\(([^\s)]+)[^)]*\)|https?:\/\/[^\s<>\])]+/g)].map(m => m[1] || m[0])
  if (links.some(link => {
    if (link.startsWith('/') && !link.startsWith('//') || link.startsWith('#')) return false
    try { const url = new URL(link); return !['https:', 'http:'].includes(url.protocol) || Boolean(url.username || url.password) || /^(?:example\.(?:com|org)|localhost)$/.test(url.hostname) || /(?:YOUR_|PLACEHOLDER|INSERT_|REPLACE_)/i.test(link) } catch { return true }
  })) add('link', 'review', '链接含无效格式、示例域名或占位内容；这里只做静态检查，不判断远端可用性')
  const titles = [spot.name,spot.name_cn].filter(Boolean).map(name=>String(name).trim().toLowerCase())
  if ([...text.matchAll(/^\s*#{1,4}\s+(.+)$/gm)].some(match=>titles.includes(match[1].replace(/\s+#+\s*$/, '').trim().toLowerCase()))) add('duplicate', 'review', '正文标题与景点名称重复；核对是否需要章节标题，勿自动删去独有资料')
  const price = parsePriceInfo(spot.price_info)
  const hasAdmission = [price.admissionAdult,price.admissionChild,price.admissionLocalAdult,price.admissionLocalChild,price.admissionForeignAdult,price.admissionForeignChild].some(value=>Number(value.replace(/,/g,'').match(/\d+(?:\.\d+)?/)?.[0]) > 0)
  const hasAmounts = hasAdmission || price.isFree || Boolean(price.mealBudget || price.accommodationBudget || price.parkingBudget || price.transportBudget || price.customItems.length)
  if (hasAmounts && !/^\d{4}-\d{2}-\d{2}$/.test(price.lastCheckedAt)) add('verification', 'review', '票价或费用缺少有效核实日期；复用 Column Info 的核实日期与来源，不以访问日期替代')
  if (hasAmounts && !price.priceSource) add('verification', 'review', '票价或费用缺少来源；请在现有 Column Info 来源字段补证')
  const hours = formatOpeningHoursDisplay(spot.opening_hours)
  if (hours.visible && !/(?:核实|核验|確認|checked|verified)[^\n]{0,24}\d{4}[-/]\d{2}[-/]\d{2}/i.test(`${text}\n${hours.remarks}`)) add('verification', 'info', '开放信息未见核实日期；核实后在现有正文或营业备注记录日期，费用日期不代表开放时间已核实')
  if (hasAdmission && (price.isFree || /(?:门票|入场|入园|admission)\s*(?:[：:]|为|is)?\s*(?:免费|free)/i.test(text))) add('conflict', 'review', '免费入场文字与结构化收费并存；核对免费区域、付费票种及适用人群，不自动覆盖')
  const bodyHours = text.match(/(?:开放时间|营业时间|opening hours)\s*[：:]\s*(\d{1,2}:\d{2})\s*[-–~至]\s*(\d{1,2}:\d{2})/i)
  if (bodyHours && hours.visible && hours.primary.match(/\d{1,2}:\d{2}/g)?.slice(0,2).join('-') !== bodyHours.slice(1).join('-')) add('conflict', 'review', '正文开放时段与结构化营业时间不同；核对季节、日期和适用范围')
  const media = [spot.image_url,...(spot.images || []),...price.infoImages].filter(Boolean)
  if (media.some(value=>{ try {const url=new URL(String(value));return !['https:','http:'].includes(url.protocol)||Boolean(url.username||url.password)||/^(?:example\.(?:com|org)|localhost)$/.test(url.hostname)} catch {return true} })) add('media','review','图片地址含无效格式或示例域名；远端状态需单独核实，不自动删除')
  const seoKnown = 'seo_title_zh' in spot && 'seo_description_zh' in spot
  if (seoKnown && (!spot.seo_title_zh?.trim() || !spot.seo_description_zh?.trim())) add('seo', 'info', '独立中文 SEO 字段未齐；公开页仍使用现有 fallback，请按搜索价值决定是否补充')
  const grade = issues.some(i => i.level === 'error') ? 'missing' : issues.some(i => i.level === 'review') ? 'review' : issues.length ? 'suggestion' : 'ready'
  return { issues, grade, seoKnown, category: contentCategory(category), characters: text.replace(/\s/g, '').length }
}
