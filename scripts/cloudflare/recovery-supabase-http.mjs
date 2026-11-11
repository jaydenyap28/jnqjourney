// One disposable Auth, Data API and Storage run in the existing isolated project.
import assert from 'node:assert/strict'
import {randomBytes,createHash} from 'node:crypto'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import Module from 'node:module'
import path from 'node:path'
import ts from 'typescript'
import {isolatedKeys,ISOLATED_ORIGIN,ISOLATED_REF} from './isolated-supabase.mjs'

assert.deepEqual(process.argv.slice(2),['--isolated-http'])
assert.equal(ISOLATED_REF,'rnamstwwbzknwbjwdgrf')
const report={checkedAt:new Date().toISOString(),project:ISOLATED_REF,tests:[],cleanup:[]}
const folder='artifacts/cloudflare-static-cutover-implementation'
await mkdir(folder,{recursive:true})
const nonce=randomBytes(7).toString('hex')
const name='JNQ cutover fixture '+nonce,bucket='jnq-cutover-'+nonce
const id=940000000+randomBytes(3).readUIntBE(0,3)
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSGUAAAAASUVORK5CYII=','base64')
const digest=bytes=>createHash('sha256').update(bytes).digest('hex')
const users=[]
let bucketCreated=false,objectCreated=false,rowCreated=false
let key
async function http(resource,{role='service',token,method='GET',json,body,headers={}}={}){
  assert.match(resource,/^\/(?:rest|auth|storage)\/v1\//)
  const url=new URL(resource,ISOLATED_ORIGIN)
  assert.equal(url.origin,ISOLATED_ORIGIN)
  const apiKey=role==='service'?key.service:key.anon
  return fetch(url,{method,headers:{apikey:apiKey,Authorization:'Bearer '+(token??apiKey),
    ...(json===undefined?{}:{'Content-Type':'application/json'}),...headers},
    body:json===undefined?body:JSON.stringify(json),redirect:'error',signal:AbortSignal.timeout(15000)})
}
function check(name,response,allowed){
  report.tests.push({name,http:response.status,pass:allowed.includes(response.status)})
  assert.ok(allowed.includes(response.status),`${name}_HTTP_${response.status}`)
}
const result=(name,pass)=>{report.tests.push({name,pass});assert.ok(pass,name)}
const record='/rest/v1/locations?id=eq.'+id
const object='/storage/v1/object/'+bucket+'/draft.png'
async function login(role){
  const email=`jnq-cutover-${role}-${nonce}@candidate.invalid`,password=randomBytes(25).toString('base64url')
  const created=await http('/auth/v1/admin/users',{method:'POST',json:{email,password,email_confirm:true,user_metadata:{purpose:'synthetic-static-cutover'}}})
  check(role+'-fixture-create',created,[200,201])
  const data=await created.json()
  assert.match(data.id,/^[a-f0-9-]{36}$/)
  users.push(data.id)
  const logged=await http('/auth/v1/token?grant_type=password',{role:'anon',method:'POST',json:{email,password}})
  check(role+'-login',logged,[200])
  const {access_token}=await logged.json()
  assert.ok(typeof access_token==='string'&&access_token.length>0)
  return {email,token:access_token}
}
async function createGuard(){
  // Run the actual Next auth guard as CommonJS using the repo's TypeScript.
  const file=path.resolve('lib/server/admin-auth.ts')
  const source=ts.transpileModule(await readFile(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
  const mod=new Module(file)
  mod.filename=file
  mod.paths=Module._nodeModulePaths(path.dirname(file))
  mod._compile(source,file)
  return mod.exports.requireAdminRequest
}
try{
  key=await isolatedKeys()
  const before=await http(record+'&select=id')
  check('fixture-id-free',before,[200])
  assert.deepEqual(await before.json(),[])
  const create=await http('/rest/v1/locations',{method:'POST',json:{id,name,name_cn:'隔离切换测试',category:'attraction',
    status:'active',publication_status:'draft',latitude:1.3,longitude:103.8,images:[],review_jayden:'synthetic internal'},
    headers:{Prefer:'return=representation'}})
  rowCreated=create.ok
  check('fixture-created',create,[201])
  assert.equal((await create.json())[0]?.name,name)
  const storage=await http('/storage/v1/bucket',{method:'POST',json:{id:bucket,name:bucket,public:false}})
  bucketCreated=storage.ok
  check('private-fixture-bucket',storage,[200,201])
  await storage.body?.cancel()
  const put=await http(object,{method:'POST',body:png,headers:{'Content-Type':'image/png','x-upsert':'false'}})
  objectCreated=put.ok
  check('service-upload',put,[200,201])
  await put.body?.cancel()
  const ordinary=await login('ordinary'),admin=await login('admin')
  Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:ISOLATED_ORIGIN,NEXT_PUBLIC_SUPABASE_ANON_KEY:key.anon,ADMIN_EMAILS:admin.email})
  delete process.env.JNQ_PUBLIC_FEED_ORIGIN
  const requireAdmin=await createGuard()
  const adminRequest=token=>new Request('http://localhost/api/admin/locations',{method:'PATCH',headers:{Authorization:'Bearer '+token}})
  for(const [label,token] of [['anon',undefined],['ordinary',ordinary.token],['admin-direct',admin.token]]){
    const role={role:'anon',token}
    const denied=await http(record+'&select=id,review_jayden,publication_status',role)
    check(label+'-direct-table-denied',denied,[401,403])
    await denied.body?.cancel()
    for(const route of ['/public/','/authenticated/']){
      const bytes=await http('/storage/v1/object'+route+bucket+'/draft.png',role)
      check(label+'-storage'+route,bytes,[400,401,403,404])
      await bytes.body?.cancel()
    }
  }
  const unauthorized=await requireAdmin(adminRequest(ordinary.token))
  check('ordinary-actual-admin-guard',unauthorized.response,[403])
  const authorized=await requireAdmin(adminRequest(admin.token))
  result('admin-actual-auth-guard',authorized.ok)
  // The real application's guard authorizes the server-side call here. The
  // standalone browser admin application is outside this integration test.
  const saved=await http(record+'&name=eq.'+encodeURIComponent(name),{method:'PATCH',json:{publication_status:'hidden',review_jayden:'synthetic saved'},headers:{Prefer:'return=representation'}})
  check('authorized-server-save',saved,[200])
  result('authorized-server-saved-one',(await saved.json()).length===1)
  const reread=await http(record+'&select=id,publication_status,review_jayden')
  check('authorized-server-readback',reread,[200])
  result('authorized-server-readback-value',(await reread.json()).some(row=>row.id===id&&row.publication_status==='hidden'&&row.review_jayden==='synthetic saved'))
  const projected=await http('/rest/v1/rpc/jnq_public_spots',{method:'POST',json:{p_ids:[id]}})
  check('hidden-omitted-in-build-projection',projected,[200])
  result('hidden-absent',JSON.stringify(await projected.json())==='[]')
  const bytes=await http('/storage/v1/object/authenticated/'+bucket+'/draft.png')
  check('server-private-image-readback',bytes,[200])
  result('server-private-bytes-match',digest(Buffer.from(await bytes.arrayBuffer()))===digest(png))
  report.success=true
}catch(error){
  report.success=false
  report.failure=String(error.message).split('\n')[0].slice(0,160)
  process.exitCode=1
}finally{
  const clean=async(name,resource,options)=>{
    try {
      const response=await http(resource,{method:'DELETE',...options})
      report.cleanup.push({name,http:response.status,success:response.ok})
      await response.body?.cancel()
      if(!response.ok)process.exitCode=1
    }catch{report.cleanup.push({name,success:false});process.exitCode=1}
  }
  if(objectCreated)await clean('synthetic-object','/storage/v1/object/'+bucket,{json:{prefixes:['draft.png']}})
  if(bucketCreated)await clean('synthetic-bucket','/storage/v1/bucket/'+bucket)
  if(rowCreated)await clean('synthetic-row',record+'&name=eq.'+encodeURIComponent(name))
  for(const user of users)await clean('synthetic-auth-user','/auth/v1/admin/users/'+user)
  if(report.cleanup.some(item=>!item.success))report.success=false
  await writeFile(path.join(folder,'supabase-isolated-http.json'),JSON.stringify(report,null,2))
}
console.log(JSON.stringify(report))
