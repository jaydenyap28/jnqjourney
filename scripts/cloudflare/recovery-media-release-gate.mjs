// Review exact objects before any real media copy or deployment.
import assert from 'node:assert/strict'
import {readFile,readdir,stat,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {CDN,RECOVERY,RECOVERY_BASE} from './recovery-sources.mjs'
import {FINAL_DIR,hash} from './recovery-media-inventory-final.mjs'

const SHA256=/^[a-f0-9]{64}$/
const MAX_BYTES=25*1024*1024
const IMAGE_EXTENSION=/\.(webp|png|jpe?g|gif|avif|svg|ico|bmp)$/i
const SITE_HOSTS=new Set(['jnqjourney.com','www.jnqjourney.com'])
export function validateMediaApproval(inventory,approval){
  assert.equal(approval.inventorySha256,inventory.summary.inventorySha256,'APPROVAL_INVENTORY_MISMATCH')
  assert.ok(Array.isArray(approval.decisions),'INVALID_MEDIA_DECISIONS')
  const known=new Map(inventory.records.map(row=>[row.sha256,row]))
  const authorized=new Map()
  for(const decision of approval.decisions){
    const row=known.get(decision.identitySha256)
    assert.ok(row&&row.status==='REVIEW_REQUIRED'&&!row.closedOwners.length,'OBJECT_NOT_ELIGIBLE_FOR_APPROVAL')
    assert.ok(!authorized.has(row.sha256),'DUPLICATE_MEDIA_DECISION')
    assert.ok(typeof decision.rightsEvidence==='string'&&decision.rightsEvidence.trim().length>0,'RIGHTS_EVIDENCE_REQUIRED')
    assert.ok(typeof decision.approvedBy==='string'&&decision.approvedBy.trim().length>0,'APPROVER_REQUIRED')
    assert.deepEqual([...decision.contentOwners].sort(),row.owners,'SHARED_CONSUMER_OWNERS_MISMATCH')
    assert.ok(['static-copy','provider-reference','exclude'].includes(decision.disposition),'INVALID_MEDIA_DISPOSITION')
    if(decision.disposition==='provider-reference'){
      assert.equal(new URL(row.identity).hostname,'i.ytimg.com','ONLY_EXPLICIT_VIDEO_PROVIDER_REFERENCES')
    }
    if(decision.disposition==='static-copy'){
      assert.ok(SHA256.test(decision.approvedBytesSha256||''),'EXACT_APPROVED_BYTES_REQUIRED')
      assert.ok(Number.isSafeInteger(decision.bytes)&&decision.bytes>0&&decision.bytes<=MAX_BYTES,'IMAGE_EXCEEDS_PAGES_LIMIT')
      assert.match(decision.path||'',/^\/media\/static\/[a-f0-9]{64}\.(webp|png|jpe?g|avif|gif)$/)
      assert.equal(decision.path.split('/').at(-1).split('.')[0],decision.approvedBytesSha256,'CONTENT_ADDRESS_MISMATCH')
    }
    authorized.set(row.sha256,decision)
  }
  const pending=inventory.records.filter(row=>row.status==='REVIEW_REQUIRED'&&!authorized.has(row.sha256))
  return {authorized,pending}
}
export function assertApprovedImageBytes(decision,bytes){
  assert.equal(decision.disposition,'static-copy')
  assert.equal(bytes.length,decision.bytes,'IMAGE_SIZE_MISMATCH')
  assert.equal(hash(bytes),decision.approvedBytesSha256,'IMAGE_DIGEST_MISMATCH')
}
export function assertNoLegacyDelivery(text){
  const normalized=text.replaceAll('\\/','/').replaceAll('\\u002F','/')
  assert.ok(!normalized.includes(new URL(CDN).hostname),'LEGACY_R2_REFERENCE_PRESENT')
  assert.ok(!/https:\/\/vrufunuomioczocdsoer\.supabase\.co\/storage\/v1\/object\/(?:public|authenticated|sign)\/location-images\//.test(normalized),'LEGACY_STORAGE_REFERENCE_PRESENT')
}

async function verifyLocalPackage(inventory,authorized){
  assert.notEqual(RECOVERY,RECOVERY_BASE,'FROZEN_PREVIEW_CANNOT_BECOME_FINAL_RELEASE')
  const out=path.join(RECOVERY,'deploy'),files=[]
  async function walk(directory){
    for(const entry of await readdir(path.join(out,directory),{withFileTypes:true})){
      const file=path.posix.join(directory,entry.name)
      assert.ok(!entry.isSymbolicLink(),'PACKAGE_SYMLINK')
      if(entry.isDirectory())await walk(file)
      else files.push(file)
    }
  }
  await walk('')
  assert.ok(files.length<=20000,'PAGES_FILE_COUNT_LIMIT')
  assert.ok(!files.some(file=>/(^|\/)(functions|_worker\.js)(\/|$)/.test(file)||file==='_routes.json'),'UNEXPECTED_RUNTIME')
  const approvedFiles=new Map([...authorized.values()].filter(row=>row.disposition==='static-copy').map(row=>[row.path.slice(1),row]))
  const legacySources=new Set(inventory.records.filter(row=>authorized.get(row.sha256)?.disposition!=='provider-reference').map(row=>row.identity))
  const approvedExternal=new Set(inventory.records.filter(row=>authorized.get(row.sha256)?.disposition==='provider-reference').map(row=>row.identity))
  const referenced=new Set()
  const fileSet=new Set(files)
  let totalBytes=0,maxBytes=0
  for(const file of files){
    const source=path.join(out,file),{size}=await stat(source)
    assert.ok(size<=MAX_BYTES,'PAGES_FILE_SIZE_LIMIT')
    totalBytes+=size;maxBytes=Math.max(maxBytes,size)
    if(file.startsWith('media/static/')){
      const decision=approvedFiles.get(file)
      assert.ok(decision,'UNAPPROVED_STATIC_IMAGE')
      assertApprovedImageBytes(decision,await readFile(source))
    }else if(IMAGE_EXTENSION.test(file)){
      const original=await readFile(path.join(RECOVERY_BASE,'deploy',file)).catch(()=>null)
      assert.ok(original&&size===original.length&&original.equals(await readFile(source)),'UNREVIEWED_IMAGE_OUTSIDE_STATIC_MEDIA')
    }
    if(!/\.(html|json|txt|js|css|xml)$/.test(file))continue
    const text=(await readFile(source,'utf8')).replaceAll('\\/','/').replaceAll('\\u002F','/').replaceAll('\\u0026','&').replaceAll('&amp;','&')
    assertNoLegacyDelivery(text)
    for(const match of text.matchAll(/https:\/\/[^\s"'<>`\\\[\]{}]+/g)){
      let url
      try{url=new URL(match[0].replace(/[),.;]+$/,''));url.hash=''}catch{continue}
      assert.ok(!legacySources.has(url.href),'SUPERSEDED_OR_EXCLUDED_IMAGE_REFERENCE')
      if(IMAGE_EXTENSION.test(url.pathname)){
        if(SITE_HOSTS.has(url.hostname))assert.ok(fileSet.has(url.pathname.slice(1)),'FIRST_PARTY_IMAGE_FILE_MISSING')
        else assert.ok(approvedExternal.has(url.href),'UNKNOWN_EXTERNAL_IMAGE_REFERENCE')
      }
    }
    for(const match of text.matchAll(/\/media\/static\/[a-f0-9]{64}\.(?:webp|png|jpe?g|avif|gif)/g)){
      const target=match[0].slice(1)
      assert.ok(approvedFiles.has(target),'MEDIA_REFERENCE_NOT_APPROVED')
      referenced.add(target)
    }
  }
  for(const name of approvedFiles.keys()){
    assert.ok(fileSet.has(name),'APPROVED_IMAGE_FILE_MISSING')
    assert.ok(referenced.has(name),'UNREFERENCED_PUBLIC_IMAGE_FILE')
  }
  return {files:files.length,totalBytes,maxBytes,approvedStaticImages:approvedFiles.size,functions:0}
}

if(process.argv[1]?.endsWith('recovery-media-release-gate.mjs')){
  assert.ok(process.argv.slice(2).every(arg=>arg==='--verify-package'))
  const inventory=JSON.parse(await readFile(path.join(FINAL_DIR,'inventory.private.json'),'utf8'))
  const approvalPath=path.join(FINAL_DIR,'owner-approved-media.json')
  let approval
  try{approval=JSON.parse(await readFile(approvalPath,'utf8'))}catch(error){if(error.code!=='ENOENT')throw error}
  const {authorized,pending}=validateMediaApproval(inventory,approval??{inventorySha256:inventory.summary.inventorySha256,decisions:[]})
  const packageResult=process.argv.includes('--verify-package')&&pending.length===0?await verifyLocalPackage(inventory,authorized):null
  const report={inventorySha256:inventory.summary.inventorySha256,approvalFilePresent:Boolean(approval),reviewedDecisions:authorized.size,
    eligibleStaticCopies:[...authorized.values()].filter(row=>row.disposition==='static-copy').length,pending:pending.length,
    mediaReviewComplete:pending.length===0,finalPackageVerified:Boolean(packageResult),packageResult,formalDeploymentAuthorized:false}
  await writeFile(path.join(FINAL_DIR,'media-approval-gate.json'),JSON.stringify(report,null,2))
  console.log(JSON.stringify(report))
  if(pending.length)process.exitCode=1
}
