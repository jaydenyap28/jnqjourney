import {mediaIdentity} from '../media-identity.mjs'
// Same two-list strategy and eight-HEAD ceiling as registrySnapshot().
export async function readBatchSnapshot(bucket,id,keys,fail){
  const operations={list:0,head:0,get:0}
  const listings=await Promise.all([`media/candidate/${id}/`,`_candidate-validation/${id}/`].map(prefix=>{
    operations.list++
    return bucket.list({prefix,limit:Math.max(32,keys.length*2),include:['httpMetadata']})
  }))
  const maps=listings.map(list=>new Map(list.objects.map(object=>[object.key,object])))
  async function find(key,index){
    if(maps[index].has(key))return maps[index].get(key)
    if(!listings[index].truncated)return null
    if(operations.head>=8)fail(503,'HEAD_BUDGET_EXHAUSTED',operations)
    operations.head++
    return bucket.head(key)
  }
  const identities=[]
  for(const key of keys){
    const object=await find(key,0),receipt=await find('_candidate-validation/'+key.slice('media/candidate/'.length)+'.json',1)
    const identity=mediaIdentity(key,object,receipt)
    if(!identity)fail(409,'MEDIA_IDENTITY_UNAVAILABLE',operations)
    identities.push(identity)
  }
  return {identities,operations}
}
