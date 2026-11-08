import {readFile,writeFile} from 'node:fs/promises'
import {randomBytes} from 'node:crypto'
import {isolatedKeys,isolatedRequest,ISOLATED_REF} from './isolated-supabase.mjs'
const privatePath='cloudflare/spot-loop/.dev.vars.spot-loop-session'
const publicPath='artifacts/cloudflare-phase3/fixture.json'
const report={projectRef:ISOLATED_REF,productionAccessed:false,sqlExecuted:false}
try {
  const keys=await isolatedKeys()
  let session
  try {session=JSON.parse(await readFile(privatePath,'utf8'))}catch{}
  if(session && session.projectRef!==ISOLATED_REF)throw new Error('PRIVATE_FIXTURE_TARGET_MISMATCH')
  if(!session) {
    const nonce=randomBytes(5).toString('hex')
    session={projectRef:ISOLATED_REF,email:`cloudflare-loop-${nonce}@candidate.invalid`,password:randomBytes(32).toString('base64url'),marker:`JNQ Cloudflare isolated loop ${nonce}`}
    const user=await isolatedRequest(keys,'/auth/v1/admin/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:session.email,password:session.password,email_confirm:true,user_metadata:{purpose:'jnq-cloudflare-isolated-loop'}})})
    if(!user.ok)throw new Error(`ISOLATED_AUTH_CREATE_HTTP_${user.status}`)
    const created=await user.json();session.userId=created.id
    if(!session.userId)throw new Error('ISOLATED_AUTH_USER_ID_MISSING')
    await writeFile(privatePath,JSON.stringify(session),{mode:0o600})
    report.authUserCreated=true
  }
  if(!session.spotId) {
    const response=await isolatedRequest(keys,'/rest/v1/locations?select=id,updated_at',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({name:session.marker,name_cn:'Cloudflare 隔离测试景点',category:'attraction',description:'Isolated Cloudflare publication fixture. No production records.',latitude:1.3,longitude:103.8,status:'active',publication_status:'draft',image_url:null,images:[],experience_zh:'隔离测试内容，尚未发布。',updated_at:new Date().toISOString()})})
    if(!response.ok)throw new Error(`ISOLATED_FIXTURE_CREATE_HTTP_${response.status}`)
    const rows=await response.json();session.spotId=rows[0]?.id
    if(!Number.isSafeInteger(session.spotId)||session.spotId<=0)throw new Error('ISOLATED_FIXTURE_ID_MISSING')
    session.slug=`cloudflare-loop-fixture-${session.spotId}`
    await writeFile(privatePath,JSON.stringify(session),{mode:0o600})
    report.spotCreated=true
  }
  report.fixtureId=session.spotId;report.slug=session.slug;report.testUserId=session.userId;report.testEmail=session.email
  const signIn=await fetch(`https://${ISOLATED_REF}.supabase.co/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:keys.anon,'Content-Type':'application/json'},body:JSON.stringify({email:session.email,password:session.password}),redirect:'error',signal:AbortSignal.timeout(15000)})
  report.realAuthLoginHttpStatus=signIn.status
  // The token response is intentionally not logged or persisted.
  await signIn.body?.cancel()
}catch(error){report.error=/^[A-Z0-9_]+$/.test(error.message)?error.message:'ISOLATED_PREPARATION_FAILED'}
await writeFile(publicPath,JSON.stringify(report,null,2))
console.log(JSON.stringify(report,null,2))
if(report.error)process.exitCode=1
