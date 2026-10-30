import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { assessSpotContent } from '../../lib/spot-content-quality.ts'
import { guideContentSpotIds } from '../../lib/guide-route-spot-ids.ts'
import { evaluateSpotQuality } from '../../lib/spot-quality.ts'
const directory = 'artifacts/spot-travel-upgrade'
const snapshot = JSON.parse(await fs.readFile('public-data/fallback/2026-10-30.json','utf8'))
const prior = JSON.parse(await fs.readFile('artifacts/spot-index-review/content-drafts.json','utf8'))
const drafts = JSON.parse(await fs.readFile(`${directory}/new-drafts.json`,'utf8'))
const guide = JSON.parse(await fs.readFile(`${directory}/japan-guide-public.json`,'utf8'))
const sha = value => createHash('sha256').update(String(value || '')).digest('hex')
const oldRows = JSON.parse(await fs.readFile('artifacts/spot-index-review/review-checklist.json','utf8'))
const ids = Object.entries(snapshot.eligibility).filter(([,state])=>!state.indexableAtCapture).map(([id])=>Number(id))
const legacy = prior.drafts.map(draft=>({id:draft.id,source:'artifacts/spot-index-review/content-drafts.json',descriptionUnchanged:sha(snapshot.spots[draft.id].description)===draft.descriptionSha256Before,approval:draft.status}))
if(legacy.some(item=>!item.descriptionUnchanged)) throw Error('Prior draft source changed; review before reuse')
const publicGuideIds = guideContentSpotIds(guide)
const review = { state:'UNPUBLISHED_REVIEW_ONLY', checkedAt:'2026-10-30', scope:'Existing 48 noindex records; four new priorities. No full-site editorial audit.', previousChecklistShape:Array.isArray(oldRows)?'array':'object', reusedDrafts:legacy,
  newDrafts:drafts.drafts.map(draft=>({id:draft.id,name:snapshot.spots[draft.id].name,descriptionSha256Before:sha(snapshot.spots[draft.id].description),priceInfoSha256Before:sha(JSON.stringify(snapshot.spots[draft.id].price_info)),openingHoursSha256Before:sha(snapshot.spots[draft.id].opening_hours),publicGuide:publicGuideIds.has(draft.id)?guide.slug:null,currentIndexable:evaluateSpotQuality(snapshot.spots[draft.id]).indexable,experienceChanged:false,identityChanged:false,publicationChanged:false,applyToProduction:false})),
  findings:ids.map(id=>({id,name:snapshot.spots[id].name_cn||snapshot.spots[id].name,...assessSpotContent(snapshot.spots[id])})),
  pendingIds:ids.filter(id=>!prior.drafts.some(d=>d.id===id)&&!drafts.drafts.some(d=>d.id===id)) }
await fs.writeFile(`${directory}/editorial-review.json`,JSON.stringify(review,null,2))
const md = ['# Spot 待审内容包','', '核实日期：2026-10-30。全部未发布，未写入数据库，当前48项仍保持noindex。', '', '复用已有三篇：见 [原草稿](../spot-index-review/DRAFTS.zh-CN.md)（故宫480、浅草寺357、森之时计375）。描述哈希与本次公开捕获一致；原有待审意见继续有效，不以本次捕获日期替代运营事实核实日期。', '', '以下为四篇新增完整替换草稿。数字时长均明确标为编辑规划建议。英文提案尚未写入翻译记录，必须使用既有编辑器绑定批准后的中文源。Column Info 建议只列在 JSON 中，实际批准时须合并既有字段，并先复核金额和票种适用范围。', '']
for(const draft of drafts.drafts){const before=snapshot.spots[draft.id];md.push(`## ${draft.id} ${before.name_cn||before.name}`, '', `优先原因：${draft.priority}`, '', `关联公开Guide：${publicGuideIds.has(draft.id)?guide.slug:'没有直接ID关联，不造关联'}`, '', `原描述SHA256：${sha(before.description)}`, '', '### 当前正文（供比较）','',before.description||'空', '', '### 中文替换提案','',draft.patch.description,'', '### 英文提案','',draft.englishProposal.description, '', '### 审核要点','',...draft.manualReview.map(item=>`- ${item}`), '', '事实出处：', '',...draft.sources.map(url=>`- [来源](${url})`),'')}
await fs.writeFile(`${directory}/DRAFTS.zh-CN.md`,md.join('\n'))
console.log(JSON.stringify({reused:legacy.length,new:drafts.drafts.length,pending:review.pendingIds.length,sourceHashesMatch:true,reviewFlags:review.findings.filter(row=>row.issues.some(i=>i.level==='review')).length}))
