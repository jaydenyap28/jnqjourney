// Authorized synthetic preseed only. Real R2 reads and Registry confirmation.
import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'
import {ACCOUNT,BUCKET} from './candidate-cloudflare.mjs'
import {isolatedRequest,ISOLATED_REF} from './isolated-supabase.mjs'
export const syntheticPng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=','base64')
export async function createMediaPreparer({root,keys,token,resume=false}){
  const hash=value=>createHash('sha256').update(value).digest('hex')
  assert.equal(hash(syntheticPng),'5e3d382db4dd83d59aa5742793ad6b7903409e865c83bcbc54835049f043bc15')
  const file=root+'media-setup.json'
  const report=resume?JSON.parse(await readFile(file)):{projectRef:ISOLATED_REF,bucket:BUCKET,media:[],r2:{put:0,get:0},registry:{register:0,lookup:0},sha256:hash(syntheticPng)}
  assert.ok(report.projectRef===ISOLATED_REF&&report.bucket===BUCKET&&report.sha256===hash(syntheticPng))
  const persist=()=>writeFile(file,JSON.stringify(report,null,2)+'\n')
  if(!resume)await writeFile(file,JSON.stringify(report,null,2)+'\n',{flag:'wx'})
  async function objectRequest(key,bytes,type){
    assert.match(key,/^(?:media\/candidate|_candidate-validation)\/920(?:05|17|30)\/[a-f0-9-]+\.png(?:\.json)?$/)
    report.r2[bytes?'put':'get']++;await persist()
    const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects/${key}`,{
      method:bytes?'PUT':'GET',headers:{Authorization:'Bearer '+token,...(bytes?{'Content-Type':type}:{})},...(bytes?{body:bytes}:{}),redirect:'manual',signal:AbortSignal.timeout(15000)})
    assert.ok(response.ok,'TEST_R2_REQUEST_FAILED')
    if(bytes){const payload=await response.json();assert.ok(payload.success);return payload.result}
    return {bytes:Buffer.from(await response.arrayBuffer()),mime:response.headers.get('content-type'),etag:response.headers.get('etag')?.replace(/^W\//,'').replaceAll('"','')}
  }
  async function prepare(id,n,{register=true}={}){
    assert.ok([92005,92017,92030].includes(id)&&n>=1&&n<=30)
    const paths=[]
    for(let i=0;i<n;i++){
      const key=`media/candidate/${id}/${randomUUID()}.png`,receiptKey='_candidate-validation/'+key.slice('media/candidate/'.length)+'.json'
      const record={id,key,receiptKey,registered:false};report.media.push(record);await persist()
      const final=await objectRequest(key,syntheticPng,'image/png'),read=await objectRequest(key)
      assert.ok(final.key===key&&Number(final.size)===syntheticPng.length&&final.version&&final.etag&&read.etag===final.etag&&read.mime==='image/png'&&hash(read.bytes)===report.sha256,'REAL_FINAL_VERIFICATION_FAILED')
      const proof={schemaVersion:1,key,fixtureId:String(id),size:syntheticPng.length,etag:final.etag,version:final.version,contentType:'image/png',signatureChecked:true}
      const bytes=Buffer.from(JSON.stringify(proof)),receipt=await objectRequest(receiptKey,bytes,'application/json'),receiptRead=await objectRequest(receiptKey)
      assert.ok(receipt.key===receiptKey&&Number(receipt.size)===bytes.length&&receipt.version&&receipt.etag===receiptRead.etag&&receiptRead.mime==='application/json'&&bytes.equals(receiptRead.bytes),'REAL_RECEIPT_VERIFICATION_FAILED')
      Object.assign(record,{size:syntheticPng.length,etag:final.etag,version:final.version,receiptSize:bytes.length,receiptEtag:receipt.etag,receiptVersion:receipt.version,bytesVerified:true})
      if(register){
        report.registry.register++;await persist()
        const response=await isolatedRequest(keys,'/rest/v1/rpc/jnq_media_register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_spot:id,p_key:key,p_size:record.size,p_mime:'image/png',p_etag:record.etag,p_version:record.version,p_receipt_size:record.receiptSize,p_receipt_etag:record.receiptEtag,p_receipt_version:record.receiptVersion,p_can_insert:true})})
        assert.ok(response.ok&&await response.json()===true,'REGISTRATION_NOT_CONFIRMED')
        report.registry.lookup++;await persist()
        const lookup=await isolatedRequest(keys,'/rest/v1/rpc/jnq_media_lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_spot:id,p_key:key})})
        assert.ok(lookup.ok)
        const registered=await lookup.json()
        assert.ok(registered?.publiclyReferenced===false&&registered.key===key&&registered.size===record.size&&registered.etag===record.etag&&registered.version===record.version&&registered.receiptSize===record.receiptSize&&registered.receiptEtag===record.receiptEtag&&registered.receiptVersion===record.receiptVersion,'REGISTRY_IDENTITY_MISMATCH')
        record.registered=true
      }
      paths.push('/'+key);await persist()
    }
    return paths
  }
  async function replaceWithSameBytes(path){
    const key=path.slice(1),record=report.media.find(r=>r.key===key&&r.registered)
    assert.ok(record)
    const result=await objectRequest(key,syntheticPng,'image/png')
    assert.ok(result.version&&result.version!==record.version&&result.etag===record.etag,'REPLACEMENT_VERSION_REQUIRED')
    record.externalReplacement={etag:result.etag,version:result.version,bytes:syntheticPng.length}
    await persist()
  }
  return {prepare,replaceWithSameBytes,report}
}
