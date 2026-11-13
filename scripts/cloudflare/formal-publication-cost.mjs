import assert from 'node:assert/strict'
export function requireFormalFreeHeadroom(usage, now=Date.now()) {
  assert.ok(usage && Number.isFinite(Date.parse(usage.at)) && now-Date.parse(usage.at)>=0 && now-Date.parse(usage.at)<300000, 'FORMAL_USAGE_STALE_OR_UNKNOWN')
  assert.ok(usage.complete === true && Number.isFinite(usage.peakBytes) && usage.peakBytes>=0 && usage.peakBytes+64*1024**2<10_000_000_000, 'FORMAL_R2_STORAGE_HEADROOM_UNKNOWN')
  // Counting every observed operation against the smaller Class A allowance
  // is conservative; this is NOT a remaining-balance or invoice guarantee.
  assert.ok(Number.isFinite(usage.operations) && usage.operations>=0 && usage.operations+10000<1_000_000, 'FORMAL_R2_OPERATION_HEADROOM_UNKNOWN')
}
export async function readFormalFreeHeadroom(token, account, fetcher=fetch) {
  const end=new Date().toISOString(),start=end.slice(0,7)+'-01T00:00:00Z'
  const query=`query($a:string!,$start:Time!,$end:Time!){viewer{accounts(filter:{accountTag:$a}){storage:r2StorageAdaptiveGroups(limit:50,filter:{datetime_geq:$start,datetime_leq:$end}){max{payloadSize metadataSize}dimensions{bucketName}}operations:r2OperationsAdaptiveGroups(limit:1000,filter:{datetime_geq:$start,datetime_leq:$end}){sum{requests}dimensions{actionType actionStatus}}}}}`
  const r=await fetcher('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query,variables:{a:account,start,end}}),redirect:'error',signal:AbortSignal.timeout(30000)})
  const body=await r.json();assert.ok(r.ok&&!body.errors&&body.data?.viewer?.accounts?.length===1,'FORMAL_USAGE_NOT_AVAILABLE_STOP')
  const a=body.data.viewer.accounts[0]
  const usage={at:end,complete:a.storage.length>0&&a.storage.length<50&&a.operations.length>0&&a.operations.length<1000,peakBytes:a.storage.reduce((n,v)=>n+v.max.payloadSize+v.max.metadataSize,0),operations:a.operations.reduce((n,v)=>n+v.sum.requests,0),invoice:'UNKNOWN',pagesAccountRemaining:'UNKNOWN'}
  requireFormalFreeHeadroom(usage);return usage
}
