// Image bodies are decoded in Chrome. A GET-header fallback cancels the body
// immediately when Pages omits Content-Length on HEAD.
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {RECOVERY} from './recovery-sources.mjs'
import {FINAL_DIR} from './recovery-media-inventory-final.mjs'
import {readMediaApproval,validateMediaApproval} from './recovery-media-release-gate.mjs'

const json=async file=>JSON.parse(await readFile(file,'utf8'))
const getHeaders=process.argv.includes('--get-headers')
assert.ok(process.argv.slice(2).every(arg=>arg==='--get-headers'))
const [deployment,inventory]=await Promise.all([
  json(path.join(RECOVERY,'deployment.json')),json(path.join(FINAL_DIR,'inventory.private.json')),
])
assert.ok(deployment.success&&deployment.environment==='preview')
const origin=new URL(deployment.url)
assert.equal(origin.protocol,'https:')
assert.match(origin.hostname,/^[a-f0-9]+\.jnqjourney-static-recovery-candidate\.pages\.dev$/)
const {approval}=await readMediaApproval(inventory)
const {authorized,pending}=validateMediaApproval(inventory,approval)
assert.equal(pending.length,0)
const media=[...new Map([...authorized.values()].filter(row=>row.disposition==='static-copy').map(row=>[row.path,row])).values()]
const results=new Array(media.length)
let cursor=0
await Promise.all(Array.from({length:12},async()=>{
  while(cursor<media.length){
    const index=cursor++,item=media[index]
    try{
      const response=await fetch(new URL(item.path,origin),{method:getHeaders?'GET':'HEAD',
        headers:getHeaders?{'Range':'bytes=0-0','Accept-Encoding':'identity'}:{},
        redirect:'manual',signal:AbortSignal.timeout(20000)})
      const rawSize=response.status===206?response.headers.get('content-range')?.split('/').at(-1):response.headers.get('content-length')
      const size=rawSize===null||rawSize===undefined?null:Number(rawSize)
      const type=response.headers.get('content-type')?.split(';')[0]
      results[index]={path:item.path,http:response.status,bytes:size,type,
        noindex:response.headers.get('x-robots-tag'),
        passed:[200,206].includes(response.status)&&size===item.bytes&&/^image\/(png|jpeg|webp|gif|avif)$/.test(type)
          &&/noindex/.test(response.headers.get('x-robots-tag')??'')}
      await response.body?.cancel()
    }catch(error){results[index]={path:item.path,passed:false,error:error.cause?.code??error.name}}
  }
}))
const report={checkedAt:new Date().toISOString(),origin:origin.origin,method:getHeaders?'GET_RANGE_HEADERS_BODY_CANCELLED':'HEAD',
  imageBodiesConsumedByApplication:0,networkPrefetchBytes:'UNKNOWN',total:media.length,passed:results.every(row=>row.passed),results}
await writeFile(path.join(RECOVERY,'media-http-checks.json'),JSON.stringify(report,null,2))
console.log(JSON.stringify({passed:report.passed,total:report.total,failures:results.filter(row=>!row.passed).slice(0,12)}))
if(!report.passed)process.exitCode=1
