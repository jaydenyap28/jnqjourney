import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {CDN,RECOVERY_BASE,SUPABASE} from './recovery-sources.mjs'
import {FINAL_DIR} from './recovery-media-inventory-final.mjs'

const key=JSON.parse(await readFile(path.join(RECOVERY_BASE,'.public-read-key.json'),'utf8'))
assert.equal(key.projectRef,new URL(SUPABASE).hostname.split('.')[0])
assert.equal(JSON.parse(Buffer.from(key.apiKey.split('.')[1],'base64url')).role,'anon')
const headers={apikey:key.apiKey,Authorization:`Bearer ${key.apiKey}`,Prefer:'count=exact'}
const manifest=JSON.parse(await readFile(path.join(RECOVERY_BASE,'source-manifest.json'),'utf8'))
const sample=JSON.parse(await readFile(path.join(RECOVERY_BASE,'media-inventory.json'),'utf8')).find(row=>row.url.startsWith(`${SUPABASE}/storage/v1/object/public/location-images/`))
const cases=[
  ['anon-active-locations',`${SUPABASE}/rest/v1/locations?select=id&status=eq.active&limit=1`,headers],
  ['anon-closed-locations',`${SUPABASE}/rest/v1/locations?select=id&status=in.(permanently_closed,temporarily_closed)&limit=1`,headers],
  ['anon-internal-column',`${SUPABASE}/rest/v1/locations?select=review_jayden&id=eq.31&limit=1`,headers],
  ['anon-closed-media-column',`${SUPABASE}/rest/v1/locations?select=images&id=eq.31&limit=1`,headers],
  ['without-api-key',`${SUPABASE}/rest/v1/locations?select=id&limit=1`,{}],
  ...['notes','guides'].flatMap(name=>{
    const {pointer,target}=manifest.authority[name]
    assert.match(pointer,/^_system\/(notes|guides)-latest\.webp$/)
    assert.match(target,/^_system\/(notes|guides)\/\d+\.webp$/)
    return [[`storage-${name}-pointer`,`${SUPABASE}/storage/v1/object/public/location-images/${pointer}`,{}],
      [`storage-${name}-snapshot`,`${SUPABASE}/storage/v1/object/public/location-images/${target}`,{}],
      [`storage-${name}-authenticated-route-anon`,`${SUPABASE}/storage/v1/object/authenticated/location-images/${target}`,headers]]
  }),
  ['storage-image',sample?.url,{}],
  ['r2-public-locations-feed',`${CDN}/public-data/locations.json`,{}],
  ['r2-public-guides-feed',`${CDN}/public-data/guides.json`,{}],
  ['r2-public-notes-feed',`${CDN}/public-data/notes.json`,{}],
].filter(([,url])=>url)
const report={checkedAt:new Date().toISOString(),method:'HEAD only, no row/object bodies or credential output',projectRef:key.projectRef,remoteWrites:0,checks:[]}
for(const [id,url,requestHeaders] of cases){
  const row={id,status:'UNKNOWN'}
  report.checks.push(row)
  try {
    const response=await fetch(url,{method:'HEAD',headers:requestHeaders,redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000)})
    Object.assign(row,{status:response.status,range:response.headers.get('content-range'),contentType:response.headers.get('content-type'),contentLength:response.headers.get('content-length')})
    await response.body?.cancel()
  }catch(error){row.error=error.cause?.code||error.name}
}
await writeFile(path.join(FINAL_DIR,'formal-readonly-audit.json'),JSON.stringify(report,null,2))
console.log(JSON.stringify(report))
