import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { inspectHtml, runHttpSmoke, summarize, validateTarget } from '../scripts/lib/release-smoke.mjs'
import { checkBilingualBundle, requiredBilingualFallbacks } from '../scripts/check-bilingual-bundle.mjs'

const base='https://release.example'
const qualified={id:1,description:'A'.repeat(300),images:['a','b','c','d'],visit_date:'2026-01-01',address:'Existing address',publication_status:'published'}
const routes=[{kind:'page',path:'/',indexable:true},{kind:'guide',path:'/guide/g'},{kind:'note',path:'/notes/n',video:true},{kind:'package',path:'/packages/p',contactTerms:['Example']},{kind:'spot',path:'/spot/good-1',indexable:true},{kind:'spot',path:'/spot/thin-2',indexable:false},{kind:'spot',path:'/en/spot/good-1',indexable:false}]
function transport({preview=false,includeThin=false,analytics=false,wrongId=false,protectedTarget=false}={}) {
  const calls=[]
  return {calls,fetcher:async(url,options)=> {
    calls.push({url:String(url),...options})
    const {pathname,search}=new URL(url)
    if(protectedTarget) return new Response('',{status:401})
    if(pathname==='/sitemap.xml') return new Response(`<urlset><url><loc>${base}/spot/good-1</loc></url>${includeThin?`<url><loc>${base}/spot/thin-2</loc></url>`:''}</urlset>`)
    if(pathname==='/robots.txt') return new Response(preview?'User-agent: *\nDisallow: /':'User-agent: *\nAllow: /\nSitemap: '+base+'/sitemap.xml')
    const thin=pathname.endsWith('thin-2'),english=pathname.startsWith('/en/')||search.includes('locale=en')
    if(pathname.startsWith('/api/spots/')) return Response.json({spot:thin?{...qualified,id:2,description:'short'}:{...qualified,id:wrongId?99:1}},{headers:{'x-jnq-data-source':'supabase','x-jnq-seo-indexable':thin?'0':'1'}})
    if(pathname.startsWith('/api/spot-routing/')) return Response.json({visible:true},{headers:{'x-jnq-seo-indexable':thin||english?'false':'true'}})
    const noindex=preview||thin||english
    const body=`<h1>Example</h1><p>${'Existing content. '.repeat(12)}</p><a href="https://www.youtube.com/watch?v=abcdefghijk">Watch video</a><a href="https://wa.me/123456789?text=Example%20package%20request">Contact</a>`
    return new Response(`<link href='${base}${pathname}' rel='canonical'><meta content='${noindex?'noindex':'index'},follow' name='robots'>${body}${analytics?'<script src="https://www.googletagmanager.com/gtag/js?id=G-FAKE"></script>':''}`,{headers:{'content-type':'text/html',...(preview?{'x-robots-tag':'noindex,nofollow'}:{})}})
  }}
}
test('HTML evidence ignores RSC-only markup and reads reversed attribute order',()=> {
  const html=inspectHtml(`<script>fake="<h1>Hidden</h1><link rel='canonical' href='${base}/'>"</script><meta content='noindex,follow' name='robots'>`)
  assert.equal(html.h1,0);assert.equal(html.canonical.length,0);assert.equal(html.noindex,true)
  assert.equal(inspectHtml('<a href="https://www.youtube.com/@jnqjourney">Channel</a><a href="https://www.facebook.com/jnqjourney">Page</a>').hasVideo,false)
})
test('rejects credential-bearing targets, Production-as-Preview and admin/API manifest paths before GET',async()=> {
  for(const origin of ['https://user:pass@release.example','https://release.example/?token=secret','https://release.example/subpath']) assert.throws(()=>validateTarget(origin,'preview'))
  assert.throws(()=>validateTarget('https://www.jnqjourney.com','preview'))
  await assert.rejects(runHttpSmoke({base,environment:'production',manifest:{routes:[{kind:'page',path:'/api/admin/delete'}]},fetcher:()=>assert.fail('No request')}),/public page/)
})
test('public smoke uses only same-origin GET, accepts a qualified subset, and never upgrades fixtures to release approval',async()=> {
  const io=transport()
  const report=await runHttpSmoke({base,environment:'production',manifest:{routes},fetcher:io.fetcher})
  assert.equal(report.counts.FAIL,0)
  assert.equal(report.status,'UNVERIFIED')
  assert.ok(report.checks.some(c=>c.id.endsWith(':video-markup')&&c.status==='PASS'))
  assert.ok(report.checks.some(c=>c.id.endsWith(':contact')&&c.status==='PASS'))
  assert.ok(io.calls.every(call=>call.method==='GET'&&call.redirect==='manual'&&new URL(call.url).origin===base&&!call.headers))
  assert.ok(!io.calls.some(call=>/wa\.me|youtube\.com/.test(call.url)))
})
test('detects thin Spot Sitemap bypass, wrong detail identity and missing Preview noindex/analytics boundary',async()=> {
  for(const options of [{includeThin:true},{wrongId:true}]) {
    const io=transport(options)
    assert.equal((await runHttpSmoke({base,environment:'production',manifest:{routes},fetcher:io.fetcher})).status,'FAIL')
  }
  const io=transport({preview:true,analytics:true})
  const report=await runHttpSmoke({base,environment:'preview',manifest:{routes},fetcher:io.fetcher})
  assert.ok(report.checks.some(c=>c.id.endsWith(':analytics')&&c.status==='FAIL'))
  const unsafe=transport()
  const missingHeader=await runHttpSmoke({base,environment:'preview',manifest:{routes},fetcher:unsafe.fetcher})
  assert.ok(missingHeader.checks.some(c=>c.id.endsWith(':preview-noindex')&&c.status==='FAIL'))
})
test('protected routes and omitted coverage are explicitly unverified, not successes',async()=> {
  const io=transport({protectedTarget:true})
  const report=await runHttpSmoke({base,environment:'preview',manifest:{routes:routes.slice(0,1)},fetcher:io.fetcher})
  assert.equal(report.status,'UNVERIFIED');assert.equal(report.counts.PASS,0)
  assert.ok(report.checks.some(c=>c.id==='coverage:spot'&&c.status==='UNVERIFIED'))
  assert.equal(summarize([{status:'PASS'},{status:'FAIL'},{status:'UNVERIFIED'}]).status,'FAIL')
})
test('loopback evidence is always labelled local/synthetic and cannot be Production',()=> {
  assert.equal(validateTarget('http://127.0.0.1:9999','preview').evidence,'LOCAL_SYNTHETIC')
  assert.throws(()=>validateTarget('http://127.0.0.1:9999','production'))
})
test('bundle checker follows the active reader, rejects missing new snapshot, and needs no archived per-Spot files',async()=> {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'jnq-release-bundle-'))
  try {
    await fs.mkdir(path.join(root,'lib/server'),{recursive:true})
    await fs.writeFile(path.join(root,'lib/server/public-fallback-snapshot.ts'),"readFile('public-data/fallback/2026-10-30.json')")
    const required=await requiredBilingualFallbacks(root)
    assert.equal(required.length,5)
    const manifest=path.join(root,'.next/server/pages/en/[[...path]].js.nft.json')
    await fs.mkdir(path.dirname(manifest),{recursive:true})
    await fs.writeFile(manifest,JSON.stringify({files:required.slice(0,-1).map(file=>path.relative(path.dirname(manifest),path.join(root,file)))}))
    assert.deepEqual((await checkBilingualBundle(root)).missing,['public-data/fallback/2026-10-30.json'])
    await fs.writeFile(manifest,JSON.stringify({files:required.map(file=>path.relative(path.dirname(manifest),path.join(root,file)))}))
    assert.deepEqual((await checkBilingualBundle(root)).missing,[])
  } finally {
    // Delete only this known temp directory allocated by mkdtemp.
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep))
    await fs.rm(root,{recursive:true,force:true})
  }
})
