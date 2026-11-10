import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {isolatedKeys,isolatedRequest} from './isolated-supabase.mjs'
const root='artifacts/cloudflare-p0-consumers/'
const resume=process.argv.includes('--resume-redacted-path')
const d=JSON.parse(await readFile(root+'deployment-resumed.json'))
assert.ok(d.success&&d.environment==='preview'&&Date.now()<d.expiresAt*1000)
const report={deploymentId:d.deploymentId,origin:d.origin,startedAt:new Date().toISOString(),checks:[],budget:24,success:false,formalMigration:'HOLD'}
const file=root+(resume?'native-resumed.json':'native-acceptance.json')
if(resume){
  const failed=JSON.parse(await readFile(root+'native-acceptance.json'))
  const tail=JSON.parse(await readFile(root+'runtime-events.json'))
  assert.ok(failed.error==='TRACE_MISMATCH'&&failed.checks.length===7&&tail.deploymentId===d.deploymentId)
  for(const check of failed.checks){
    const event=tail.events.find(item=>item.acceptanceId===check.acceptanceId)
    const redacted=check.path.replace(/^(\/media\/candidate\/92061\/)[a-f0-9-]+(\.png)$/,'$1REDACTED$2')
    assert.ok(event&&event.status===check.status&&event.method==='GET'&&[check.path,redacted].includes(event.path)&&event.outcome==='ok'&&Number.isFinite(event.cpuTime)&&event.cpuTime<=10)
  }
  report.checks.push(...failed.checks)
  report.priorObserverError=failed.error
  report.originalImageCpuConfirmedMs=5
}
await writeFile(file,JSON.stringify(report),{flag:'wx'})
const persist=()=>writeFile(file,JSON.stringify(report,null,2)+'\n')
let keys,version=d.fixtureVersion
async function call(label,path,status=200){
  assert.ok(report.checks.length<report.budget)
  const acceptanceId=Date.now()+'-'+report.checks.length
  const response=await fetch(d.origin+path,{headers:{'X-JnQ-Acceptance':acceptanceId},redirect:'manual',signal:AbortSignal.timeout(15000)})
  const bytes=Buffer.from(await response.arrayBuffer())
  const record={label,path,acceptanceId,status:response.status,bytes:bytes.length};report.checks.push(record);await persist()
  let event
  for(let i=0;i<300;i++){
    const tail=JSON.parse(await readFile(root+'runtime-events.json'))
    assert.ok(tail.deploymentId===d.deploymentId&&!tail.diagnostics.parseErrors&&!tail.diagnostics.truncatedEvents)
    event=tail.events.find(item=>item.acceptanceId===acceptanceId)
    if(event)break
    await new Promise(resolve=>setTimeout(resolve,100))
  }
  if(!event)throw Error('NATIVE_CPU_NOT_OBSERVED')
  Object.assign(record,{cpuMs:event.cpuTime,wallMs:event.wallTime,operations:event.operations});await persist()
  const expectedPath=new URL(d.origin+path).pathname
  const redacted=expectedPath.replace(/^(\/media\/candidate\/92061\/)[a-f0-9-]+(\.png)$/,'$1REDACTED$2')
  assert.ok([expectedPath,redacted].includes(event.path)&&event.method==='GET'&&event.status===response.status&&event.outcome==='ok','TRACE_MISMATCH')
  if(!Number.isFinite(event.cpuTime)||event.cpuTime>10)throw Error('CPU_LIMIT_EXCEEDED')
  if(event.cpuTime>=8)record.cpuMargin=event.cpuTime===10?'CRITICAL_10MS':'LOW_8_9MS'
  assert.equal(response.status,status);assert.match(response.headers.get('cache-control'),/no-store/)
  return {response,bytes}
}
try{
  keys=await isolatedKeys()
  if(!resume){
  const rows=JSON.parse((await call('live_projection','/public-data/spots/records.json')).bytes).locations
  assert.deepEqual(rows.map(row=>row.id),[92061]);assert.equal(rows[0].publication_status,null);assert.ok(!Object.hasOwn(rows[0],'review_jayden'))
  for(const key of ['regions.json','guides.json','notes.json','i18n/en/records.json','guide-trip-costs.json']){
    const {bytes}=await call('private_feed_'+key,'/public-data/'+key)
    assert.ok(!bytes.toString().includes('pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev'))
    const value=JSON.parse(bytes)
    if(key==='guides.json')assert.equal(value.guides.length,7)
    if(key==='notes.json')assert.equal(value.notes.length,6)
  }
  const image=await call('published_image',d.mediaPath)
  assert.equal(createHash('sha256').update(image.bytes).digest('hex'),'5e3d382db4dd83d59aa5742793ad6b7903409e865c83bcbc54835049f043bc15')
  }
  await call('field_injection','/api/locations?select=review_jayden',404)
  await call('static_json_denied','/_next/data/old/spot/consumer-fixture-92061.json',404)
  await call('static_html_denied','/spot/consumer-fixture-92061.html',404)
  if(!resume){
    const withdrawal=await isolatedRequest(keys,'/rest/v1/rpc/jnq_media_withdraw',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_spot:92061,p_expected_updated_at:version})})
    assert.ok(withdrawal.ok);version=(await withdrawal.json()).updated_at
  }
  assert.deepEqual(JSON.parse((await call('hidden_live_projection','/public-data/spots/records.json')).bytes).locations,[])
  await call('hidden_image',d.mediaPath,404)
  report.success=true
}catch(error){report.error=/^[A-Z_0-9]+$/.test(error.message)?error.message:'CONSUMER_NATIVE_FAILED';process.exitCode=1}
// Only fixture withdrawal is permitted after a stop; no compensating delete.
if(keys){
  const state=await isolatedRequest(keys,'/rest/v1/locations?select=id,updated_at,publication_status&id=eq.92061')
  if(state.ok){const [row]=await state.json();if(row?.publication_status!=='hidden'){
    const result=await isolatedRequest(keys,'/rest/v1/rpc/jnq_media_withdraw',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_spot:92061,p_expected_updated_at:row.updated_at})})
    report.safetyWithdrawalConfirmed=result.ok
  }else report.safetyWithdrawalConfirmed=true}
}
report.finishedAt=new Date().toISOString();await persist();console.log(JSON.stringify(report,null,2))
