// Isolated Spot proof only. No Next.js, Node APIs, AWS SDK, SQL, or cache.
// This file is copied unchanged to Pages _worker.js (module syntax).
const PRODUCTION_REF = 'vrufunuomioczocdsoer'
const SELECT = 'id,name,name_cn,description,image_url,images,status,publication_status,seo_title_zh,seo_description_zh,seo_title_en,seo_description_en,experience_zh,experience_en,address,updated_at,redirect_url,redirect_type'
const MAX_IMAGE = 10 * 1024 * 1024
const COOKIE = '__Host-jnq-candidate'
const REFRESH = '__Host-jnq-candidate-refresh'
const HEADERS = {'Cache-Control':'private, no-store, max-age=0','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
class Failure extends Error { constructor(status, message) { super(message); this.status = status } }
const fail = (status, message) => { throw new Failure(status, message) }
const json = (data, status=200, extra={}) => Response.json(data,{status,headers:{...HEADERS,...extra}})
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))

export function config(env) {
  if (env.ENVIRONMENT !== 'isolated-candidate') fail(503,'Isolated candidate configuration required')
  const ref=String(env.CANDIDATE_SUPABASE_REF||'')
  if (!/^[a-z0-9]{20}$/.test(ref) || ref===PRODUCTION_REF || env.SUPABASE_URL!==`https://${ref}.supabase.co`) fail(503,'Isolated Supabase project required')
  if (!env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY || !env.TEST_MEDIA) fail(503,'Candidate bindings are not configured')
  const emails=String(env.ADMIN_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean)
  if (!emails.length) fail(503,'Candidate admin allowlist required')
  let fixtures
  try { fixtures=JSON.parse(env.CANDIDATE_SPOTS||'{}') } catch { fail(503,'Invalid fixture mapping') }
  if (!fixtures || Array.isArray(fixtures) || !Object.keys(fixtures).length || Object.entries(fixtures).some(([id,slug])=>!/^[1-9]\d*$/.test(id)||!Number.isSafeInteger(Number(id))||typeof slug!=='string'||!new RegExp(`^cloudflare-loop-[a-z0-9-]+-${id}$`).test(slug))) fail(503,'Explicit fixture IDs and slugs required')
  return {emails,fixtures}
}
function cookie(request,name) {
  const raw=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(`${name}=`))?.slice(name.length+1)
  return raw && /^[A-Za-z0-9._~-]+$/.test(raw) ? raw : ''
}
function sameOrigin(request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) fail(403,'Same-origin request required')
  if (request.headers.get('sec-fetch-site')==='cross-site') fail(403,'Cross-site request refused')
}
async function limitedBody(request,limit) {
  const length=request.headers.get('content-length')
  if (length && (!/^\d+$/.test(length)||Number(length)>limit)) fail(413,'Request too large')
  const reader=request.body?.getReader()
  if (!reader) fail(400,'Body required')
  const chunks=[]; let size=0
  while(true) {
    const {value,done}=await reader.read(); if(done)break
    size+=value.byteLength
    if(size>limit){await reader.cancel();fail(413,'Request too large')}
    chunks.push(value)
  }
  return new Blob(chunks)
}
async function bodyJson(request) {
  try { return JSON.parse(await (await limitedBody(request,65536)).text()) } catch(error) { if(error instanceof Failure)throw error;fail(400,'Invalid JSON') }
}
async function remote(transport,url,init={}) {
  let response
  // Native Workers supports manual redirects. Refuse every 3xx ourselves so
  // credentials can never be forwarded to an unexpected redirect destination.
  try { response=await transport(url,{...init,cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(5000)}) } catch(error) {
    const message=String(error?.message||'')
    // Fixed diagnostic codes only: never echo URLs, headers or token values.
    const code=/Illegal invocation/i.test(message)?'FETCH_RECEIVER':/cache/i.test(message)?'FETCH_CACHE_MODE':/redirect/i.test(message)?'FETCH_REDIRECT_MODE':/timeout|abort/i.test(message)?'UPSTREAM_TIMEOUT':'UPSTREAM_TRANSPORT'
    fail(503,`Upstream unavailable [${code}]`)
  }
  if(response.status>=300&&response.status<400)fail(503,'Upstream redirect refused')
  return response
}
async function verifiedUser(env,settings,token,transport) {
  if(!token)fail(401,'Sign in required')
  const response=await remote(transport,`${env.SUPABASE_URL}/auth/v1/user`,{headers:{apikey:env.SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`}})
  if(response.status===401||response.status===403)fail(401,'Session expired')
  if(!response.ok)fail(503,'Auth unavailable')
  const user=await response.json()
  if(!user.id||!user.email_confirmed_at||!settings.emails.includes(String(user.email||'').trim().toLowerCase()))fail(403,'Admin permission required')
  return user
}
async function admin(request,env,settings,transport) {
  return verifiedUser(env,settings,cookie(request,COOKIE),transport)
}
function checkedId(value,settings) {
  if(!Object.hasOwn(settings.fixtures,String(value)))fail(404,'Fixture not found')
  return String(value)
}
async function location(env,id,transport,mutation) {
  const url=new URL(`${env.SUPABASE_URL}/rest/v1/locations`)
  url.searchParams.set('id',`eq.${id}`);url.searchParams.set('select',SELECT)
  if(mutation)url.searchParams.set('updated_at',`eq.${mutation.expectedUpdatedAt}`)
  // Own the version column; no new database trigger/SQL is needed for this path.
  const changes=mutation?{...mutation.data,updated_at:new Date(Math.max(Date.now(),Date.parse(mutation.expectedUpdatedAt)+1)).toISOString()}:undefined
  const response=await remote(transport,url.href,{method:mutation?'PATCH':'GET',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json',Prefer:'return=representation'},...(mutation?{body:JSON.stringify(changes)}:{})})
  if(!response.ok)fail(503,mutation?'Save failed; reload before retry':'Spot source unavailable')
  const rows=await response.json()
  if(!Array.isArray(rows)||rows.length>1)fail(503,'Invalid Spot source')
  if(!rows.length)fail(mutation?409:404,mutation?'Spot changed; reload before saving':'Spot not found')
  const row=rows[0]
  if(row.id!==Number(id)||typeof row.updated_at!=='string'||!['active','inactive'].includes(row.status)||!['published','draft','hidden',null].includes(row.publication_status))fail(503,'Unverified Spot source')
  return row
}
const visible = row => row.status==='active' && (row.publication_status===null||row.publication_status==='published')
function imagePath(value,id) {
  return typeof value==='string' && new RegExp(`^/media/candidate/${id}/[a-f0-9-]+\\.(?:png|jpg|webp|gif)$`).test(value)
}
async function mutationData(body,id,env) {
  if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.expectedUpdatedAt!=='string'||!Number.isFinite(Date.parse(body.expectedUpdatedAt))||!body.data||Array.isArray(body.data)||typeof body.data!=='object')fail(400,'Save version and fields required')
  const allowed=new Set(['name','name_cn','description','image_url','images','status','publication_status','seo_title_zh','seo_description_zh','seo_title_en','seo_description_en','experience_zh','experience_en','address','redirect_url','redirect_type'])
  if(!Object.keys(body.data).length||Object.keys(body.data).some(k=>!allowed.has(k)))fail(400,'Unsupported Spot fields')
  for(const [key,value] of Object.entries(body.data)) {
    if(key==='images') {
      if(!Array.isArray(value)||value.length>60||value.some(v=>!imagePath(v,id)))fail(400,'Invalid fixture gallery')
    } else if(key==='publication_status') {if(!['published','draft','hidden'].includes(value))fail(400,'Invalid publication status')}
    else if(key==='status') {if(!['active','inactive'].includes(value))fail(400,'Invalid Spot status')}
    else if(key==='redirect_type') {if(![301,302,null].includes(value))fail(400,'Invalid redirect status')}
    else if(key==='redirect_url') {if(value!==null&&value!=='')fail(400,'Fixture redirect editing is not enabled')}
    else if(key==='image_url') {if(value!==null&&value!==''&&!imagePath(value,id))fail(400,'Invalid fixture image')}
    else if(value!==null&&(typeof value!=='string'||value.length>20000))fail(400,'Invalid text field')
    if(key==='name'&&(typeof value!=='string'||!value.trim()))fail(400,'Name required')
  }
  for(const media of [body.data.image_url,...(body.data.images||[])].filter(Boolean)) {
    if(!await env.TEST_MEDIA.head(media.slice(1)))fail(400,'Uploaded image no longer exists')
  }
  return body
}
async function upload(request,env,id) {
  const type=(request.headers.get('content-type')||'').split(';')[0]
  const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'}[type]
  if(!ext)fail(415,'JPEG, PNG, WebP or GIF required')
  const blob=await limitedBody(request,MAX_IMAGE)
  if(!blob.size)fail(400,'Empty image')
  const bytes=new Uint8Array(await blob.slice(0,12).arrayBuffer())
  const ascii=String.fromCharCode(...bytes)
  const valid=type==='image/png'?bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10':type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:type==='image/gif'?/^GIF8[79]a/.test(ascii):ascii.startsWith('RIFF')&&ascii.slice(8,12)==='WEBP'
  if(!valid)fail(415,'Image signature does not match type')
  const key=`media/candidate/${id}/${crypto.randomUUID()}.${ext}`
  try { await env.TEST_MEDIA.put(key,blob,{httpMetadata:{contentType:type},customMetadata:{fixtureId:id}}) } catch {fail(503,'R2 upload unavailable')}
  return json({url:`/${key}`,key,provider:'cloudflare-r2',bytes:blob.size},201)
}
function document(row,slug,locale) {
  const name=locale==='en'?row.name:(row.name_cn||row.name)
  const title=(locale==='en'?row.seo_title_en:row.seo_title_zh)||name
  const description=(locale==='en'?row.seo_description_en:row.seo_description_zh)||row.description||''
  const narrative=(locale==='en'?row.experience_en:row.experience_zh)||row.description||''
  const prefix=locale==='en'?'/en':''
  const canonical=`https://www.jnqjourney.com${prefix}/spot/${slug}`
  const images=[...new Set([row.image_url,...(Array.isArray(row.images)?row.images:[])].filter(value=>imagePath(value,row.id)))]
  return `<!doctype html><html lang="${locale==='en'?'en':'zh-Hans'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escape(title)} | JnQ Journey</title><meta name="description" content="${escape(description)}"><link rel="canonical" href="${canonical}"><link rel="stylesheet" href="/candidate.css"></head><body><main><p>JnQ Journey · 隔离发布候选</p><h1>${escape(name)}</h1><p>${escape(row.address)}</p><p class="narrative">${escape(narrative)}</p>${images.map((src,i)=>`<img src="${src}" alt="${escape(name)} ${i+1}" loading="${i?'lazy':'eager'}">`).join('')}<p>内容版本：<time>${escape(row.updated_at)}</time></p><a href="/admin/cloudflare-spot">返回测试后台</a></main></body></html>`
}
async function responseFor(request,env,transport) {
  const url=new URL(request.url)
  // Static editor files contain no injected config or credentials.
  if(['/admin/cloudflare-spot','/candidate-editor.js','/candidate.css'].includes(url.pathname))return env.ASSETS.fetch(request)
  const settings=config(env)
  if(url.protocol!=='https:')fail(400,'HTTPS required')
  const mutating=!['GET','HEAD'].includes(request.method)
  if(mutating)sameOrigin(request)
  if(url.pathname==='/api/candidate/session') {
    if(request.method==='DELETE') {
      const token=cookie(request,COOKIE)
      if(token) {
        const response=await remote(transport,`${env.SUPABASE_URL}/auth/v1/logout`,{method:'POST',headers:{apikey:env.SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`}})
        if(!response.ok&&response.status!==401)fail(503,'Sign out unavailable')
      }
      const response=json({signedOut:true})
      for(const name of [COOKIE,REFRESH])response.headers.append('Set-Cookie',`${name}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`)
      return response
    }
    if(request.method==='GET'){await admin(request,env,settings,transport);return json({fixtures:settings.fixtures})}
    if(request.method!=='POST')fail(405,'Method not allowed')
    const body=await bodyJson(request)
    const refreshing=body?.refresh===true
    if(!refreshing&&(typeof body?.email!=='string'||typeof body?.password!=='string'||!settings.emails.includes(body.email.trim().toLowerCase())))fail(401,'Sign in failed')
    const refresh=cookie(request,REFRESH)
    if(refreshing&&!refresh)fail(401,'Sign in required')
    const auth=await remote(transport,`${env.SUPABASE_URL}/auth/v1/token?grant_type=${refreshing?'refresh_token':'password'}`,{method:'POST',headers:{apikey:env.SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify(refreshing?{refresh_token:refresh}:{email:body.email,password:body.password})})
    if(!auth.ok)fail(auth.status===429?429:401,'Sign in failed')
    const session=await auth.json()
    if(!/^[A-Za-z0-9._~-]+$/.test(session.access_token||'')||!/^[A-Za-z0-9._~-]+$/.test(session.refresh_token||''))fail(503,'Invalid Auth response')
    await verifiedUser(env,settings,session.access_token,transport)
    const response=json({signedIn:true,expiresIn:Math.min(3600,Number(session.expires_in)||3600),fixtures:settings.fixtures})
    response.headers.append('Set-Cookie',`${COOKIE}=${session.access_token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.min(3600,Number(session.expires_in)||3600)}`)
    response.headers.append('Set-Cookie',`${REFRESH}=${session.refresh_token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`)
    return response
  }
  const edit=url.pathname.match(/^\/api\/candidate\/spots\/([1-9]\d*)(\/image)?$/)
  if(edit) {
    await admin(request,env,settings,transport)
    const id=checkedId(edit[1],settings)
    if(edit[2]) {
      if(request.method!=='POST')fail(405,'Method not allowed')
      if(env.CANDIDATE_WRITES_ENABLED!=='true')fail(503,'Candidate writes are disabled')
      await location(env,id,transport)
      return upload(request,env,id)
    }
    if(request.method==='GET')return json({spot:await location(env,id,transport),publicPath:`/spot/${settings.fixtures[id]}`})
    if(request.method!=='PATCH')fail(405,'Method not allowed')
    if(env.CANDIDATE_WRITES_ENABLED!=='true')fail(503,'Candidate writes are disabled')
    const body=await mutationData(await bodyJson(request),id,env)
    const saved=await location(env,id,transport,body)
    return json({spot:saved,publicPath:`/spot/${settings.fixtures[id]}`,publication:visible(saved)?'live':'withdrawn',buildsTriggered:0})
  }
  const media=url.pathname.match(/^\/media\/candidate\/([1-9]\d*)\/[a-f0-9-]+\.(?:png|jpg|webp|gif)$/)
  const page=url.pathname.match(/^\/(en\/)?spot\/([a-z0-9-]+?)(?:\.(html|txt))?\/?$/)
  const data=url.pathname.match(/^\/api\/candidate\/public\/spots\/([1-9]\d*)$/)
  const legacyData=url.pathname.match(/^\/_next\/data\/[^/]+\/(?:en\/)?spot\/([a-z0-9-]+)\.json$/)
  if(media||page||data||legacyData) {
    if(!['GET','HEAD'].includes(request.method))fail(405,'Method not allowed')
    const raw=media?.[1]||data?.[1]||(page?.[2]||legacyData?.[1]).match(/-(\d+)$/)?.[1]
    const id=checkedId(raw,settings)
    const row=await location(env,id,transport)
    if(!visible(row)) {
      // Only authenticated editor image previews may view unpublished media.
      if(media)await admin(request,env,settings,transport)
      else fail(404,'Spot not found')
    }
    if(media) {
      const object=await env.TEST_MEDIA.get(url.pathname.slice(1))
      if(!object)fail(404,'Image not found')
      return new Response(request.method==='HEAD'?null:object.body,{headers:{...HEADERS,'Content-Type':object.httpMetadata?.contentType||'application/octet-stream'}})
    }
    if(row.redirect_url) {
      if(!Object.values(settings.fixtures).some(slug=>row.redirect_url===`/spot/${slug}`||row.redirect_url===`/en/spot/${slug}`))fail(503,'Redirect target is outside isolated fixture scope')
      if(row.redirect_url===url.pathname)fail(503,'Redirect cycle refused')
      return new Response(null,{status:row.redirect_type===302?302:301,headers:{...HEADERS,Location:row.redirect_url}})
    }
    const canonical=`/${page?.[1]||''}spot/${settings.fixtures[id]}`
    if(page&&(page[2]!==settings.fixtures[id]||page[3]||url.pathname.endsWith('/')))return new Response(null,{status:301,headers:{...HEADERS,Location:canonical}})
    if(data||legacyData)return json({spot:{id:row.id,name:row.name,name_cn:row.name_cn,description:row.description,image_url:row.image_url,images:row.images,updated_at:row.updated_at}})
    return new Response(request.method==='HEAD'?null:document(row,settings.fixtures[id],page?.[1]?'en':'zh'),{headers:{...HEADERS,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':CSP,'X-JnQ-Publication-Version':row.updated_at}})
  }
  if(url.pathname.startsWith('/api/'))fail(404,'Candidate endpoint not found')
  return env.ASSETS.fetch(request)
}
export function createWorker(transport=(...args)=>globalThis.fetch(...args)) {
  return {async fetch(request,env) {
    try {
      const response=await responseFor(request,env,transport)
      // _headers does not apply to Function responses: set preview protection here.
      const safe=new Response(response.body,response)
      for(const [key,value] of Object.entries(HEADERS))safe.headers.set(key,value)
      safe.headers.set('Content-Security-Policy',CSP)
      return safe
    } catch(error) {
      return json({error:error instanceof Failure?error.message:'Candidate service unavailable'},error instanceof Failure?error.status:503)
    }
  }}
}
const worker=createWorker()
export default worker
