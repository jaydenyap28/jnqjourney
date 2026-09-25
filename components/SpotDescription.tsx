import InlineMarkdown from './InlineMarkdown'
import { parseSpotDescription, type SpotDescriptionBlock } from '@/lib/spot-description'

const sectionMeta: Record<string, { title: string; eyebrow: string }> = {
  '介绍': { title: '介绍', eyebrow: 'Overview' },
  '必看亮点': { title: '看点', eyebrow: 'Highlights' },
  '看点': { title: '看点', eyebrow: 'Highlights' },
  '住宿亮点': { title: '住宿亮点', eyebrow: 'Stay highlights' },
  '值得看什么': { title: '值得看什么', eyebrow: 'Highlights' },
  '吃什么': { title: '吃什么', eyebrow: 'What to order' },
  '什么时候去最好': { title: '什么时候去', eyebrow: 'When to go' },
  '什么时候去': { title: '什么时候去', eyebrow: 'When to go' },
  '建议怎么玩': { title: '怎么安排', eyebrow: 'Plan your visit' },
  '建议怎么吃': { title: '用餐建议', eyebrow: 'Dining notes' },
  '适合怎么住': { title: '住宿建议', eyebrow: 'Stay notes' },
  '怎么安排': { title: '怎么安排', eyebrow: 'Plan your visit' },
  '用餐建议': { title: '用餐建议', eyebrow: 'Dining notes' },
  '住宿建议': { title: '住宿建议', eyebrow: 'Stay notes' },
  '怎么去': { title: '交通与到达', eyebrow: 'Getting there' },
  '交通与到达': { title: '交通与到达', eyebrow: 'Getting there' },
  'JnQ 小提醒': { title: 'JnQ 提醒', eyebrow: 'Good to know' },
  'JnQ 提醒': { title: 'JnQ 提醒', eyebrow: 'Good to know' },
}

const lowValueLines = new Set([
  '可按当天路线灵活安排',
  '可根据自己的行程节奏安排停留',
  '可按页面地址与地图导航前往',
  '可根据页面地图位置规划前往路线',
  '可结合页面照片与自己的兴趣判断是否安排停留',
  '可结合页面照片与自己的住宿需求判断是否适合',
  '可结合页面照片与自己的用餐偏好决定',
  '可按当天路线与用餐安排灵活决定',
  '可根据同行人数与当天行程节奏安排',
  '可按当天路线与入住计划灵活安排',
  '可根据自己的住宿需求与行程节奏安排',
  '行程安排可保留弹性，出发前再确认页面中的地址与开放资讯',
  '出发前可再确认地址与开放时间是否有临时调整',
])

function cleanHeading(value: string) {
  return value.replace(/^[^\p{L}\p{N}]+/u, '').trim()
}

function normalizeLine(value: string) {
  return value
    .replace(/^[-*]\s+/, '')
    .replace(/[。.!！?？]+$/u, '')
    .replace(/\s+/g, '')
    .trim()
}

function isLowValueBlock(block: SpotDescriptionBlock) {
  if (block.type !== 'p') return false
  const lines = block.content.split('\n').map((line) => normalizeLine(line)).filter(Boolean)
  return lines.length > 0 && lines.every((line) => lowValueLines.has(line))
}

