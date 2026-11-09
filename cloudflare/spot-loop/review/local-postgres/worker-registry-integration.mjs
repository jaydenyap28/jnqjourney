import assert from 'node:assert/strict'
import {fixture,png} from '../../../../tests/helpers/cloudflare-spot-fixture.mjs'
import {SPOT_FIELDS} from '../../spot-contract.mjs'

const ref='rnamstwwbzknwbjwdgrf'
const spot=id=>`/api/candidate/spots/${id}`
const pub=id=>`/api/candidate/public/spots/${id}`
const receipt=key=>key.replace('media/candidate/','_candidate-validation/')+'.json'
const rpcName=path=>path.match(/^\/rest\/v1\/rpc\/jnq_media_(register|save|withdraw|revoke|delete|lookup)$/)?.[1]

export async function workerRegistryIntegration({sql,http,authenticated,report}) {
  const ids=[92001,92005,92017,92030,92060,92061]
  await sql(`insert into public.locations (id,name,latitude,longitude,status,publication_status)
    select id,'Synthetic Registry Spot',0,0,'active','published' from unnest(array[${ids}]) id;
    insert into jnq_media_private.enabled_spots select id from public.locations where id between 92000 and 92999;`)
  let mode,lookupFault,beforeSave
  const events=[]
  report.worker=[]
  async function check(name,fn){
    const start=events.length
    try {report.worker.push({name,pass:true,...await fn()})}
    catch(error){report.worker.push({name,pass:false,rpc:events.slice(start)});throw Error(`${name}: ${error.message}`)}
  }
  const f=fixture({ids,upstream:async(url,init)=>{
    assert.equal(url.hostname,`${ref}.supabase.co`)
    assert.equal(init.headers.apikey,'synthetic-service')
    assert.equal(init.headers.Authorization,'Bearer synthetic-service')
    const rpc=rpcName(url.pathname)
    if(!rpc){
      assert.equal(url.pathname,'/rest/v1/locations')
      assert.equal(init.method,'GET')
    }
    const params=init.body===undefined?undefined:JSON.parse(init.body)
    if(rpc==='register'&&params.p_can_insert&&mode==='before')throw Error('simulated upstream transport failure')
    if(rpc==='lookup'&&lookupFault)return Response.json({code:'42501'},{status:403})
    if(rpc==='save'&&beforeSave)await beforeSave()
    const result=await http(url.pathname.slice('/rest/v1'.length)+url.search,params)
    if(rpc)events.push({rpc,status:result.status,code:result.body?.code||null,...(rpc==='register'?{canInsert:params.p_can_insert}:{})})
    if(rpc==='register'&&params.p_can_insert&&mode==='after')throw Error('simulated application response loss')
    return Response.json(result.body,{status:result.status})
  }})
  Object.assign(f.env,{CANDIDATE_SUPABASE_REF:ref,SUPABASE_URL:`https://${ref}.supabase.co`,CANDIDATE_MEDIA_REGISTRY:'true',
    CANDIDATE_SPOTS:JSON.stringify(Object.fromEntries(ids.map(id=>[id,`cloudflare-loop-registry-${id}`])))})
  const post=(path,body)=>f.call(path,{method:'POST',body})
  const save=(id,expectedUpdatedAt,data,extra={})=>f.call(spot(id),{method:'PATCH',body:{expectedUpdatedAt,data,...extra}})
  const remove=(id,expectedUpdatedAt)=>f.call(spot(id),{method:'DELETE',body:{expectedUpdatedAt}})
  const complete=(id,key)=>post(spot(id)+'/image/complete',{key})
  const cancel=(id,key)=>post(spot(id)+'/image/cancel',{key})
  const revoke=(id,key)=>post(spot(id)+'/image/revoke',{key})
  const anon=path=>f.call(path,{auth:false})
  const expect=async(promise,status)=>{
    const response=await promise
    assert.equal(response.status,status,`${response.status} ${status===response.status?'':await response.clone().text()}`)
    return response
  }
  const read=async(promise,status=200)=>(await expect(promise,status)).json()
  async function issue(id){
    const {key,putUrl}=await read(post(spot(id)+'/image/presign',{size:png.length,type:'image/png'}),201)
    assert.match(new URL(putUrl).pathname,new RegExp(`/_candidate-staging/${id}/`))
    await f.stage(key)
    return key
  }
  const attachment=keys=>({image_url:keys[0]?'/'+keys[0]:null,images:keys.map(key=>'/'+key)})
  const rowCount=id=>sql(`select count(*) from jnq_media_private.registry where spot_id=${id};`)
  const saved=async(...args)=>(await read(save(...args))).spot
  const diff=(a,b)=>Object.fromEntries(Object.keys(a).map(key=>[key,b[key]-a[key]]))
  const albumKeys=[]
  let version

  await check('auth_origin_and_legacy_fixture_boundaries',async()=>{
    const id=92001,opts={method:'PATCH',body:{expectedUpdatedAt:null,data:{name:'Denied'}}}
    await expect(f.call(spot(id),{...opts,auth:false}),401)
    await expect(f.call(spot(id),{...opts,requestOrigin:'https://cross-origin.invalid'}),403)
    await expect(save(id,null,{name:'Denied'},{p_can_insert:true,verified:true}),400)
    await expect(save(id,null,{verified:true}),400)
    await expect(post(spot(id)+'/image',{}),503)
    await expect(anon(pub(1)),404)
    const mapping=f.env.CANDIDATE_SPOTS
    f.env.CANDIDATE_MEDIA_REGISTRY='false'
    await expect(anon(pub(id)),503)
    f.env.CANDIDATE_SPOTS='{"1":"cloudflare-loop-fixture-1"}'
    await expect(anon('/media/candidate/92001/00000000-0000-4000-8000-000000000001.png'),404)
    f.env.CANDIDATE_MEDIA_REGISTRY='true'
    await expect(anon(pub(1)),503)
    f.env.CANDIDATE_SPOTS=mapping
    assert.equal(await rowCount(id),'0')
    const sample={p_spot:id,p_key:`media/candidate/${id}/00000000-0000-4000-8000-000000000001.png`}
    const bypass=await http('/rpc/jnq_media_lookup',sample,null)
    assert.equal(bypass.status,401)
    assert.equal(bypass.body.code,'42501')
    const signedUser=await http('/rpc/jnq_media_lookup',sample,authenticated)
    assert.equal(signedUser.status,403)
    assert.equal(signedUser.body.code,'42501')
    const rls=await http(`/locations?id=eq.${id}&select=id`,undefined,null)
    assert.deepEqual(rls.body,[{id}])
    return {directAnonRpc:{status:bypass.status,code:bypass.body.code},
      directAuthenticatedRpc:{status:signedUser.status,code:signedUser.body.code},anonRlsSelect:rls.status}
  })

  for(const n of [1,5,17,30])await check(`first_and_unchanged_${n}_image_save`,async()=>{
    const id=92000+n,keys=[]
    for(let i=0;i<n;i++){
      const key=await issue(id)
      await expect(complete(id,key),201)
      keys.push(key)
    }
    const eventStart=events.length,before=f.counts()
    const next=await saved(id,null,{...attachment(keys),name_cn:'合成',opening_hours:'09:00–18:00',is_visited:false,
      image_metadata:{['/'+keys[0]]:{alt_en:'A'.repeat(2000)}},review_qing:null})
    assert.deepEqual(Object.keys(next).sort(),[...SPOT_FIELDS].sort())
    assert.deepEqual(next.images,attachment(keys).images)
    assert.equal(next.is_visited,false)
    assert.equal(next.review_qing,null)
    assert.equal(next.image_metadata['/'+keys[0]].alt_en.length,2000)
    const first=diff(before,f.counts())
    assert.deepEqual(first,{get:0,head:0,list:2})
    const beforeRepeat=f.counts()
    const again=await saved(id,next.updated_at,attachment(keys))
    const repeated=diff(beforeRepeat,f.counts())
    assert.deepEqual(repeated,{get:0,head:0,list:2})
    assert.deepEqual(events.slice(eventStart).map(event=>event.rpc),['save','save'])
    assert.equal(await rowCount(id),String(n))
    assert.deepEqual((await read(anon(pub(id)))).spot.images,again.images)
    if(n===17){albumKeys.push(...keys);version=again.updated_at}
    return {first,repeated,registered:n,saveRpcPerRequest:1,distinctSnapshotKeys:n}
  })

  await check('complete_cas_duplicate_cancel_and_confirm_only',async()=>{
    const id=92060,key=await issue(id),prior=f.copies(),pause=f.pauseCopy()
    const first=complete(id,key)
    await pause.started
    try {await expect(complete(id,key),409);await expect(cancel(id,key),409)}
    finally {pause.release()}
    await expect(first,201)
    await expect(complete(id,key),201)
    await expect(cancel(id,key),409)
    assert.equal(f.copies()-prior,1)
    assert.equal(await rowCount(id),'1')
    assert.ok(f.objects.has(key)&&f.objects.has(receipt(key)))
    await expect(anon('/'+key),401)
    await expect(f.call('/'+key),200)
    const cancelled=await issue(id)
    await expect(cancel(id,cancelled),200)
    await expect(complete(id,cancelled),409)
    assert.equal(f.objects.has(cancelled),false)
    const invalid=await issue(id)
    await f.env.TEST_MEDIA.put(invalid.replace('media/candidate/','_candidate-staging/'),Buffer.alloc(png.length),{httpMetadata:{contentType:'image/png'}})
    await expect(complete(id,invalid),415)
    assert.equal(f.objects.has(invalid),false)
    assert.equal(f.objects.has(receipt(invalid)),false)
    return {copies:1,insertAttempts:1,confirmOnly:1}
  })

  await check('registry_failure_and_committed_response_loss',async()=>{
    const id=92061,before=await issue(id),after=await issue(id),firstEvent=events.length
    try {
      mode='before';await expect(complete(id,before),503)
      mode=undefined;await expect(complete(id,before),409);await expect(cancel(id,before),409)
      assert.equal(await rowCount(id),'0')
      assert.ok(f.objects.has(before)&&f.objects.has(receipt(before)))
      await expect(f.call('/'+before),404)
      await expect(save(id,null,attachment([before])),409)
      mode='after';await expect(complete(id,after),503)
      mode=undefined;await expect(complete(id,after),201);await expect(cancel(id,after),409)
      assert.equal(await rowCount(id),'1')
      assert.ok(f.objects.has(after)&&f.objects.has(receipt(after)))
      await expect(anon('/'+after),401)
    } finally {mode=undefined}
    return {registry:events.slice(firstEvent).filter(event=>event.rpc==='register'),applicationResponseLoss:true}
  })

  await check('receipt_object_identity_and_unregistered_fail_closed',async()=>{
    const id=92017,[first,second]=albumKeys
    const before=f.objects.get(receipt(first))
    const raw=await expect(anon('/'+first),200)
    assert.deepEqual(Buffer.from(await raw.arrayBuffer()),png)
    await f.env.TEST_MEDIA.put(receipt(first),before.bytes,{httpMetadata:{contentType:'application/json'}})
    await expect(anon('/'+first),404)
    await expect(save(id,version,attachment([first])),409)
    f.objects.set(receipt(first),before)
    const original=f.objects.get(second)
    await f.env.TEST_MEDIA.put(second,original.bytes,{httpMetadata:{contentType:'image/png'}})
    await expect(anon('/'+second),404)
    await expect(save(id,version,attachment([second])),409)
    f.objects.delete(second)
    await expect(f.call('/'+second),404)
    await expect(save(id,version,attachment([second])),409)
    f.objects.set(second,original)
    const [forged]=await f.seedMedia(1,id)
    await expect(save(id,version,{image_url:forged,images:[forged]}),409)
    await expect(f.call(forged),404)
    lookupFault=true
    try {await expect(anon('/'+first),503)}finally{lookupFault=false}
    assert.equal((await read(anon(pub(id)))).spot.updated_at,version)
    return {bytesMatched:true,forgedReceiptCannotPublish:true}
  })

  await check('replacement_after_save_snapshot_still_cannot_serve_bytes',async()=>{
    const id=92017,key=albumKeys[0],original=f.objects.get(key)
    beforeSave=()=>f.env.TEST_MEDIA.put(key,Buffer.alloc(png.length),{httpMetadata:{contentType:'image/png'}})
    try {
      version=(await saved(id,version,attachment(albumKeys))).updated_at
      await expect(anon('/'+key),404)
    } finally {beforeSave=undefined;f.objects.set(key,original)}
    await expect(anon('/'+key),200)
    return {saveObservedPriorSnapshot:true,replacementDenied:true}
  })

  await check('truncated_list_fallback_and_hard_head_budget',async()=>{
    const id=92017,original=f.env.TEST_MEDIA.list
    try {
      f.env.TEST_MEDIA.list=async options=>{
        const listed=await original(options)
        return {...listed,objects:listed.objects.filter(object=>object.key!==albumKeys[0]&&object.key!==receipt(albumKeys[0])),truncated:true}
      }
      const before=f.counts()
      version=(await saved(id,version,attachment(albumKeys))).updated_at
      const fallback=diff(before,f.counts())
      assert.deepEqual(fallback,{get:0,head:2,list:2})
      f.env.TEST_MEDIA.list=async options=>{await original(options);return {objects:[],truncated:true}}
      const start=events.length,baseline=f.counts()
      await expect(save(id,version,attachment(albumKeys)),503)
      const exhausted=diff(baseline,f.counts())
      assert.deepEqual(exhausted,{get:0,head:8,list:2})
      assert.equal(events.length,start)
      assert.equal((await read(anon(pub(id)))).spot.updated_at,version)
      return {fallback,exhausted,saveRpcOnExhaustion:0}
    } finally {f.env.TEST_MEDIA.list=original}
  })

  await check('version_race_withdraw_republish_revoke_delete',async()=>{
    const id=92017,[first,second]=albumKeys
    const results=await Promise.all([save(id,version,{name:'Race A'}),save(id,version,{name:'Race B'})])
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409])
    version=(await results.find(r=>r.ok).json()).spot.updated_at
    await expect(save(id,null,{publication_status:'hidden'}),409)
    const prior=f.counts()
    const hidden=await saved(id,version,{publication_status:'hidden'})
    assert.deepEqual(diff(prior,f.counts()),{get:0,head:0,list:0})
    await expect(anon(pub(id)),404)
    await expect(anon('/'+first),401)
    const live=await saved(id,hidden.updated_at,{publication_status:'published'})
    await expect(anon('/'+first),200)
    await expect(revoke(id,first),200)
    await expect(f.call('/'+first),404)
    await expect(anon('/'+second),401)
    assert.ok(f.objects.has(first)&&f.objects.has(receipt(first)))
    await expect(remove(id,live.updated_at),409)
    const current=(await read(f.call(spot(id)))).spot
    await expect(save(id,current.updated_at,{publication_status:'published'}),409)
    const republished=await saved(id,current.updated_at,{...attachment([second]),publication_status:'published'})
    await expect(anon('/'+second),200)
    await expect(remove(id,republished.updated_at),200)
    await expect(anon('/'+second),404)
    assert.equal(await rowCount(id),'0')
    assert.ok(f.objects.has(second))
    return {concurrentSave:[200,409],withdrawR2Reads:0,revocationTerminal:true,deleteCascaded:true}
  })
}
