// LOCAL DESIGN PoC ONLY. Not imported by worker.mjs or the Pages packager.
// Ports must be server-owned; no endpoint accepts registration or R2 snapshots
// from a browser. db is a local transaction model, not a Postgres implementation.
import {validateSpotFields,publishedSpot,validVersion} from '../spot-contract.mjs'
const MAX_IMAGE=10*1024*1024
const types=['image/png','image/jpeg','image/webp','image/gif']
export class Refusal extends Error {constructor(code){super(code);this.code=code}}
export const refuse=code=>{throw new Refusal(code)}
export function proofIdentity(proof,id,key){
  return typeof key==='string'&&new RegExp(`^media/candidate/${id}/[a-f0-9-]+\\.(png|jpg|webp|gif)$`).test(key)
    &&!!proof&&proof.schemaVersion===1&&proof.fixtureId===String(id)&&proof.key===key&&proof.signatureChecked===true
    &&Number.isSafeInteger(proof.size)&&proof.size>=12&&proof.size<=MAX_IMAGE&&types.includes(proof.contentType)
    &&typeof proof.etag==='string'&&proof.etag.length>0&&typeof proof.version==='string'&&proof.version.length>0
}
export const sameObject=(object,proof)=>!!object&&object.key===proof.key&&object.size===proof.size
  &&object.etag===proof.etag&&object.version===proof.version&&object.httpMetadata?.contentType===proof.contentType
export function receiptIdentity(receipt,id,key){
  return !!receipt&&receipt.key===`_candidate-validation/${key.slice('media/candidate/'.length)}.json`
    &&String(id)===key.split('/')[2]&&Number.isSafeInteger(receipt.size)&&receipt.size>0&&receipt.size<=1024
    &&typeof receipt.etag==='string'&&receipt.etag.length>0&&typeof receipt.version==='string'&&receipt.version.length>0
}
export const sameReceipt=(a,b)=>!!a&&!!b&&['key','size','etag','version'].every(field=>a[field]===b[field])
export function references(row,id){
  const paths=[...new Set([row.image_url,...(row.images||[])].filter(Boolean))]
  if(paths.length>60||paths.some(path=>typeof path!=='string'||!new RegExp(`^/media/candidate/${id}/[a-f0-9-]+\\.(png|jpg|webp|gif)$`).test(path)))refuse('INVALID_MEDIA_REFERENCE')
  return paths.map(path=>path.slice(1))
}
export function createRegistryPoc({db,r2,authorize}){
  // Called only inside the trusted complete hook, AFTER existing signature,
  // size/MIME, final-copy and receipt checks. This is not an HTTP handler.
  async function registerVerified(proof,receipt,principal){
    authorize(principal)
    if(!proofIdentity(proof,proof?.fixtureId,proof?.key)||!receiptIdentity(receipt,proof.fixtureId,proof.key))refuse('INVALID_SERVER_PROOF')
    return db.registerVerified({...proof,receipt:{key:receipt.key,size:receipt.size,etag:receipt.etag,version:receipt.version}},principal)
  }
  async function save(id,body,principal){
    authorize(principal)
    if(!body||Object.keys(body).some(key=>!['expectedUpdatedAt','data'].includes(key))||!validVersion(body.expectedUpdatedAt))refuse('INVALID_SAVE_ENVELOPE')
    try{validateSpotFields(body.data)}catch{refuse('INVALID_FIELDS')}
    const data=body.data
    // A status-only withdrawal must remain possible even if R2 is unavailable.
    const withdrawing=(Object.hasOwn(data,'publication_status')&&['draft','hidden'].includes(data.publication_status)
      ||Object.hasOwn(data,'status')&&data.status!=='active')
      &&!Object.hasOwn(data,'images')&&!Object.hasOwn(data,'image_url')
    let snapshot=[]
    if(!withdrawing){
      // Full editor saves avoid a DB pre-read. Partial edits read the current
      // row, then the transaction rechecks the expected version and merged refs.
      const completeRefs=Object.hasOwn(data,'images')&&Object.hasOwn(data,'image_url')
      const effective=completeRefs?data:{...await db.readSpot(id,principal),...data}
      const keys=references(effective,id)
      if(keys.length){
        const limit=Math.max(32,keys.length*2)
        const receipts=await r2.list({prefix:`_candidate-validation/${id}/`,limit,include:[]})
        const receiptMap=new Map(receipts.objects.map(object=>[object.key,object]))
        const listed=await r2.list({prefix:`media/candidate/${id}/`,limit,include:['httpMetadata']})
        const byKey=new Map(listed.objects.map(object=>[object.key,object]))
        for(const key of keys){
          let object=byKey.get(key)
          if(!object&&listed.truncated)object=await r2.head(key)
          if(!object)refuse('R2_OBJECT_MISSING')
          const receiptKey=`_candidate-validation/${key.slice('media/candidate/'.length)}.json`
          let receipt=receiptMap.get(receiptKey)
          if(!receipt&&receipts.truncated)receipt=await r2.head(receiptKey)
          if(!receipt)refuse('R2_RECEIPT_MISSING')
          snapshot.push({key:object.key,size:object.size,etag:object.etag,version:object.version,httpMetadata:{contentType:object.httpMetadata?.contentType},receipt:{key:receipt.key,size:receipt.size,etag:receipt.etag,version:receipt.version}})
        }
      }
    }
    // Server-generated snapshot only. The DB port atomically locks/checks the
    // Spot version + current registry state and updates the merged Spot record.
    return db.commitSpot({id,expectedUpdatedAt:body.expectedUpdatedAt,data,snapshot,withdrawing},principal)
  }
  async function media(id,key,principal=null){
    if(principal)authorize(principal)
    // A future service-only read RPC joins live Spot + registry in ONE read.
    const {spot,entry}=await db.mediaAccess(id,key,principal)
    if(!entry||entry.state!=='verified'||entry.validUntil!==null&&entry.validUntil<=db.now())refuse('MEDIA_NOT_ACTIVE')
    if(!proofIdentity(entry,id,key))refuse('REGISTRY_IDENTITY_INVALID')
    const referenced=references(spot,id).includes(key)
    if((!publishedSpot(spot)||!referenced)&&!principal)refuse('MEDIA_PRIVATE')
    const receipt=await r2.get(`_candidate-validation/${key.slice('media/candidate/'.length)}.json`)
    if(!receipt||receipt.size>1024){await receipt?.body?.cancel();refuse('RECEIPT_MISSING')}
    if(!receiptIdentity(receipt,id,key)||!sameReceipt(receipt,entry.receipt)){await receipt.body?.cancel();refuse('LIVE_RECEIPT_CHANGED')}
    let proof;try{proof=await receipt.json()}catch{refuse('RECEIPT_DAMAGED')}
    if(!proofIdentity(proof,id,key)||!sameObject({key,size:entry.size,etag:entry.etag,version:entry.version,httpMetadata:{contentType:entry.contentType}},proof))refuse('RECEIPT_REGISTRY_MISMATCH')
    const object=await r2.get(key)
    if(!sameObject(object,proof)){await object?.body?.cancel();refuse('LIVE_OBJECT_CHANGED')}
    return object
  }
  return {registerVerified,save,media}
}