function normalizeComparable(value: string) {
  return value
    .replace(/\*\*/g, '')
    .replace(/\`/g, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/[\s，,。.!！?？；;：:]/g, '')
    .trim()
    .toLowerCase()
}

function isRedundantTransportSection(section: Section, address?: string | null) {
  if (!address?.trim()) return false
  if (!section.heading || !['怎么去', '交通与到达'].includes(section.heading)) return false
  if (section.blocks.some((block) => block.type === 'h3' || block.type === 'h4')) return false

  const content = section.blocks
    .map((block) => block.content)
    .join('\n')
    .replace(/可按(?:页面)?地址与地图导航前往[。.]?/g, '')
    .replace(/可按(?:页面)?地图(?:定位|导航)?前往[。.]?/g, '')
    .replace(/^(?:地址|地点)?位于[：:]?\s*/u, '')
    .replace(/^地址[：:]\s*/u, '')
    .trim()

  return normalizeComparable(content) === normalizeComparable(address)
}

type Section = {
  heading: string | null
  blocks: SpotDescriptionBlock[]
}

function groupSections(blocks: SpotDescriptionBlock[]) {
  const sections: Section[] = []
  let current: Section = { heading: null, blocks: [] }

  for (const block of blocks) {
    if (block.type === 'h2') {
      if (current.heading || current.blocks.length) sections.push(current)
      current = { heading: cleanHeading(block.content), blocks: [] }
      continue
    }
    current.blocks.push(block)
  }

  if (current.heading || current.blocks.length) sections.push(current)
  return sections
}

function Paragraph({ content }: { content: string }) {
  const lines = content.split('\n').map((line) => line.trim()).filter(Boolean)
  const isBulletList = lines.length > 0 && lines.every((line) => /^[-*]\s+/.test(line))

  if (isBulletList) {
    return (
      <ul className="space-y-2.5">
        {lines.map((line, index) => (
          <li key={index} className="flex gap-3 text-[15px] leading-7 text-white/72 sm:text-base">
            <span className="mt-[0.72rem] h-1 w-1 shrink-0 rounded-full bg-amber-200/65" />
            <span><InlineMarkdown>{line.replace(/^[-*]\s+/, '')}</InlineMarkdown></span>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <p className="whitespace-pre-line text-[15px] leading-7 text-white/72 sm:text-base sm:leading-7">
      <InlineMarkdown>{content}</InlineMarkdown>
    </p>
  )
}

function ContentBlock({ block }: { block: SpotDescriptionBlock }) {
  if (block.type === 'p') return <Paragraph content={block.content} />
  if (block.type === 'blockquote') {
    return (
      <blockquote className="border-l border-amber-200/35 pl-4 text-[15px] leading-7 text-white/60 sm:text-base">
        <InlineMarkdown>{block.content}</InlineMarkdown>
      </blockquote>
    )
  }
  if (block.type === 'h3') {
    return (
      <h3 className="pt-1 text-base font-medium tracking-[0.01em] text-white/92 sm:text-lg">
        <InlineMarkdown>{cleanHeading(block.content)}</InlineMarkdown>
      </h3>
    )
  }
  return (
    <h4 className="pt-1 text-sm font-medium tracking-[0.02em] text-white/78 sm:text-base">
      <InlineMarkdown>{cleanHeading(block.content)}</InlineMarkdown>
    </h4>
  )
}

export default function SpotDescription({ children, address }: { children: string; address?: string | null }) {
  const sections = groupSections(parseSpotDescription(children))
    .map((section) => ({
      ...section,
      blocks: section.blocks.filter((block) => !isLowValueBlock(block)),
    }))
    .filter((section) => section.blocks.length > 0)
    .filter((section) => !isRedundantTransportSection(section, address))

  return (
    <div className="[overflow-wrap:anywhere]">
      {sections.map((section, index) => {
        const meta = section.heading
          ? sectionMeta[section.heading] || { title: section.heading, eyebrow: 'Guide' }
          : null

        return (
          <section
            key={`${section.heading || 'intro'}-${index}`}
            className="border-t border-white/[0.08] py-7 first:border-t-0 first:pt-0 last:pb-0"
          >
            {meta ? (
              <header className="mb-4">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[10px] tracking-[0.22em] text-amber-200/65">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="text-[10px] font-medium uppercase tracking-[0.24em] text-white/38">
                    {meta.eyebrow}
                  </span>
                  <span className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent" />
                </div>
                <h2 className="mt-2 [font-family:var(--font-noto-serif-sc),serif] text-[1.28rem] font-medium tracking-[0.01em] text-white/95 sm:text-[1.4rem]">
                  {meta.title}
                </h2>
              </header>
            ) : null}

            <div className="space-y-4">
              {section.blocks.map((block, blockIndex) => (
                <ContentBlock key={blockIndex} block={block} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
