// Display fixtures only. Never import these into data/ or the production store.
import { parseMarkdownToBlocks, EMPTY_NOTE } from '../../lib/notes.ts'

export const japanTopics = [
  ['jr-pass', 'JR Pass', ['日本列车类型', '东京地铁票', '日本退税']],
  ['train-types', '日本列车类型', ['JR Pass', '东京地铁票', '日本退税']],
  ['tokyo-subway-ticket', '东京地铁票', ['日本列车类型', 'JR Pass', '日本退税']],
  ['tax-free', '日本退税', ['JR Pass', '日本列车类型', '东京地铁票']],
]

const article = `## 阅读说明

**本页为本地展示测试资料，不可发布。** 目前尚未出发，不代表亲身实测；不提供现行政策、票价或班次结论。

### 使用前核对

正式发布时，逐项补上适用条件、官方来源及核对日期。不要将本文的占位内容当作旅行建议。

## 方案比较

| 比较项目 | 待核对内容 | 参考来源 |
| --- | --- | --- |
| 适用范围 | 填写经核对的运营商与线路 | [来源占位，发布前替换](https://example.com/reference) |
| 价格与有效期 | 填写币种、人数及适用日期 | 未核对，不提供数字 |
| 预约与使用 | 填写经核对的办理方式 | 未核对 |

### 使用前核对

这是重复小节标题，用于验证目录跳转能区分两个位置。

## 图片说明

![本地测试示意图，不是日本实拍](/placeholder-image.jpg){size=medium}
*仅用于验证图片与图注，不代表旅行经历。*

## 视频与长文

[video url="https://www.youtube.com/shorts/JNQTest0001" title="竖屏占位视频，仅验证播放器交互" aspect="portrait"]

## 常见问题

### 本文是否为亲身实测？

不是。这是出发前的展示测试资料，正式文章应区分资料整理、计划与实际体验。

### 这里的价格可以直接用于购买吗？

不可以。本页不提供报价。正式发布时应链接到相关运营商的官方票价页，并记录核对日期。

## 参考资料

[参考来源占位](https://example.com/reference) · 尚未核对，正式发布前替换为官方资料。

## 系列阅读

系列通过既有 Note 延伸阅读关联。这里只验证关联、草稿过滤与排序。`

export const japanNotes = japanTopics.map(([topic, title, related]) => ({
  ...EMPTY_NOTE,
  slug: `test-japan-${topic}`,
  aliases: topic === 'jr-pass' ? ['test-jr-pass-alias'] : [],
  title: `[测试资料·不可发布] ${title}知识型攻略`,
  shortTitle: `[测试] ${title}`,
  kicker: '日本攻略 · 本地展示测试',
  tagline: '尚未出发；资料结构演示，不代表实测或现行旅行建议。',
  summary: `本地测试 ${title}的视频、目录、图片、表格、FAQ 和系列关联。全部内容仅用于展示验证，不可发布。`,
  published: false,
  tags: ['日本攻略', title],
  relatedNoteSlugs: related.map(label => `test-japan-${japanTopics.find(([, name]) => name === label)[0]}`),
  relatedSpotIds: [990001],
  coverVideoUrl: topic === 'jr-pass' ? 'https://youtu.be/JNQTest0001' : '',
  content: article,
  blocks: parseMarkdownToBlocks(article),
  createdAt: '2026-10-28T12:00:00.000Z',
  updatedAt: '2026-10-29T08:00:00.000Z',
}))
