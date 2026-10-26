// Local export/snapshot input only. This command cannot write a database.
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spotContentIssues, cleanSpotEditorialDraft } from '../lib/spot-content-quality.ts'
import { spotDescriptionExcerpt } from '../lib/spot-description.ts'

const args=Object.fromEntries(process.argv.slice(2).map((arg,i,all)=>arg.startsWith('--')?[arg.slice(2),all[i+1]]:null).filter(Boolean))
if(!args.input || !['snapshot','supabase-export'].includes(args.source) || (args.source==='supabase-export'&&!args['captured-at']))throw Error('Required: --input file/directory --source snapshot|supabase-export [--captured-at timestamp] --output artifacts/path')
const out=path.resolve(args.output || 'artifacts/rc1.2/content')
if(!out.startsWith(path.resolve('artifacts')+path.sep))throw Error('Output must be a new artifact directory')
await mkdir(out,{recursive:true})
const inputs=args.input.endsWith('.json')?[args.input]:(await readdir(args.input)).filter(f=>f.endsWith('.json')&&f!=='index.json').map(f=>path.join(args.input,f))
const records=[]
for(const file of inputs){const data=JSON.parse(await readFile(file,'utf8'));if(Array.isArray(data))records.push(...data);else if(data.spot)records.push(data.spot);else if(data.locations)records.push(...data.locations);else throw Error('Unknown export shape')}
const findings=[],drafts=[]
let unknownSeoRecords=0
for(const spot of records){
  const value=String(spot.description || spot.review || '')
  const issues=spotContentIssues(value)
  const has=(key)=>Object.prototype.hasOwnProperty.call(spot,key)
  if(!['seo_title_zh','seo_description_zh','seo_title_en','seo_description_en'].every(has))unknownSeoRecords++
  if((has('seo_title_zh')&&!spot.seo_title_zh?.trim())||(has('seo_description_zh')&&!spot.seo_description_zh?.trim()))issues.push('缺少专属中文 SEO')
  if((has('seo_title_en')&&!spot.seo_title_en?.trim())||(has('seo_description_en')&&!spot.seo_description_en?.trim()))issues.push('缺少专属英文 SEO；无英文依据时不自动翻译')
  if(issues.length)findings.push({id:spot.id,name:spot.name_cn||spot.name,issues,sourceStatus:spot.status??'unknown',descriptionLength:value.length})
  const cleaned=cleanSpotEditorialDraft(value),patch={}
  if(cleaned!==value.replace(/\r\n?/g,'\n').trim())patch.description=cleaned
  const name=spot.name_cn||spot.name
  if(name&&has('seo_title_zh')&&!spot.seo_title_zh?.trim())patch.seo_title_zh=`${name} | JnQ Journey`
  const excerpt=spotDescriptionExcerpt(cleaned)
  if(excerpt&&has('seo_description_zh')&&!spot.seo_description_zh?.trim())patch.seo_description_zh=excerpt.slice(0,160)
  if(Object.keys(patch).length)drafts.push({id:spot.id,expectedUpdatedAt:spot.updated_at??null,beforeDescriptionSha256:createHash('sha256').update(value).digest('hex'),patch,approval:'REVIEW_ONLY_NOT_APPLIED',source:args.source})
}
await writeFile(path.join(out,'quality.json'),JSON.stringify({source:args.source,capturedAt:args['captured-at']||null,isCurrentSupabaseEvidence:false,databaseConnectionVerified:false,records:records.length,unknownSeoRecords,notice:'Offline input provenance is declared, not verified. Omitted fields are unknown, not missing database content.',findings,databaseWrites:0},null,2))
await writeFile(path.join(out,'drafts.json'),JSON.stringify({state:'REVIEW_ONLY',notice:'Snapshot drafts must not be applied to current database without fresh read-back, conflict checks and approval.',drafts},null,2))
console.log(JSON.stringify({source:args.source,records:records.length,flagged:findings.length,drafts:drafts.length,databaseWrites:0}))
