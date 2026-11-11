// Only the three previously unresolved public images. No source mutation.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
const root=path.resolve('artifacts/cloudflare-static-launch-p0')
const previous=JSON.parse(await readFile('artifacts/cloudflare-static-recovery/media-availability.json','utf8'))
const targets=previous.results.filter(row=>row.status!==200)
assert.equal(targets.length,3)
assert.ok(targets.every(row=>new URL(row.url).origin==='https://i.ibb.co'))
const report={checkedAt:new Date().toISOString(),scope:'Three unresolved images from the frozen static candidate only',requests:[],productionWrites:0}
await mkdir(root,{recursive:true})
async function probe(entry,method) {
  const row={url:entry.url,owners:entry.owners,method,status:'UNKNOWN'}
  report.requests.push(row)
  try {
    const response=await fetch(entry.url,{method,redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(20000)})
    Object.assign(row,{status:response.status,type:response.headers.get('content-type'),etag:response.headers.get('etag'),contentLength:response.headers.get('content-length')})
    if(method==='GET') {
      const hash=createHash('sha256');let size=0;const prefix=[]
      for await(const chunk of response.body){size+=chunk.byteLength;assert.ok(size<=25*1024*1024,'IMAGE_PROBE_BYTE_LIMIT');hash.update(chunk);if(prefix.reduce((n,b)=>n+b.length,0)<65536)prefix.push(Buffer.from(chunk))}
      const bytes=Buffer.concat(prefix)
      row.bytes=size;row.sha256=hash.digest('hex')
      row.magic=bytes.subarray(0,12).toString('hex')
      if(bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))&&bytes.length>=24)row.dimensions={width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)}
      row.validPublicResponse=response.status===200&&row.type?.startsWith('image/')&&size>0
    } else await response.body?.cancel()
  }catch(error){row.reason=error.name;row.networkCode=error.cause?.code||error.code||null}
}
await Promise.all(targets.map(async entry=>{await probe(entry,'HEAD');await probe(entry,'GET')}))
await writeFile(path.join(root,'image-recheck.json'),JSON.stringify(report,null,2))
console.log(JSON.stringify(report))
