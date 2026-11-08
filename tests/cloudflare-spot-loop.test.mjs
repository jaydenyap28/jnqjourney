import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createWorker,config} from '../cloudflare/spot-loop/worker.mjs'

const origin='https://isolated.jnqjourney-spot-loop-migration-candidate.pages.dev'
const id='910001',slug=`cloudflare-loop-fixture-${id}`
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF5kAAAAASUVORK5CYII=','base64'))
function fixture() {
  const row={id:Number(id),name:'Isolated fixture',name_cn:'隔离测试景点',description:'Initial narrative',experience_zh:'',image_url:null,images:[],status:'active',publication_status:'published',updated_at:'2026-11-08T00:00:00.000Z',redirect_url:null,redirect_type:null}
  const objects=new Map(),calls=[],writes=[]
  let outage=false,invalidUser=false,badResponse=false
  const media={
    async put(key,blob,options){objects.set(key,{bytes:await blob.arrayBuffer(),options});return {key}},
    async head(key){return objects.has(key)?{key}:null},
    async get(key){const entry=objects.get(key);return entry?{body:entry.bytes,httpMetadata:entry.options.httpMetadata}:null},
  }
  const env={ENVIRONMENT:'isolated-candidate',CANDIDATE_SUPABASE_REF:'abcdefghijklmnopqrst',SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',SUPABASE_ANON_KEY:'fixture-anon',SUPABASE_SERVICE_ROLE_KEY:'fixture-service-role',ADMIN_EMAILS:'admin@fixture.invalid',CANDIDATE_SPOTS:JSON.stringify({[id]:slug}),CANDIDATE_WRITES_ENABLED:'true',TEST_MEDIA:media,ASSETS:{fetch:async()=>new Response('static',{headers:{'Content-Type':'text/plain'}})}}
  const transport=async(input,init={})=>{
    const url=new URL(input)
    assert.equal(url.origin,env.SUPABASE_URL,'No network operation may target Production')
    assert.equal(init.redirect,'manual');assert.equal(init.cache,'no-store')
    calls.push({url,...init})
    if(url.pathname.startsWith('/auth/')) {
      assert.equal(init.headers.apikey,'fixture-anon')
      if(url.pathname==='/auth/v1/token') {
        const body=JSON.parse(init.body)
        if(url.searchParams.get('grant_type')==='refresh_token')assert.equal(body.refresh_token,'fixture-refresh')
        else {assert.equal(body.email,'admin@fixture.invalid');assert.equal(body.password,'fixture-password')}
        return Response.json({access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:3600})
      }
      assert.equal(init.headers.Authorization,'Bearer fixture-access')
      if(url.pathname==='/auth/v1/logout')return new Response(null,{status:204})
      return Response.json(invalidUser?{id:'other',email:'other@fixture.invalid',email_confirmed_at:'2026-01-01'}:{id:'admin',email:'admin@fixture.invalid',email_confirmed_at:'2026-01-01'})
    }
    assert.equal(url.pathname,'/rest/v1/locations')
    assert.equal(init.headers.Authorization,'Bearer fixture-service-role')
    assert.equal(url.searchParams.get('id'),`eq.${id}`)
    if(outage)return new Response('unavailable',{status:503})
    if(init.method==='PATCH') {
      const body=JSON.parse(init.body)
      if(url.searchParams.get('updated_at')!==`eq.${row.updated_at}`)return Response.json([])
      writes.push(body);Object.assign(row,body)
    }
    return Response.json(badResponse?[{...row,publication_status:undefined}]:[row])
  }
  const worker=createWorker(transport)
  let session=''
  const request=(route,options={})=>{
    const headers=new Headers(options.headers)
    if(session)headers.set('Cookie',session)
    if(options.method&&!['GET','HEAD'].includes(options.method)&&!headers.has('Origin'))headers.set('Origin',origin)
    return worker.fetch(new Request(`${origin}${route}`,{...options,headers}),env)
  }
  const login=async()=>{
    const result=await request('/api/candidate/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@fixture.invalid',password:'fixture-password'})})
    assert.equal(result.status,200)
    const cookies=result.headers.getSetCookie()
    assert.equal(cookies.length,2)
    for(const cookie of cookies){assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);assert.match(cookie,/^__Host-/)}
    session=cookies.map(c=>c.split(';')[0]).join('; ')
    const raw=await result.text();assert.ok(!raw.includes('fixture-access'));assert.ok(!raw.includes('fixture-service-role'))
    return result
  }
  const save=async(data,version=row.updated_at)=>request(`/api/candidate/spots/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedUpdatedAt:version,data})})
  return {env,row,objects,calls,writes,request,login,save,setOutage:v=>outage=v,setInvalidUser:v=>invalidUser=v,setBadResponse:v=>badResponse=v}
}

test('isolated Auth → edit → R2 upload → save → live HTML → immediate withdrawal, no build calls',async()=>{
  const f=fixture();await f.login()
  const loaded=await f.request(`/api/candidate/spots/${id}`)
  assert.equal(loaded.status,200)
  assert.equal((await loaded.json()).spot.id,Number(id))
  const image=await f.request(`/api/candidate/spots/${id}/image`,{method:'POST',headers:{'Content-Type':'image/png'},body:png})
  assert.equal(image.status,201)
  const upload=await image.json()
  assert.ok(f.objects.has(upload.key))
  const oldVersion=f.row.updated_at
  const save=await f.save({name:'Updated fixture',description:'New narrative <script>alert(1)</script>',image_url:upload.url,images:[upload.url]})
  assert.equal(save.status,200)
  assert.equal((await save.json()).buildsTriggered,0)
  assert.notEqual(f.row.updated_at,oldVersion)
  const page=await f.request(`/spot/${slug}`)
  assert.equal(page.status,200)
  const html=await page.text()
  assert.match(html,/New narrative &lt;script&gt;/);assert.ok(!html.includes('<script>alert'))
  assert.ok(html.includes(upload.url));assert.equal(page.headers.get('X-JnQ-Publication-Version'),f.row.updated_at)
  assert.equal(page.headers.get('Cache-Control'),'private, no-store, max-age=0')
  assert.equal((await f.request(upload.url)).status,200)
  assert.equal((await f.save({publication_status:'hidden'})).status,200)
  for(const path of [`/spot/${slug}`,`/en/spot/${slug}`,`/spot/old-alias-${id}`,`/spot/${slug}.html`,`/spot/${slug}.txt`,`/api/candidate/public/spots/${id}`,`/_next/data/old-build/spot/${slug}.json`]) {
    const fresh=fixture() // Request without the editor's cookie, same authoritative row.
    Object.assign(fresh.row,f.row)
    const response=await fresh.request(path)
    assert.equal(response.status,404,path);assert.match(response.headers.get('X-Robots-Tag'),/noindex/)
  }
  assert.ok(f.calls.every(call=>call.url.origin===f.env.SUPABASE_URL))
})
test('all writes require a verified admin, same-origin request and explicit fixture ID',async()=>{
  const f=fixture()
  assert.equal((await f.save({description:'unauthenticated'})).status,401)
  await f.login()
  const cross=await f.request(`/api/candidate/spots/${id}`,{method:'PATCH',headers:{Origin:'https://evil.invalid'},body:'{}'})
  assert.equal(cross.status,403)
  assert.equal((await f.request('/api/candidate/spots/5',{method:'PATCH',body:'{}'})).status,404)
  f.setInvalidUser(true)
  assert.equal((await f.save({description:'not admin'})).status,403)
  assert.equal(f.writes.length,0)
})
test('production project, missing allowlist and unconfigured write switches fail closed',async()=>{
  const f=fixture()
  assert.throws(()=>config({...f.env,CANDIDATE_SUPABASE_REF:'vrufunuomioczocdsoer',SUPABASE_URL:'https://vrufunuomioczocdsoer.supabase.co'}),/Isolated/)
  assert.throws(()=>config({...f.env,ADMIN_EMAILS:''}),/allowlist/)
  assert.throws(()=>config({...f.env,CANDIDATE_SPOTS:'{"5":"spot-5"}'}),/fixture/)
  await f.login();f.env.CANDIDATE_WRITES_ENABLED='false'
  assert.equal((await f.save({description:'disabled'})).status,503)
  assert.equal(f.writes.length,0)
})
test('optimistic version conflict cannot overwrite a later save',async()=>{
  const f=fixture();await f.login();const version=f.row.updated_at
  assert.equal((await f.save({description:'first'},version)).status,200)
  assert.equal((await f.save({description:'stale'},version)).status,409)
  assert.equal(f.row.description,'first');assert.equal(f.writes.length,1)
})
test('unverified source or outage never falls back to stale HTML or media',async()=>{
  const f=fixture();f.setOutage(true)
  assert.equal((await f.request(`/spot/${slug}`)).status,503)
  f.setOutage(false);f.setBadResponse(true)
  assert.equal((await f.request(`/spot/${slug}`)).status,503)
})
test('only validated image types under fixture keys can be uploaded and saved',async()=>{
  const f=fixture();await f.login()
  assert.equal((await f.request(`/api/candidate/spots/${id}/image`,{method:'POST',headers:{'Content-Type':'image/svg+xml'},body:'<svg/>'})).status,415)
  assert.equal((await f.request(`/api/candidate/spots/${id}/image`,{method:'POST',headers:{'Content-Type':'image/png'},body:'not a png'})).status,415)
  assert.equal((await f.request(`/api/candidate/spots/${id}/image`,{method:'POST',headers:{'Content-Type':'image/png','Content-Length':String(11*1024*1024)},body:png})).status,413)
  assert.equal((await f.save({image_url:'https://production.invalid/secret.png'})).status,400)
  assert.equal((await f.save({id:5})).status,400)
  assert.equal((await f.save({image_url:`/media/candidate/${id}/missing.png`})).status,400)
  assert.equal(f.objects.size,0);assert.equal(f.writes.length,0)
})
test('canonical aliases are actual 301s after live visibility check',async()=>{
  const f=fixture()
  const alias=await f.request(`/spot/old-name-${id}`)
  assert.equal(alias.status,301);assert.equal(alias.headers.get('Location'),`/spot/${slug}`)
  f.row.publication_status='hidden'
  assert.equal((await f.request(`/spot/old-name-${id}`)).status,404)
})
test('refresh rotates HttpOnly cookies and logout clears them without exposing tokens',async()=>{
  const f=fixture();await f.login()
  const refresh=await f.request('/api/candidate/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"refresh":true}'})
  assert.equal(refresh.status,200);assert.equal(refresh.headers.getSetCookie().length,2)
  const logout=await f.request('/api/candidate/session',{method:'DELETE'})
  assert.equal(logout.status,200)
  assert.ok(logout.headers.getSetCookie().every(cookie=>cookie.includes('Max-Age=0')))
})
test('the deployable adapter has no Node/Next dependencies and no static Spot fallback',async()=>{
  const source=await readFile(new URL('../cloudflare/spot-loop/worker.mjs',import.meta.url),'utf8')
  assert.ok(!/^import /m.test(source))
  const config=JSON.parse(await readFile(new URL('../cloudflare/spot-loop/pages.wrangler.jsonc',import.meta.url),'utf8'))
  assert.equal(config.r2_buckets[0].bucket_name,'jnqjourney-spot-loop-isolated-media')
  assert.equal(config.vars.CANDIDATE_WRITES_ENABLED,'false')
  assert.ok(!config.vars.SUPABASE_SERVICE_ROLE_KEY)
})
