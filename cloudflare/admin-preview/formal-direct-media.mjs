import {FormalError} from './formal-runtime.mjs'
import {createFormalR2,MEDIA_MIME,MEDIA_MAX,mediaSha} from './formal-r2-direct.mjs'
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const names=/^[a-f0-9]{64}\.(png|jpg|webp|gif)$/
const norm=s=>String(s||'').replaceAll('"','').toLowerCase()
export function createFormalDirectMedia({queue,env,verifyPrivate,verifyBinding,now=()=>Date.now(),r2=createFormalR2(env)}){
 const key=name=>'_admin-formal-drafts/'+name
 async function receipt(name,actor){
  if(!names.test(name))throw new FormalError(400,'FORMAL_MEDIA_NAME_INVALID')
  const proof=await queue.read('_media/'+name+'.json')
  if(!proof||proof.revoked!==false||proof.bucket!=='jnqjourney-admin-private-media'||proof.key!==key(name)||proof.sha256!==name.split('.')[0])throw new FormalError(404,'FORMAL_MEDIA_NOT_VERIFIED_OR_REVOKED')
  if(actor){const owner=await queue.read('_media-owners/'+name+'/'+await mediaSha(actor)+'.json');if(owner?.actor!==actor||owner.sha256!==proof.sha256)throw new FormalError(403,'FORMAL_MEDIA_OWNER_REQUIRED')}
  return proof
 }
 async function identity(name,actor){const p=await receipt(name,actor),h=await r2.head(p.key)
  if(!h||h.size!==p.size||h.type!==p.type||norm(h.etag)!==norm(p.etag))throw new FormalError(409,'FORMAL_MEDIA_IDENTITY_CHANGED');return p
 }
 async function get(name,actor){const p=await identity(name,actor),b=await r2.get(p.key,p)
  if(norm(b.etag)!==norm(p.etag))throw new FormalError(409,'FORMAL_MEDIA_IDENTITY_CHANGED')
  return {...b,rightsEvidence:p.rightsEvidence}
 }
 async function start(body,actor){
  await verifyPrivate();const type=body?.type,ext=Object.entries(MEDIA_MIME).find(([,v])=>v===type)?.[0]
  if(!ext||!Number.isSafeInteger(body.size)||body.size<12||body.size>MEDIA_MAX||!/^[a-f0-9]{64}$/.test(body.sha256||'')||typeof body.rightsEvidence!=='string'||!body.rightsEvidence.trim()||body.rightsEvidence.length>500)throw new FormalError(400,'FORMAL_UPLOAD_SIZE_MIME_SHA_OR_RIGHTS_INVALID')
  const binding=await verifyBinding(body.binding)
  const id=crypto.randomUUID(),expiresAt=now()+120000,name=body.sha256+'.'+ext,staging='_admin-formal-drafts/_staging/'+id+'.'+ext
  const revision=await mediaSha(JSON.stringify({id,actor,binding,sha256:body.sha256,size:body.size,type}))
  const ticket={id,actor,binding,name,staging,type,size:body.size,sha256:body.sha256,rightsEvidence:body.rightsEvidence.trim(),revision,expiresAt}
  const saved=await queue.createOnce('_uploads/'+id+'.json',ticket)
  if(saved.revision!==revision||saved.actor!==actor)throw new FormalError(503,'FORMAL_UPLOAD_GRANT_UNCONFIRMED')
  return {ticket:id,revision,...await r2.presign(staging,type,body.size),requiredBytes:body.size}
 }
 async function finish(body,actor,cancel=false){
  await verifyPrivate();if(!uuid.test(body?.ticket||''))throw new FormalError(400,'FORMAL_UPLOAD_TICKET_INVALID')
  const t=await queue.read('_uploads/'+body.ticket+'.json')
  if(!t||t.actor!==actor||t.revision!==body.revision)throw new FormalError(403,'FORMAL_UPLOAD_TICKET_OWNER_OR_REVISION')
  const existing=await queue.read('_uploads/'+t.id+'-complete.json')
  if(existing){if(cancel||existing.revoked!==false)throw new FormalError(409,'FORMAL_UPLOAD_ALREADY_VERIFIED_OR_REVOKED');await identity(t.name,actor);return existing.result}
  if(t.expiresAt<now())throw new FormalError(410,'FORMAL_UPLOAD_TICKET_EXPIRED')
  await verifyBinding(t.binding)
  const nonce=crypto.randomUUID(),claim=await queue.createOnce('_uploads/'+t.id+'-claim.json',{nonce,actor,state:cancel?'cancelled':'processing'})
  if(claim.nonce!==nonce)throw new FormalError(409,'FORMAL_UPLOAD_RECONCILE_REQUIRED')
  if(cancel)return {cancelled:true}
  // Processing claims are never stolen. Unknown copies or receipt writes are
  // preserved for reconciliation; no cleanup can delete a verified object.
  const staging=await r2.get(t.staging,t)
  const name=t.name,finalKey=key(name),old=await r2.head(finalKey)
  if(!old)await r2.copy(t.staging,finalKey,staging.etag)
  const final=await r2.get(finalKey,t),head=await r2.head(finalKey)
  if(!head||head.size!==t.size||head.type!==t.type||norm(head.etag)!==norm(final.etag))throw new FormalError(409,'FORMAL_UPLOAD_FINAL_HEAD_CHANGED')
  const proof={bucket:'jnqjourney-admin-private-media',key:finalKey,sha256:t.sha256,size:t.size,type:t.type,etag:final.etag,rightsEvidence:t.rightsEvidence,verifiedAt:new Date(now()).toISOString(),revoked:false}
  const master=await queue.createOnce('_media/'+name+'.json',proof)
  if(master.revoked!==false||master.key!==proof.key||master.sha256!==proof.sha256||master.size!==proof.size||master.type!==proof.type||norm(master.etag)!==norm(proof.etag))throw new FormalError(409,'FORMAL_MEDIA_RECEIPT_CONFLICT')
  const owner=await queue.createOnce('_media-owners/'+name+'/'+await mediaSha(actor)+'.json',{actor,sha256:t.sha256})
  if(owner.actor!==actor||owner.sha256!==t.sha256)throw new FormalError(409,'FORMAL_MEDIA_OWNER_RECEIPT_CONFLICT')
  const result={url:'/admin-draft-media/'+name,key:finalKey,size:t.size,provider:'cloudflare-r2',verified:true,proof:{ticket:t.id,revision:t.revision}}
  const complete=await queue.createOnce('_uploads/'+t.id+'-complete.json',{actor,name,binding:t.binding,revision:t.revision,revoked:false,referenceUntil:now()+86400000,result})
  if(complete.actor!==actor||complete.revision!==t.revision||complete.revoked!==false)throw new FormalError(409,'FORMAL_MEDIA_COMPLETE_CONFLICT')
  await identity(name,actor);return result
 }
 async function verifyIdentity(name,context,needsProof=false){
  await identity(name,context?.actor)
  if(needsProof){
   const p=context?.proofs?.[name]
   if(!context?.actor||!uuid.test(p?.ticket||''))throw new FormalError(403,'FORMAL_MEDIA_CONTEXT_PROOF_REQUIRED')
   const grant=await queue.read('_uploads/'+p.ticket+'-complete.json')
   if(!grant||grant.actor!==context.actor||grant.name!==name||grant.revision!==p.revision||grant.revoked!==false||grant.referenceUntil<now()||JSON.stringify(grant.binding)!==JSON.stringify(context.binding))throw new FormalError(409,'FORMAL_MEDIA_CONTEXT_VERSION_OR_REVOKED')
  }
 }
 return {start,finish,get,verifyIdentity,probeScope:r2.probeScope,
  async recordBinding(names,context,result){if(!names.length)return
   const record={actor:context.actor,mutationId:context.id,expected:context.binding,media:names,result,at:new Date(now()).toISOString()}
   const saved=await queue.createOnce('_media-bindings/'+context.id+'.json',record)
   if(saved.actor!==context.actor||JSON.stringify(saved.result)!==JSON.stringify(result))throw new FormalError(503,'FORMAL_MEDIA_CONTENT_BINDING_UNCONFIRMED')
  }}
}
