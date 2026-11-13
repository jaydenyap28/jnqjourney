// Temporary bounded admission endpoint; formal Admin Upload remains OFF.
import {createClient} from 'npm:@supabase/supabase-js@2.93.3'
import {createFormalServices} from './formal-services'
import {FORMAL_PRIVATE_SCOPE} from './formal-runtime.mjs'
import {verifiedFormalIdentity} from './formal-session.mjs'
import {createFormalR2} from './formal-r2-direct.mjs'
const env=(n:string)=>Deno.env.get(n)||'',scope=FORMAL_PRIVATE_SCOPE,origin=`https://${scope.projectRef}.supabase.co`
if(env('SUPABASE_URL')!==origin)throw Error('FORMAL_PROJECT_MISMATCH')
const options={auth:{persistSession:false,autoRefreshToken:false}}
const auth=createClient(origin,env('SUPABASE_ANON_KEY'),options).auth
const db=createClient(origin,env('SUPABASE_SERVICE_ROLE_KEY'),options)
const service=createFormalServices({db,anonKey:env('SUPABASE_ANON_KEY'),scope,env,settings:{privateAuthorityReady:true,anonymousBoundaryReady:true,privateMediaReady:true}})
Deno.serve(async(request:Request)=>{
 const out=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}})
 if(env('JNQ_FORMAL_MEDIA_TEST_ENABLED')!=='true')return out({error:'MEDIA_TEST_DISABLED'},405)
 try{
  const token=request.headers.get('authorization')?.replace(/^Bearer /i,'')||''
  const actor=await verifiedFormalIdentity(token,async (value:string)=>{const r=await auth.getUser(value);return r.error?null:r.data.user})
  if(!actor)return out({error:'UNAUTHORIZED'},401)
  if(!env('JNQ_FORMAL_EDITOR_IDS').split(',').includes(actor))return out({error:'FORBIDDEN'},403)
  if(request.headers.get('origin'))return out({error:'SERVER_TEST_ONLY'},403)
  const action=new URL(request.url).pathname.split('/').at(-1)
  if(action==='scope'&&request.method==='GET')return out(await service.media.probeScope())
  if(action==='expired'&&request.method==='GET')return out(await createFormalR2(env).presign('_admin-formal-drafts/_staging/'+crypto.randomUUID()+'.png','image/png',Number(env('JNQ_FORMAL_MEDIA_TEST_SIZE')),new Date(Date.now()-600000)))
  if(action==='bytes'&&request.method==='GET'){
   const asset=await service.media.get(new URL(request.url).searchParams.get('name')||'',actor)
   return new Response(asset.bytes,{headers:{'Content-Type':asset.type,'Cache-Control':'private, no-store'}})
  }
  if(request.method!=='POST')return out({error:'METHOD'},405)
  const length=Number(request.headers.get('content-length'));if(!length||length>8192)return out({error:'BODY_LIMIT'},413)
  const raw=await request.text();if(raw.length>8192)return out({error:'BODY_LIMIT'},413)
  const body=JSON.parse(raw)
  if(action==='foreign')return out(await service.media.finish(body,'00000000-0000-4000-8000-000000000001'),201)
  if(action==='presign'){
   const targets=JSON.parse(env('JNQ_FORMAL_MEDIA_TEST_TARGETS'))
   if(body.sha256!==env('JNQ_FORMAL_MEDIA_TEST_SHA')||body.type!=='image/png'||body.size>65536||!targets.some((v:any)=>v.kind===body.binding?.kind&&v.target===body.binding?.target))return out({error:'FIXTURE_ONLY'},403)
   return out(await service.media.start(body,actor),201)
  }
  if(action==='complete'||action==='cancel')return out(await service.media.finish(body,actor,action==='cancel'),201)
  return out({error:'NOT_FOUND'},404)
 }catch(error){return out({error:typeof (error as any).code==='string'?(error as any).code:'MEDIA_CHECK_FAILED'},[400,403,404,409,410,413,415,503].includes((error as any).status)?(error as any).status:503)}
})
