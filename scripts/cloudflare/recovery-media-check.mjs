import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { RECOVERY, CDN, SUPABASE } from './recovery-sources.mjs'

const media=JSON.parse(await readFile(path.join(RECOVERY,'media-inventory.json'),'utf8'))
assert.ok(media.length<=1200,'PUBLIC_MEDIA_PROBE_BUDGET')
const allowed=new Set([CDN,SUPABASE,'https://i.ytimg.com','https://i.ibb.co'])
const results=new Array(media.length)
let cursor=0
await Promise.all(Array.from({length:8},async()=>{
  while(cursor<media.length) {
    const index=cursor++,entry=media[index]
    const record={url:entry.url,owners:entry.owners,status:'UNKNOWN',nativeIdentity:'UNVERIFIED',revocation:'UNKNOWN'}
    results[index]=record
    if(!allowed.has(new URL(entry.url).origin)){record.reason='ORIGIN_NOT_APPROVED';continue}
    try {
      const response=await fetch(entry.url,{method:'HEAD',redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(10000)})
      Object.assign(record,{status:response.status,contentType:response.headers.get('content-type'),bytes:Number(response.headers.get('content-length'))||null,etag:response.headers.get('etag')})
      await response.body?.cancel()
    } catch {record.reason='PUBLIC_HEAD_FAILED'}
  }
}))
const report={checkedAt:new Date().toISOString(),method:'HEAD',total:results.length,requestLimit:1200,
  statuses:results.reduce((summary,row)=>(summary[row.status]=(summary[row.status]||0)+1,summary),{}),
  contentTypeMismatch:results.filter(row=>row.status===200&&!row.contentType?.startsWith('image/')).length,
  scope:'Existing explicitly referenced public image URLs only. HEAD availability does not prove native identity or revocation.',results}
await writeFile(path.join(RECOVERY,'media-availability.json'),JSON.stringify(report,null,2))
console.log(JSON.stringify({total:report.total,statuses:report.statuses,contentTypeMismatch:report.contentTypeMismatch}))
