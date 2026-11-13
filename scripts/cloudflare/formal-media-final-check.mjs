import assert from 'node:assert/strict'
import path from 'node:path'
import {readFile,writeFile} from 'node:fs/promises'
import {createHash,randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {getFormalKey} from './formal-read-source.mjs'
import {privateWranglerToken,ACCOUNT} from './candidate-cloudflare.mjs'
const ref='vrufunuomioczocdsoer',base=`https://${ref}.supabase.co`,origin='https://read-only.jnqjourney-admin-formal.pages.dev'
assert.deepEqual(process.argv.slice(2),['--confirm-enabled',ref])
const root=path.resolve(process.env.JNQ_RECOVERY_WORKSPACE||'.'),dir=path.join(root,'production-publisher/media-resume-20261113')
const json=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,'')),hash=b=>createHash('sha256').update(b).digest('hex')
const settings=await json(path.join(root,'production-publisher/settings.json'));process.env.JNQ_SUPABASE_CLI=settings.supabaseCli;process.env.JNQ_WRANGLER_CLI=settings.wranglerCli
const roles=await json(path.join(root,'production-publisher/verified-operator-allowlists.json')),f=await json(path.join(dir,'fixtures.json'))
assert.equal((await json(path.join(dir,'acceptance.json'))).result,'FORMAL_MEDIA_ADMISSION_PASS')
const key=(await json('artifacts/cloudflare-static-recovery/.public-read-key.json')).apiKey
const db=createClient(base,await getFormalKey(),{auth:{persistSession:false,autoRefreshToken:false}}),user=createClient(base,key,{auth:{persistSession:false,autoRefreshToken:false}})
const checks=[],result={result:'PENDING',checks,publication:false,photoUploadedThisCheck:false}
let access
const check=(v,name)=>{assert.ok(v,name);checks.push(name)}
async function call(route,method='GET',body,token=access){const r=await fetch(base+'/functions/v1/jnq-admin-formal/'+route,{method,headers:{Origin:origin,apikey:key,Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json','X-JnQ-Mutation-Id':randomUUID()}:{})},body:body?JSON.stringify(body):undefined,redirect:'error'});return {status:r.status,data:await r.json()}}
try{
 const operator=await db.auth.admin.getUserById(roles.editorAuthIds[0]);assert.ok(!operator.error)
 const link=await db.auth.admin.generateLink({type:'magiclink',email:operator.data.user.email});assert.ok(!link.error)
 const login=await user.auth.verifyOtp({type:'magiclink',token_hash:link.data.properties.hashed_token});assert.ok(!login.error&&login.data.user.id===roles.editorAuthIds[0]);access=login.data.session.access_token
 let r=await call('session');check(r.status===200&&r.data.writesEnabled&&r.data.uploadsEnabled&&!r.data.publishingEnabled,'actual_upload_on_text_on_publication_off')
 r=await call('upload/r2/presign','POST',{},key);check(r.status===401,'anonymous_actual_upload_denied')
 r=await call('publication','POST',{});check(r.status===405,'actual_publication_denied')
 r=await call('upload/r2','POST',{});check(r.status===405,'legacy_whole_file_upload_refused')
 const common={type:'image/png',size:f.size,sha256:f.sha256,rightsEvidence:'Self-generated bounded acceptance',binding:{kind:'spot',target:'new',expectedVersion:null}}
 r=await call('upload/r2/presign','POST',{...common,size:10485761});check(r.status===400,'actual_10mib_limit_enforced_before_grant')
 r=await call('upload/r2/presign','POST',{...common,type:'text/plain'});check(r.status===400,'actual_unknown_mime_enforced_before_grant')
 r=await call('upload/r2/presign','POST',common);check(r.status===201&&r.data.expiresIn===120,'actual_presign_route_enabled')
 const ticket={ticket:r.data.ticket,revision:r.data.revision}
 r=await call('upload/r2/cancel','POST',ticket);check(r.status===201&&r.data.cancelled,'actual_unuploaded_ticket_cancelled')
 r=await call('upload/r2/complete','POST',ticket);check(r.status===409,'cancelled_ticket_cannot_complete')
 const disabled=await fetch(base+'/functions/v1/jnq-admin-media-check/scope',{headers:{apikey:key,Authorization:'Bearer '+access},redirect:'error'});check(disabled.status===405,'temporary_admission_endpoint_disabled');await disabled.body?.cancel()
 const b=db.storage.from('jnq-admin-formal-publication'),original=(await json(path.join(root,'production-publisher/text-activation-20261113/bootstrap-input.json'))).authority
 for(const name of ['notes','guides']){const pointer=await b.download('_system/'+name+'-latest.webp');assert.ok(!pointer.error);const body=await b.download((await pointer.data.text()).trim());assert.ok(!body.error);const rows=JSON.parse(await body.data.text());for(const old of JSON.parse(original[name].bytes)){const row=rows.find(v=>v.slug===old.slug);assert.deepEqual(row,old)}check(true,'original_'+name+'_unchanged')}
 const spot=await db.from('locations').select('id,publication_status,image_url,images').eq('id',853).single();check(!spot.error&&spot.data.publication_status==='hidden'&&!spot.data.image_url&&!spot.data.images.length,'test_spot_hidden_no_revoked_reference')
 const token=await privateWranglerToken();const p=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/pages/projects/jnqjourney-static-recovery-candidate`,{headers:{Authorization:'Bearer '+token},redirect:'error'}),project=(await p.json()).result;check(p.ok&&project.canonical_deployment.id==='333e51aa-506e-4a66-a7c6-4f28e3e890a1'&&!project.canonical_deployment.uses_functions,'public_production_unchanged_zero_functions')
 const h=await fetch('https://www.jnqjourney.com/_publication.json',{redirect:'error',cache:'no-store'}),bytes=Buffer.from(await h.arrayBuffer()),backup=await json(path.join(root,'static-backup-result.json'));check(h.status===200&&hash(bytes)===backup.receiptSha256,'www_actual_publication_receipt_unchanged')
 result.result='FORMAL_MEDIA_ENABLED_PASS'
}catch{result.result='FORMAL_MEDIA_ENABLED_FAIL';process.exitCode=1}
finally{if(access){const r=await user.auth.signOut({scope:'local'});result.testSessionRevoked=!r.error}await writeFile(path.join(dir,'final-check.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result))}
