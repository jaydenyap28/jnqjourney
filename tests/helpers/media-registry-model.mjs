// In-memory serial transaction model ONLY, NOT SQL/RLS/lock validation.
import {refuse,proofIdentity,sameObject,sameReceipt,references} from '../../cloudflare/spot-loop/poc/trusted-media-registry.mjs'
export function registryModel(rows,{clock=()=>Date.now()}={}){
  const entries=new Map(),calls={register:0,commit:0,readSpot:0,mediaAccess:0,revoke:0,delete:0}
  const servicePrincipal=Object.freeze({adminId:'synthetic-admin',authority:Symbol('server-only')})
  const authorize=principal=>{if(principal!==servicePrincipal)refuse('ADMIN_OR_SERVICE_REQUIRED')}
  let queue=Promise.resolve(),failBefore=false,failAfter=false,beforeCommit
  function transaction(fn){const run=queue.then(fn);queue=run.catch(()=>{});return run}
  function requireSpot(id){const row=rows.get(String(id));if(!row)refuse('SPOT_MISSING');return row}
  function entryActive(entry){return entry&&entry.state==='verified'&&(entry.validUntil===null||entry.validUntil>clock())}
  const db={
    now:clock,
    async registerVerified(proof,principal,{canInsert=true}={}){
      authorize(principal);calls.register++
      return transaction(async()=>{
        if(failBefore){failBefore=false;refuse('REGISTRY_UNAVAILABLE')}
        requireSpot(proof.fixtureId)
        if(!proofIdentity(proof,proof.fixtureId,proof.key))refuse('INVALID_SERVER_PROOF')
        const prior=entries.get(proof.key)
        if(prior){
          if(!entryActive(prior))refuse('REGISTRATION_TERMINAL')
          if(prior.fixtureId!==proof.fixtureId||!sameObject({key:prior.key,size:prior.size,etag:prior.etag,version:prior.version,httpMetadata:{contentType:prior.contentType}},proof)||!sameReceipt(prior.receipt,proof.receipt))refuse('REGISTRATION_IDENTITY_CONFLICT')
        }else {
          if(!canInsert)refuse('REGISTRATION_UNCONFIRMED')
          entries.set(proof.key,{...structuredClone(proof),state:'verified',generation:1,verifiedAt:clock(),validUntil:null})
        }
        if(failAfter){failAfter=false;refuse('AMBIGUOUS_REGISTRATION')}
        return structuredClone(entries.get(proof.key))
      })
    },
    async readSpot(id,principal){authorize(principal);calls.readSpot++;return transaction(()=>structuredClone(requireSpot(id)))},
    async commitSpot({id,expectedUpdatedAt,data,snapshot,withdrawing},principal){
      authorize(principal);calls.commit++
      return transaction(async()=>{
        const previous=requireSpot(id)
        if(previous.updated_at!==expectedUpdatedAt)refuse('SPOT_VERSION_CONFLICT')
        const merged={...previous,...structuredClone(data)}
        const keys=references(merged,id),observed=new Map(snapshot.map(o=>[o.key,o]))
        if(!withdrawing)for(const key of keys){
          const entry=entries.get(key)
          if(!entryActive(entry))refuse('MEDIA_NOT_REGISTERED_OR_ACTIVE')
          if(!proofIdentity(entry,id,key)||!sameObject(observed.get(key),entry)||!sameReceipt(observed.get(key)?.receipt,entry.receipt))refuse('REGISTRY_OBJECT_MISMATCH')
        }
        if(beforeCommit)await beforeCommit()
        // Recheck validity at model commit time, not at the R2 snapshot time.
        if(!withdrawing&&keys.some(key=>!entryActive(entries.get(key))))refuse('MEDIA_EXPIRED_AT_COMMIT')
        merged.updated_at=new Date(Math.max(clock(),Date.parse(previous.updated_at||0)+1)).toISOString()
        rows.set(String(id),merged);return structuredClone(merged)
      })
    },
    async revoke(id,key,principal){
      authorize(principal);calls.revoke++
      return transaction(()=>{
        const spot=requireSpot(id),entry=entries.get(key)
        if(!entry||entry.fixtureId!==String(id))refuse('MEDIA_MISSING')
        entry.state='revoked';entry.generation++
        if(references(spot,id).includes(key))rows.set(String(id),{...spot,publication_status:'hidden',updated_at:new Date(Math.max(clock(),Date.parse(spot.updated_at||0)+1)).toISOString()})
      })
    },
    async deleteSpot(id,version,principal){
      authorize(principal);calls.delete++
      return transaction(()=>{const row=requireSpot(id);if(row.updated_at!==version)refuse('SPOT_VERSION_CONFLICT');rows.delete(String(id));for(const [key,entry]of entries)if(entry.fixtureId===String(id))entries.delete(key)})
    },
    async mediaAccess(id,key,principal){
      if(principal)authorize(principal);calls.mediaAccess++
      return transaction(()=>({spot:structuredClone(requireSpot(id)),entry:structuredClone(entries.get(key))}))
    },
  }
  return {db,entries,calls,principal:servicePrincipal,authorize,failRegistrationBefore(){failBefore=true},failRegistrationAfter(){failAfter=true},beforeCommit(hook){beforeCommit=hook},setValidUntil(key,until){entries.get(key).validUntil=until}}
}
