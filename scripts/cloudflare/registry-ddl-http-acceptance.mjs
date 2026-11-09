// Bounded hosted HTTP verification. No fixture or media mutations.
// Existing isolated Auth login/logout supplies the authenticated-role probe.
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {ISOLATED_REF,ISOLATED_ORIGIN,isolatedKeys} from './isolated-supabase.mjs'

const corrected=process.argv[3]==='--corrected-key-pairing'
assert.deepEqual(process.argv.slice(2),corrected?[ISOLATED_REF,'--corrected-key-pairing']:[ISOLATED_REF])
assert.equal(ISOLATED_REF,'rnamstwwbzknwbjwdgrf')
const evidence=`cloudflare/spot-loop/evidence/media-registry-ddl-http${corrected?'-corrected':''}-2026-11-09.json`
const report={projectRef:ISOLATED_REF,checkedAt:new Date().toISOString(),status:'HTTP_VERIFICATION_FAIL',steps:[],authSessionClosed:false}
if(corrected)report.previousFailureEvidence='media-registry-ddl-http-2026-11-09.json'
const rpcNames=['register','save','withdraw','revoke','delete','lookup'].map(name=>'jnq_media_'+name)
const args={p_spot:92001,p_key:'media/candidate/92001/00000000-0000-4000-8000-000000000001.png'}
let keys,accessToken,stage='local_inputs'
async function request(path,{bearer=keys.service,body,headers={},method=body===undefined?'GET':'POST'}={}){
  const url=new URL(path,ISOLATED_ORIGIN)
  assert.equal(url.origin,ISOLATED_ORIGIN)
  return fetch(url,{method,redirect:'manual',signal:AbortSignal.timeout(15000),
    headers:{apikey:bearer===keys.service?keys.service:keys.anon,Authorization:`Bearer ${bearer}`,'Content-Type':'application/json',...headers},
    ...(body===undefined?{}:{body:JSON.stringify(body)})})
}
async function lookup(name,bearer,status,code){
  stage=name
  const response=await request('/rest/v1/rpc/jnq_media_lookup',{bearer,body:args})
  const data=await response.json()
  const observedCode=/^(?:[A-Z0-9]{5}|PGRST\d+)$/.test(data?.code??'')?data.code:null
  const pass=response.status===status&&(code?observedCode===code:data===null)
  report.steps.push({name,status:response.status,code:observedCode,resultNull:data===null,pass})
  assert.ok(pass)
}
try {
  const credentials=JSON.parse(await readFile('cloudflare/spot-loop/.dev.vars.spot-loop-session','utf8'))
  assert.equal(credentials.projectRef,ISOLATED_REF)
  assert.equal(typeof credentials.email,'string')
  assert.equal(typeof credentials.password,'string')
  keys=await isolatedKeys()
  for(const [key,role] of [[keys.anon,'anon'],[keys.service,'service_role']]){
    const claims=JSON.parse(Buffer.from(key.split('.')[1],'base64url'))
    assert.equal(claims.ref,ISOLATED_REF)
    assert.equal(claims.role,role)
  }
  stage='service_openapi'
  const root=await request('/rest/v1/',{headers:{Accept:'application/openapi+json'}})
  const openapi=await root.json()
  const signatures=Object.fromEntries(rpcNames.map(name=>[name,Object.keys(openapi.paths?.['/rpc/'+name]?.post?.parameters?.find(p=>p.in==='body')?.schema?.properties??{}).sort()]))
  const expected={
    jnq_media_register:['p_spot','p_key','p_size','p_mime','p_etag','p_version','p_receipt_size','p_receipt_etag','p_receipt_version','p_can_insert'],
    jnq_media_save:['p_spot','p_expected_updated_at','p_patch','p_observed'],
    jnq_media_withdraw:['p_spot','p_expected_updated_at'],jnq_media_delete:['p_spot','p_expected_updated_at'],
    jnq_media_revoke:['p_spot','p_key'],jnq_media_lookup:['p_spot','p_key'],
  }
  const pass=root.status===200&&rpcNames.every(name=>JSON.stringify(signatures[name])===JSON.stringify(expected[name].sort()))
  report.steps.push({name:stage,status:root.status,version:openapi.info?.version,signatures,pass})
  assert.ok(pass)
  await lookup('service_lookup',keys.service,200)
  await lookup('anon_lookup',keys.anon,401,'42501')
  stage='existing_fixture_login'
  const login=await request('/auth/v1/token?grant_type=password',{bearer:keys.anon,body:{email:credentials.email,password:credentials.password}})
  const session=await login.json()
  accessToken=session.access_token
  const authenticated=login.status===200&&typeof accessToken==='string'&&session.user?.id===credentials.userId&&session.user?.role==='authenticated'
  report.steps.push({name:stage,status:login.status,existingUserMatched:authenticated,pass:authenticated})
  assert.ok(authenticated)
  await lookup('authenticated_lookup',accessToken,403,'42501')
  for(const profile of ['Accept-Profile','Content-Profile']){
    stage='private_schema_'+profile.toLowerCase()
    const response=await request(profile==='Accept-Profile'?'/rest/v1/registry?select=spot_id':'/rest/v1/rpc/jnq_media_lookup',{
      headers:{[profile]:'jnq_media_private'},...(profile==='Content-Profile'?{body:args}:{})})
    const data=await response.json()
    const pass=response.status===406&&data.code==='PGRST106'
    report.steps.push({name:stage,status:response.status,code:/^PGRST\d+$/.test(data?.code??'')?data.code:null,pass})
    assert.ok(pass)
  }
  report.status='HTTP_VERIFICATION_PASS'
} catch {
  report.failureStage=stage
  process.exitCode=1
} finally {
  if(accessToken){
    try {
      const logout=await request('/auth/v1/logout',{bearer:accessToken,method:'POST'})
      await logout.body?.cancel()
      report.authSessionClosed=logout.ok
      if(!logout.ok){report.status='HTTP_VERIFICATION_FAIL';report.failureStage='fixture_logout';process.exitCode=1}
    } catch {report.status='HTTP_VERIFICATION_FAIL';report.failureStage='fixture_logout';process.exitCode=1}
  }
  await writeFile(evidence,JSON.stringify(report,null,2)+'\n',{flag:'wx'})
  console.log(JSON.stringify(report,null,2))
}
