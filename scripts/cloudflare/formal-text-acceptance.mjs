// One bounded real first-stage test. Uses official Auth APIs, no password or
// token is printed/persisted. Never sends email, creates a user or edits live content.
import assert from 'node:assert/strict'
import path from 'node:path'
import {readFile,writeFile} from 'node:fs/promises'
import {createClient} from '@supabase/supabase-js'
import {randomUUID} from 'node:crypto'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {getFormalKey} from './formal-read-source.mjs'
const ref='vrufunuomioczocdsoer',base=`https://${ref}.supabase.co`,origin='https://read-only.jnqjourney-admin-formal.pages.dev'
assert.deepEqual(process.argv.slice(2),['--approved-private-drafts',ref])
const root=path.resolve(process.env.JNQ_RECOVERY_WORKSPACE||'.'),dir=path.join(root,'production-publisher/text-activation-20261113')
const json=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,''))
const s=await json(path.join(root,'production-publisher/settings.json')),roles=await json(path.join(root,'production-publisher/verified-operator-allowlists.json'))
assert.equal(s.enabled,false);assert.equal(s.formalUploadsEnabled,false);assert.equal(s.formalPublishingEnabled,false)
process.env.JNQ_SUPABASE_CLI=s.supabaseCli
const publicConfig=await json('artifacts/cloudflare-static-recovery/.public-read-key.json');assert.equal(publicConfig.projectRef,ref)
const service=createClient(base,await getFormalKey(),{auth:{persistSession:false,autoRefreshToken:false}})
const client=createClient(base,publicConfig.apiKey,{auth:{persistSession:false,autoRefreshToken:false}})
const result={result:'PENDING',tests:[],writesOnlyUnpublishedDrafts:true,created:{},cloudflareDeploymentRequested:false}
let access,phase='session'
async function request(route,method='GET',body,id=randomUUID(),token=access){const r=await fetch(base+'/functions/v1/jnq-admin-formal'+route,{method,headers:{Origin:origin,apikey:publicConfig.apiKey,Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json','X-JnQ-Mutation-Id':id}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(45000)});const data=await r.json();result.lastResponse={route,method,status:r.status,...(/^[A-Z0-9_]+$/.test(data.error||'')?{error:data.error}:{})};return {status:r.status,data}}
function check(condition,name){assert.ok(condition,name);result.tests.push(name)}
try{
 assert.equal(roles.editorAuthIds.length,1)
 const operator=await service.auth.admin.getUserById(roles.editorAuthIds[0]);assert.ok(!operator.error&&operator.data.user.email_confirmed_at)
 // Official server-generated sign-in link, verified with Auth. It is not
 // emailed or exposed. This test session is revoked locally in finally.
 const link=await service.auth.admin.generateLink({type:'magiclink',email:operator.data.user.email})
 assert.ok(!link.error&&link.data.properties.hashed_token)
 const login=await client.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:'magiclink'})
 assert.ok(!login.error&&login.data.user.id===roles.editorAuthIds[0]&&login.data.session)
 access=login.data.session.access_token
 let r=await request('/session');check(r.status===200&&r.data.writesEnabled===true&&r.data.uploadsEnabled===false&&r.data.publishingEnabled===false,'verified_admin_text_only')
 const direct=await fetch(base+'/rest/v1/locations?select=id,review_jayden&limit=1',{headers:{apikey:publicConfig.apiKey,Authorization:'Bearer '+publicConfig.apiKey},redirect:'error'});check([401,403].includes(direct.status)&&(await direct.json()).code==='42501','anonymous_direct_read_denied')
 r=await request('/admin/locations','GET',undefined,undefined,publicConfig.apiKey);check(r.status===401,'anonymous_edge_read_denied')
 for(const route of ['/upload/r2','/publication']){r=await request(route,'POST',{});check(r.status===405,'disabled_'+route)}
 const mark='formal-text-check-'+Date.now()
 phase='spot-create'
 let body={data:{name:mark,name_cn:'正式文字保存验收草稿',latitude:0,longitude:0,status:'active',publication_status:'draft',description:'Private first-stage acceptance. Not published.'}},id=randomUUID()
 r=await request('/admin/locations','POST',body,id);check(r.status===200&&Number.isSafeInteger(r.data.data?.id),'spot_create')
 const spot=r.data.data;result.created.spotId=spot.id
 const first=JSON.stringify(r.data)
 r=await request('/admin/locations','POST',body,id);check(r.status===200&&JSON.stringify(r.data)===first,'spot_duplicate_create_exact_receipt')
 r=await request('/admin/locations?id='+spot.id);check(r.status===200&&r.data.data.publication_status==='draft'&&r.data.data.name===mark,'spot_draft_readback')
 body={id:spot.id,expectedUpdatedAt:spot.updated_at,data:{description:'Updated private acceptance draft.'}};id=randomUUID()
 r=await request('/admin/locations','PATCH',body,id);check(r.status===200,'spot_update');const saved=JSON.stringify(r.data)
 r=await request('/admin/locations','PATCH',body,id);check(r.status===200&&JSON.stringify(r.data)===saved,'spot_duplicate_update_exact_receipt')
 r=await request('/admin/locations','PATCH',body);check(r.status===409,'spot_stale_409')
 for(const kind of ['notes','guides']){
  phase=kind
  const single=kind==='notes'?'note':'guide',slug=mark+'-'+single
  let payload=kind==='notes'?{slug,title:'Private Note acceptance',published:false,blocks:[{id:'paragraph-1',type:'paragraph',content:'Unpublished initial paragraph.'}]}:{slug,title:'Private Guide acceptance',published:false,days:[]}
  id=randomUUID();r=await request('/admin/'+kind,'POST',payload,id);check(r.status===200&&r.data[single]?.published===false,kind+'_create_draft')
  result.created[single+'Slug']=slug
  const created=r.data[single],first=JSON.stringify(r.data)
  r=await request('/admin/'+kind,'POST',payload,id);check(r.status===200&&JSON.stringify(r.data)===first,kind+'_duplicate_create_exact_receipt')
  payload={...created,title:'Updated private '+single+' acceptance',previousSlug:slug,expectedUpdatedAt:created.updatedAt||''}
  id=randomUUID();r=await request('/admin/'+kind,'POST',payload,id);check(r.status===200&&r.data[single]?.title===payload.title,kind+'_update')
  const updated=JSON.stringify(r.data)
  r=await request('/admin/'+kind,'POST',payload,id);check(r.status===200&&JSON.stringify(r.data)===updated,kind+'_duplicate_update_exact_receipt')
  r=await request('/admin/'+kind,'POST',payload);check(r.status===409,kind+'_stale_409')
  r=await request('/admin/'+kind);check(r.status===200&&r.data[kind].some(v=>v.slug===slug&&v.title===payload.title&&v.published===false),kind+'_private_readback')
 }
 phase='final-read'
 r=await request('/admin/locations?id='+spot.id);check(r.status===200&&r.data.data.publication_status==='draft'&&r.data.data.description==='Updated private acceptance draft.','spot_final_private_state')
 const receipt=await request('/admin/mutations/'+id);check(receipt.status===200,'own_mutation_receipt_access')
 const hideBody={id:spot.id,expectedUpdatedAt:r.data.data.updated_at,data:{publication_status:'hidden'}}
 r=await request('/admin/locations','PATCH',hideBody);check(r.status===200,'spot_hide_private_draft')
 r=await request('/admin/locations?id='+spot.id);check(r.status===200&&r.data.data.publication_status==='hidden','spot_hidden_readback')
 const slugBody={id:spot.id,slug:mark,expectedUpdatedAt:r.data.data.updated_at};id=randomUUID()
 r=await request('/admin/location-slugs','POST',slugBody,id);check(r.status===200,'spot_private_slug_save')
 r=await request('/admin/location-slugs?id='+spot.id);check(r.status===200&&r.data.slug===mark,'spot_slug_readback')
 result.result='FORMAL_TEXT_REAL_SAVE_PASS'
}catch{
 result.result='FORMAL_TEXT_REAL_SAVE_FAIL';result.failedPhase=phase
 // A failed real activation test closes the server write switch first.
 try{await promisify(execFile)(process.execPath,['scripts/cloudflare/formal-text-deploy.mjs','--disable-writes',ref],{env:process.env,windowsHide:true,timeout:60000,maxBuffer:1024*1024});result.writesDisabledAfterFailure=true}catch{result.disableStatus='UNKNOWN_REQUIRES_IMMEDIATE_RECONCILIATION'}
 process.exitCode=1
}finally{
 if(access){const out=await client.auth.signOut({scope:'local'});result.testSessionRevocation=!out.error}
 await writeFile(path.join(dir,'acceptance.json'),JSON.stringify(result,null,2),{flag:'wx'})
 console.log(JSON.stringify(result))
}
