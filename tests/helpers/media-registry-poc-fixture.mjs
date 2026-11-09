// Node AsyncLocalStorage is TEST INFRASTRUCTURE only. A real implementation
// would pass the verified proof directly from completeDirect's local variables.
import {AsyncLocalStorage} from 'node:async_hooks'
import {fixture as legacyFixture,base} from './cloudflare-spot-fixture.mjs'
import {registryModel} from './media-registry-model.mjs'
import {createRegistryPoc,refuse} from '../../cloudflare/spot-loop/poc/trusted-media-registry.mjs'
export function registryFixture(options={}){
  const legacy=legacyFixture(),model=registryModel(legacy.rows,options),scope=new AsyncLocalStorage()
  const r2=legacy.env.TEST_MEDIA,poc=createRegistryPoc({db:model.db,r2,authorize:model.authorize})
  const originalPut=r2.put.bind(r2),originalGet=r2.get.bind(r2)
  r2.put=async(key,body,putOptions)=>{
    const result=await originalPut(key,body,putOptions),context=scope.getStore()
    if(result&&context&&key===context.receipt){
      const proof=JSON.parse(body)
      await poc.registerVerified(proof,result,model.principal)
      context.registered=true
    }
    return result
  }
  r2.get=async(key,getOptions)=>{
    const result=await originalGet(key,getOptions),context=scope.getStore()
    if(result&&context&&key===context.receipt){context.retryReceipt=result;const originalJson=result.json;result.json=async()=>{const proof=await originalJson();context.retryProof=proof;return proof}}
    return result
  }
  async function complete(key){
    const context={receipt:`_candidate-validation/${key.slice('media/candidate/'.length)}.json`,registered:false}
    return scope.run(context,async()=>{
      const result=await legacy.finish(key)
      if(result.status===201&&!context.registered){
        if(!context.retryProof)refuse('TRUSTED_RETRY_PROOF_MISSING')
        // Existing processing-ticket replay already read receipt + HEAD and
        // verified the immutable tuple. Reconcile; never blindly upsert/revive.
        try{await poc.registerVerified(context.retryProof,context.retryReceipt,model.principal)}catch(error){return Response.json({error:error.code||'REGISTRATION_FAILED'},{status:503})}
      }
      return result
    })
  }
  async function ready(count){
    const images=[]
    for(let i=0;i<count;i++){
      const key=await legacy.issue();await legacy.stage(key)
      const result=await complete(key)
      if(result.status!==201)throw Error('SYNTHETIC_COMPLETE_FAILED')
      images.push('/'+key)
    }
    return images
  }
  const save=(data,expectedUpdatedAt=legacy.rows.get('1')?.updated_at,principal=model.principal)=>poc.save('1',{data,expectedUpdatedAt},principal)
  return {legacy,model,poc,r2,ready,complete,save,base}
}
