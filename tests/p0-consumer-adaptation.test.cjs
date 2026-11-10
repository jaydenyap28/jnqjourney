const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { createClient } = require('@supabase/supabase-js')

function loader(overrides) {
  const modules = new Map()
  function load(file) {
    file = path.resolve(file)
    if (modules.has(file)) return modules.get(file).exports
    const mod = {exports:{}}; modules.set(file,mod)
    const source = ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
    const req = name => {
      if (Object.hasOwn(overrides,name)) return overrides[name]
      if (name === 'server-only') return {}
      if (name === 'react') return {cache: fn => fn}
      if (name.startsWith('@/')) return load(name.slice(2)+'.ts')
      if (name.startsWith('.')) {const target=path.resolve(path.dirname(file),name);return load(path.extname(target)?target:target+'.ts')}
      return require(name)
    }
    new Function('require','module','exports','fetch',source)(req,mod,mod.exports,overrides.fetch)
    return mod.exports
  }
  return load
}

async function fixture(t, count=45) {
  const {PUBLIC_SPOT_FIELDS}=await import('../cloudflare/spot-loop/publication-gate.mjs')
  const env={NEXT_PUBLIC_SUPABASE_URL:'https://synthetic-consumers.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic-anon',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',ADMIN_EMAILS:'admin@example.test',R2_ACCOUNT_ID:'synthetic',R2_BUCKET_NAME:'synthetic',R2_ACCESS_KEY_ID:'synthetic',R2_SECRET_ACCESS_KEY:'synthetic'}
  const before=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env)
  t.after(()=>{for(const [key,value]of Object.entries(before)){if(value==null)delete process.env[key];else process.env[key]=value}})
  const rows=Array.from({length:count},(_,i)=>Object.assign(Object.fromEntries(PUBLIC_SPOT_FIELDS.map(key=>[key,null])),{id:i+1,name:'Synthetic '+(i+1),latitude:1,longitude:103,status:'active',publication_status:null,region_id:1,images:[]}))
  const state={role:'admin',failure:false,extra:false,rows,reads:[],rpc:[],writes:0,feeds:[],missingFeed:false}
  const fetcher=async(input,init)=>{
    const r=new Request(input,init);const u=new URL(r.url)
    if(u.pathname==='/auth/v1/user'){
      if(state.role==='expired')return Response.json({message:'expired'},{status:401})
      return Response.json({id:'synthetic',email:state.role==='admin'?env.ADMIN_EMAILS:'ordinary@example.test'})
    }
    assert.equal(r.headers.get('apikey'),env.SUPABASE_SERVICE_ROLE_KEY)
    assert.equal(r.headers.get('authorization'),'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY)
    if(state.failure)return Response.json({code:'XX000',message:'source unavailable'},{status:503})
    if(u.pathname==='/rest/v1/rpc/jnq_public_spots'){
      const {p_ids}=await r.json();assert.ok(p_ids.length>0&&p_ids.length<=20);state.rpc.push(p_ids)
      const result=rows.filter(row=>p_ids.includes(row.id)&&row.status==='active'&&[null,'published'].includes(row.publication_status))
      return Response.json(state.extra?result.map(row=>({...row,review_jayden:'PRIVATE'})):result)
    }
    assert.ok(['/rest/v1/locations','/rest/v1/affiliate_links'].includes(u.pathname))
    if(r.method!=='GET'){state.writes++;return Response.json({id:1,updated_at:'2026-11-10T00:00:00Z'})}
    state.reads.push(Object.fromEntries(u.searchParams))
    if(u.pathname.endsWith('/affiliate_links'))return Response.json([])
    if(u.searchParams.get('select')==='id'){
      const after=Number(u.searchParams.get('id')?.slice(3)||0)
      return Response.json(rows.filter(row=>row.id>after).slice(0,Number(u.searchParams.get('limit'))).map(({id})=>({id})))
    }
    if(u.searchParams.has('id'))return Response.json({...rows.find(row=>row.id===Number(u.searchParams.get('id').slice(3))),review_jayden:'PRIVATE'})
    const offset=Number(u.searchParams.get('offset')||0),limit=Number(u.searchParams.get('limit')||200)
    return Response.json(rows.slice(offset,offset+limit).map(row=>({...row,review_jayden:'PRIVATE'})))
  }
  const load=loader({fetch:fetcher,'@supabase/supabase-js':{createClient:(url,key,options)=>createClient(url,key,{...options,global:{fetch:fetcher}})},
    '../../cloudflare/spot-loop/publication-gate.mjs':{PUBLIC_SPOT_FIELDS},
    './location-slugs-store':{readLocationSlugMap:async()=>({'1':'custom-synthetic'})},
    '@aws-sdk/client-s3':{GetObjectCommand:class{constructor(input){this.input=input}},S3Client:class{async send(command){state.feeds.push(command.input.Key);if(state.missingFeed)throw Error('missing');const values={'regions.json':{schemaVersion:1,regions:[{id:1,name:'Synthetic region',country:'Test',parentId:null,thumbnail:null,private_author_note:'DO NOT EXPOSE'}]},'guides.json':{schemaVersion:1,guides:[{slug:'synthetic-guide',title:'Synthetic guide',days:[]}]},'notes.json':{schemaVersion:1,notes:[]},'i18n/en/records.json':{schemaVersion:1,locale:'en',version:'synthetic',records:[]}};const bytes=Buffer.from(JSON.stringify(values[command.input.Key.replace('public-data/','')]));return{ContentLength:bytes.length,Body:{transformToByteArray:async()=>bytes}}}destroy(){}}}})
  return {state,load,request:query=>new Request('https://candidate.test/api/admin/locations'+query,{headers:{Authorization:'Bearer synthetic-token'}})}
}

test('admin full-field read, bounded pagination, detail and linked reads use a real auth guard',async t=>{
  const f=await fixture(t,205),route=f.load('app/api/admin/locations/route.ts')
  const first=await route.GET(f.request('?page=0'));assert.equal(first.status,200);assert.match(first.headers.get('cache-control'),/no-store/)
  const a=await first.json();assert.equal(a.data.length,200);assert.equal(a.hasMore,true);assert.equal(a.data[0].review_jayden,'PRIVATE')
  const second=await(await route.GET(f.request('?page=1'))).json();assert.equal(second.data.length,5);assert.equal(second.hasMore,false)
  const detail=await(await route.GET(f.request('?id=1'))).json();assert.equal(detail.data.id,1)
  assert.equal((await route.GET(f.request('?resource=affiliate-links'))).status,200)
  for(const role of ['ordinary','expired']){f.state.role=role;assert.equal((await route.GET(f.request(''))).status,role==='ordinary'?403:401)}
  f.state.role='admin';for(const query of ['?page=50','?page=-1','?id=1&select=*','?resource=secrets','?id=NaN'])assert.equal((await route.GET(f.request(query))).status,400)
  assert.equal((await route.GET(new Request('https://candidate.test/api/admin/locations'))).status,401)
  assert.equal(f.state.writes,0)
})
test('live ID inventory is paginated; RPC batches never exceed twenty and NULL remains public',async t=>{
  const f=await fixture(t,205);f.state.rows[1].publication_status='hidden';f.state.rows[2].status='temporarily_closed'
  const source=f.load('lib/server/public-spot-projection.ts');const rows=await source.readPublicRows()
  assert.equal(rows.length,203);assert.equal(f.state.rpc.length,11);assert.equal(f.state.reads.length,2);assert.ok(f.state.rpc.every(ids=>ids.length<=20))
  assert.ok(!rows.some(row=>[2,3].includes(row.id)));assert.equal(rows[0].publication_status,null)
  f.state.failure=true;await assert.rejects(source.readPublicRows([1]),/unavailable/)
})
test('private columns, malformed projection and stale fallback cannot restore visibility',async t=>{
  const f=await fixture(t);const source=f.load('lib/server/public-spot-projection.ts');f.state.extra=true
  await assert.rejects(source.readPublicRows([1]),/unavailable/)
  f.state.extra=false;f.state.rows[0].publication_status='hidden';assert.deepEqual(await source.readPublicRows([1]),[])
  f.state.rows[0].publication_status=null;assert.equal((await source.readPublicRows([1])).length,1)
  for(const ids of [[0],[NaN],[-1],[1.5]])await assert.rejects(source.readPublicRows(ids),/unavailable/)
})
test('actual public resolvers preserve custom slugs, omit hidden records and have no source fallback',async t=>{
  const f=await fixture(t,5);const data=f.load('lib/server/public-data-resolver.ts');const spot=f.load('lib/server/public-spot-resolver.ts')
  assert.equal((await data.resolvePublicData()).locations[0].slug,'custom-synthetic-1')
  assert.equal((await spot.readAuthoritativePublicSpotById(1)).slug,'custom-synthetic-1')
  assert.equal((await spot.readAuthoritativePublicSpotById(1)).regions.image_url,null)
  assert.ok(!Object.hasOwn((await spot.readAuthoritativePublicSpotById(1)).regions,'private_author_note'))
  f.state.rows[0].publication_status='hidden';assert.equal(await spot.readAuthoritativePublicSpotById(1),null)
  assert.equal((await data.resolvePublicData()).locations.length,4)
  f.state.failure=true;await assert.rejects(data.resolvePublicData());await assert.rejects(spot.getPublicSpotBySlug('custom-synthetic-1'))
})
test('private feed failure does not use CDN or bundled content',async t=>{
  const f=await fixture(t);const source=f.load('lib/server/public-read-source.ts')
  assert.equal((await source.readPrivatePublicFeed('regions.json')).regions.length,1)
  await assert.rejects(source.readPrivatePublicFeed('../../secrets'))
  f.state.missingFeed=true;await assert.rejects(source.readPrivatePublicFeed('regions.json'),/unavailable/)
})
test('exact legacy media host rewriting preserves shared key identity and blocks public-host bypass',()=>{
  const load=loader({}),media=load('lib/controlled-media.ts')
  const url='https://pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev/locations/shared.webp#focus=40,20'
  const value=media.controlledMediaValue({spot:url,note:url,guide:url,metadata:{[url]:{alt:'test'}}})
  assert.equal(value.spot,value.note);assert.equal(value.note,value.guide);assert.match(value.spot,/^\/media\/legacy\//);assert.ok(!JSON.stringify(value).includes('.r2.dev'))
  assert.equal(media.controlledMediaUrl('https://other.example/keep.webp'),'https://other.example/keep.webp')
  assert.throws(()=>media.controlledMediaUrl(url.replace('#focus=40,20','?x=1')))
  assert.equal(media.controlledMediaUrl('https://pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev/public-data/locations.json'),'/public-data/locations.json')
})
test('candidate legacy mutation cannot bypass Registry and browser metadata cannot proxy arbitrary URLs',async t=>{
  const f=await fixture(t);const before=process.env.JNQ_PUBLIC_FEED_ORIGIN
  process.env.JNQ_PUBLIC_FEED_ORIGIN='https://codex-p0-consumers.jnqjourney-spot-loop-migration-candidate.pages.dev'
  t.after(()=>{if(before===undefined)delete process.env.JNQ_PUBLIC_FEED_ORIGIN;else process.env.JNQ_PUBLIC_FEED_ORIGIN=before})
  const route=f.load('app/api/admin/locations/route.ts')
  const response=await route.PATCH(new Request('https://candidate.test/api/admin/locations',{method:'PATCH',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({id:1,data:{name:'must not write'}})}))
  assert.equal(response.status,503);assert.equal(f.state.writes,0)
  const metadata=f.load('app/api/admin/image-size/route.ts')
  assert.equal((await metadata.GET(new Request('https://candidate.test/api/admin/image-size?url=http://169.254.169.254/'))).status,401)
  assert.equal((await metadata.GET(new Request('https://candidate.test/api/admin/image-size?url=http://169.254.169.254/',{headers:{Authorization:'Bearer test'}}))).status,400)
})
test('all seven actual client files use protected reads, including indirect relationship joins',()=>{
  for(const file of ['page','edit/[id]/page','regions/page','notes/page','guides/page','affiliate/page','klook-widgets/page']){
    const text=fs.readFileSync(`app/admin/${file}.tsx`,'utf8')
    assert.match(text,/readAdminLocations/);assert.doesNotMatch(text,/\.from\('locations'\)/)
    assert.doesNotMatch(text,/\.select\([^)]*locations(?:\(|:location_id)/)
  }
})
test('Pages React without cache() stays live and browser imports of server data fail immediately',()=>{
  const mod=loader({react:{}})('lib/server/request-cache.ts')
  let count=0;const read=mod.requestCache(()=>++count)
  assert.equal(read(),1);assert.equal(read(),2)
  const previous=global.window;global.window={}
  try{assert.throws(()=>loader({})('lib/server/assert-server.ts'),/Server data module imported in a browser/)}
  finally{if(previous===undefined)delete global.window;else global.window=previous}
})
