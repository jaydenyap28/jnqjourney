// Scoped R2 LIST metadata. Never save keys or metadata for objects outside the inventory.
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {ACCOUNT,privateWranglerToken} from './candidate-cloudflare.mjs'
import {CDN} from './recovery-sources.mjs'
import {FINAL_DIR} from './recovery-media-inventory-final.mjs'

const {records}=JSON.parse(await readFile(path.join(FINAL_DIR,'inventory.private.json'),'utf8'))
const target=new Map(records.filter(row=>row.identity.startsWith(CDN+'/')).map(row=>[decodeURIComponent(new URL(row.identity).pathname.slice(1)),row]))
const prefixes=[...new Set([...target.keys()].map(key=>key.split('/')[0]+'/'))]
assert.ok(prefixes.length<=20&&prefixes.every(prefix=>/^[a-z0-9_-]+\/$/i.test(prefix)))
const token=await privateWranglerToken()
const endpoint=`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/jnqjourney-img/objects`
const measurements=new Map(),prefixResults=[]
let requests=0
for(const prefix of prefixes){
  const progress={prefix,requests:0,completed:false}
  prefixResults.push(progress)
  let cursor
  do {
    if(requests>=32){progress.stop='BUDGET';break}
    const query=new URLSearchParams({prefix,per_page:'1000'})
    if(cursor)query.set('cursor',cursor)
    requests++;progress.requests++
    try {
      const response=await fetch(endpoint+'?'+query,{headers:{Authorization:`Bearer ${token}`},redirect:'manual',signal:AbortSignal.timeout(20000)})
      const data=await response.json()
      if(!response.ok||!data.success||!Array.isArray(data.result)){progress.stop='HTTP_'+response.status;progress.codes=data.errors?.map(e=>e.code);break}
      for(const object of data.result){
        const row=target.get(object.key)
        if(!row||!Number.isSafeInteger(object.size)||object.size<0)continue
        measurements.set(object.key,{identitySha256:row.sha256,bytes:object.size,type:object.http_metadata?.contentType??null,status:row.status})
      }
      if(!data.result_info?.is_truncated){progress.completed=true;break}
      const next=data.result_info?.cursor
      if(typeof next!=='string'||!next||next===cursor){progress.stop='INVALID_CURSOR';break}
      cursor=next
    }catch(error){progress.stop=error.cause?.code||error.name;break}
  }while(cursor)
  // A permission, network or quota issue is an explicit stopping condition.
  if(progress.stop)break
}
const values=[...measurements.values()],publicValues=values.filter(row=>row.status==='REVIEW_REQUIRED')
const candidateR2=[...target.values()].filter(row=>row.status==='REVIEW_REQUIRED').length
const report={checkedAt:new Date().toISOString(),requests,prefixResults,matched:values.length,candidateR2,
  matchedPublicCandidates:publicValues.length,unresolvedPublicCandidates:candidateR2-publicValues.length,
  knownBytes:publicValues.reduce((n,row)=>n+row.bytes,0),maxKnownBytes:Math.max(0,...publicValues.map(row=>row.bytes)),
  over25MiB:publicValues.filter(row=>row.bytes>25*1024*1024),
  totalPublicCandidateBytes:publicValues.length===candidateR2?publicValues.reduce((n,row)=>n+row.bytes,0):'UNKNOWN',
  objectBodiesRead:0,remoteWrites:0,accountR2Quota:'UNKNOWN',method:'Cloudflare R2 List Objects metadata for known source prefixes; exact keys retained by identity hash only.'}
await writeFile(path.join(FINAL_DIR,'r2-size-measurements.json'),JSON.stringify({report,values},null,2))
console.log(JSON.stringify(report))
