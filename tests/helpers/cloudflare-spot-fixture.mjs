import assert from 'node:assert/strict'
import {createWorker} from '../../cloudflare/spot-loop/worker.mjs'

const origin='https://codex-cloudflare-free-migrat.jnqjourney-spot-loop-migration-candidate.pages.dev'
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF5kAAAAASUVORK5CYII=','base64')
const base='/api/candidate/spots/1'
export function fixture({workerFactory=createWorker,upstream,ids=[1,2,3]}={}) {
  const objects=new Map(),calls=[],deletes=[]
  const rows=new Map(ids.map(id=>[String(id),{
    id,name:`Synthetic ${id}`,name_cn:`合成 ${id}`,status:'active',publication_status:null,
    updated_at:'2026-11-09T00:00:00Z',images:[],image_url:null,redirect_url:null,
  }]))
  const head=key=>{const object=objects.get(key);return object?{key,size:object.bytes.length,etag:object.etag,version:object.version,httpMetadata:object.metadata}:null}
  let copies=0,version=0,reads=0,lists=0,gets=0,heads=0,releaseCopy,copyBarrier,copyStarted,receiptFault=false
  const media={
    async put(key,body,options={}) {
      if(options.onlyIf&&objects.get(key)?.etag!==options.onlyIf.etagMatches)return null
      // Capture the conditional decision before yielding, as an atomic R2 put.
      if(options.onlyIf)objects.get(key).etag='claimed'
      const bytes=Buffer.from(await new Response(body).arrayBuffer())
      const object={bytes,etag:`etag-${++version}`,version:`version-${version}`,metadata:options.httpMetadata}
      objects.set(key,object)
      if(receiptFault&&key.startsWith('_candidate-validation/'))throw new Error('Ambiguous receipt transport failure')
      return head(key)
    },
    async get(key,options={}) {
      reads++;gets++
      const object=objects.get(key)
      if(!object)return null
      const data=options.range?object.bytes.subarray(0,options.range.length):object.bytes
      return {...head(key),body:new Blob([data]).stream(),arrayBuffer:async()=>Uint8Array.from(data).buffer,json:async()=>JSON.parse(object.bytes.toString())}
    },
    async head(key){reads++;heads++;return head(key)},
    async list(options){reads++;lists++;const keys=[...objects.keys()].filter(key=>key.startsWith(options.prefix)).sort();return {objects:keys.slice(0,options.limit).map(head),truncated:keys.length>options.limit,cursor:keys.length>options.limit?'synthetic-next':undefined}},
    async delete(keys){for(const key of Array.isArray(keys)?keys:[keys]){deletes.push(key);objects.delete(key)}},
  }
  const env={ENVIRONMENT:'isolated-candidate',CANDIDATE_SUPABASE_REF:'abcdefghijklmnopqrst',SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',SUPABASE_ANON_KEY:'synthetic-anon',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',ADMIN_EMAILS:'admin@fixture.invalid',CANDIDATE_SPOTS:JSON.stringify(Object.fromEntries([...rows.keys()].map(id=>[id,`cloudflare-loop-fixture-${id}`]))),CANDIDATE_NOTE_PATHS:'["/notes/cloudflare-loop-note"]',CANDIDATE_WRITES_ENABLED:'true',CANDIDATE_R2_ACCESS_KEY_ID:'synthetic-access',CANDIDATE_R2_SECRET_ACCESS_KEY:'synthetic-secret',TEST_MEDIA:media,ASSETS:{fetch:async()=>new Response('Not found',{status:404})}}
  const worker=workerFactory(async(raw,init)=>{
    const url=new URL(raw)
    if(url.host.endsWith('r2.cloudflarestorage.com')){
      copies++;copyStarted?.()
      if(copyBarrier)await copyBarrier
      const key=url.pathname.split('/').slice(2).join('/'),source=init.headers['x-amz-copy-source'].split('/').slice(2).join('/')
      const object=objects.get(source)
      if(!object)return new Response('missing',{status:404})
      await media.put(key,object.bytes,{httpMetadata:object.metadata})
      return new Response('<CopyObjectResult/>')
    }
    assert.equal(url.origin,env.SUPABASE_URL)
    if(url.pathname.endsWith('/auth/v1/user'))return init.headers.Authorization==='Bearer synthetic-token'?
      Response.json({id:'synthetic-admin',email:'admin@fixture.invalid',email_confirmed_at:'2026-01-01'}):new Response(null,{status:401})
    calls.push({method:init.method,url})
    if(upstream)return upstream(url,init)
    const id=url.searchParams.get('id').slice(3),row=rows.get(id)
    if(!row)return Response.json([])
    if(['PATCH','DELETE'].includes(init.method)){
      const expected=row.updated_at===null?'is.null':`eq.${row.updated_at}`
      if(url.searchParams.get('updated_at')!==expected)return Response.json([])
      if(init.method==='DELETE'){rows.delete(id);return Response.json([row])}
      Object.assign(row,JSON.parse(init.body))
    }
    return Response.json([row])
  })
  const call=(route,{method='GET',body,auth=true,requestOrigin=origin}={})=>worker.fetch(new Request(origin+route,{method,headers:{Origin:requestOrigin,'Content-Type':'application/json',...(auth?{Cookie:'__Host-jnq-candidate=synthetic-token'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})}),env)
  const save=(data,expected=rows.get('1')?.updated_at)=>call(base,{method:'PATCH',body:{expectedUpdatedAt:expected,data}})
  async function seedMedia(count,id=1) {
    const paths=[]
    for(let i=0;i<count;i++){
      const key=`media/candidate/${id}/${crypto.randomUUID()}.png`
      const object=await media.put(key,png,{httpMetadata:{contentType:'image/png'}})
      await media.put(`_candidate-validation/${id}/${key.split('/').at(-1)}.json`,JSON.stringify({schemaVersion:1,key,fixtureId:String(id),size:png.length,etag:object.etag,version:object.version,contentType:'image/png',signatureChecked:true}),{httpMetadata:{contentType:'application/json'}})
      paths.push('/'+key)
    }
    return paths
  }
  async function issue(){return (await(await call(base+'/image/presign',{method:'POST',body:{size:png.length,type:'image/png'}})).json()).key}
  async function stage(key){await media.put(key.replace('media/candidate/','_candidate-staging/'),png,{httpMetadata:{contentType:'image/png'}})}
  const finish=(key,cancel=false)=>call(base+'/image/'+(cancel?'cancel':'complete'),{method:'POST',body:{key}})
  return {env,rows,objects,calls,deletes,call,save,seedMedia,issue,stage,finish,copies:()=>copies,reads:()=>reads,counts:()=>({get:gets,head:heads,list:lists}),
    pauseCopy(){let startedResolve;const started=new Promise(resolve=>{startedResolve=resolve});copyStarted=startedResolve;copyBarrier=new Promise(resolve=>{releaseCopy=resolve});return {started,release:()=>releaseCopy()}},
    faultReceipt(){receiptFault=true},
  }
}

export {origin,png,base}
