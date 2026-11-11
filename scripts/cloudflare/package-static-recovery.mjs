import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile, mkdir, readdir, stat, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { buildLocationSlug } from '../../lib/location-routing.ts'
import { RECOVERY, SOURCE, fingerprint } from './recovery-sources.mjs'
import { staticRecoveryIndexingPolicy } from './recovery-launch-policy.mjs'

export const decode = value => value.replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#x27;',"'")
export function pageMetadata(html) {
  const tags=[...html.matchAll(/<(?:meta|link)\b[^>]*>/gi)].map(match=>Object.fromEntries([...match[0].matchAll(/([a-zA-Z-]+)="([^"]*)"/g)].map(item=>[item[1].toLowerCase(),decode(item[2])])))
  const rawCanonical=tags.find(tag=>tag.rel==='canonical')?.href
  const canonical=rawCanonical?new URL(rawCanonical).href:undefined
  const robots=tags.filter(tag=>['robots','googlebot'].includes(tag.name)).map(tag=>tag.content).join(',')
  return {title:decode(html.match(/<title>(.*?)<\/title>/s)?.[1]||''),canonical,robots,indexable:!/(?:noindex|none)/i.test(robots),h1:(html.match(/<h1(?:\s|>)/g)||[]).length,
    alternates:tags.filter(tag=>tag.rel==='alternate'&&tag.hreflang),structuredData:(html.match(/type="application\/ld\+json"/g)||[]).length}
}
const json=async file=>JSON.parse(await readFile(path.join(RECOVERY,file),'utf8'))
export async function packageRecovery() {
  const manifest=await json('manifest.json')
  const [db,slugs,notes,guides]=await Promise.all(['database.json','location-slugs.json','notes.json','guides.json'].map(file=>json('sources/'+file)))
  const built=path.join(SOURCE,'out'),out=path.join(RECOVERY,'deploy')
  await stat(path.join(built,'404.html'))
  await mkdir(out,{recursive:true})
  assert.equal((await readdir(out)).length,0,'EXISTING_STATIC_PACKAGE_MUST_BE_PRESERVED')
  // The original detail component implements Batam options. Tioman options
  // remain inline on its parent page, exactly as in the existing website.
  const tioman=db.packages.find(item=>item.slug==='tioman-3d2n')
  const inlineOptions=db.options.filter(item=>item.package_id===tioman?.id).map(item=>'/packages/tioman-3d2n/'+item.slug)
  const routes=manifest.routes.filter(route=>!inlineOptions.includes(route))
  const excluded=new Set(inlineOptions.flatMap(route=>[route.slice(1)+'.html',route.slice(1)+'.txt']))
  const files=[]
  async function copy(directory='') {
    for(const entry of await readdir(path.join(built,directory),{withFileTypes:true})) {
      const name=path.posix.join(directory,entry.name)
      if(excluded.has(name))continue
      assert.ok(!/(^|\/)(?:_worker\.js|functions|admin)(?:\/|$)/.test(name),'DYNAMIC_OR_ADMIN_BUNDLE_IN_PUBLIC_PACKAGE')
      const target=path.join(out,name)
      if(entry.isDirectory()){await mkdir(target,{recursive:true});await copy(name)}
      else {assert.ok((await stat(path.join(built,name))).size<=25*1024*1024);await copyFile(path.join(built,name),target);files.push(name)}
    }
  }
  await copy()
  const pages=[]
  for(const route of routes) {
    const file=route==='/'?'index.html':route.slice(1)+'.html'
    const html=await readFile(path.join(out,file),'utf8')
    const meta=pageMetadata(html)
    pages.push({route,file,...meta})
  }
  const byRoute=new Map(pages.map(page=>[page.route,page]))
  const redirects=new Map()
  function redirect(from,to,status=301) {
    if(from===to)return
    assert.ok(byRoute.has(to),'ALIAS_TARGET_NOT_RENDERED_'+to)
    assert.ok(!byRoute.has(from),'ALIAS_OVERLAPS_CANONICAL_'+from)
    assert.ok(!redirects.has(from)||redirects.get(from).to===to,'CONFLICTING_ALIAS_'+from)
    redirects.set(from,{from,to,status})
  }
  const canonical=row=>'/spot/'+(slugs[String(row.id)]?slugs[String(row.id)]+'-'+row.id:buildLocationSlug(row.name,row.id))
  for(const row of db.locations)for(const locale of ['', '/en']) {
    const to=locale+canonical(row)
    redirect(locale+'/spot/spot-'+row.id,to)
    redirect(locale+'/spot/'+buildLocationSlug(row.name,row.id),to)
  }
  let historical=[]
  try {historical=(await json('sources/historical-public-slugs.json')).slugs} catch {}
  const publicIds=new Map(db.locations.map(item=>[item.id,item]))
  for(const slug of historical) {
    const row=publicIds.get(Number(slug.match(/-(\d+)$/)?.[1]))
    if(row)for(const locale of ['', '/en'])redirect(locale+'/spot/'+slug,locale+canonical(row))
  }
  for(const [kind,records] of [['notes',notes.notes],['guide',guides.guides]])for(const record of records)for(const alias of record.aliases||[])for(const locale of ['', '/en'])redirect(`${locale}/${kind}/${alias}`,`${locale}/${kind}/${record.slug}`)
  for(const from of ['tioman-aman-resort-3d2n','tioman-paya-beach-resort-3d2n','tioman-barat-resort-3d2n'])redirect('/packages/'+from,'/packages/tioman-3d2n',308)
  for(const [from,to] of [['value-499','amazing-promo-499'],['new-classic-599','new-version-599']])redirect('/packages/batam-3d2n/'+from,'/packages/batam-3d2n/'+to,307)
  redirect('/regions','/region')
  redirect('/en/regions','/en/region')
  const linkAliases=[]
  const slugIds=new Map()
  for(const row of db.locations){const slug=slugs[String(row.id)];if(slug){const ids=slugIds.get(slug)||[];ids.push(row.id);slugIds.set(slug,ids)}}
  // Components also generate URLs from translated/display names. In SSR those
  // aliases were resolved by ID; static hosting must declare the observed ones.
  for(const page of pages) {
    const html=await readFile(path.join(out,page.file),'utf8')
    for(const match of html.matchAll(/<a\b[^>]*href="([^"]*)"/g)) {
      const href=decode(match[1]);if(!href.startsWith('/')||href.startsWith('//'))continue
      const from=new URL(href,'https://www.jnqjourney.com').pathname
      if(byRoute.has(from)||redirects.has(from))continue
      const spot=from.match(/^(\/en)?\/spot\/(.+)$/)
      let to,status=301,reason
      if(spot){
        const id=Number(spot[2].match(/-(\d+)$/)?.[1])
        const noId=slugIds.get(spot[2])
        const row=publicIds.get(id)|| (noId?.length===1?publicIds.get(noId[0]):null)
        if(row){to=(spot[1]||'')+canonical(row);reason='OBSERVED_PUBLIC_SPOT_ID_OR_AUTHORITY_SLUG'}
      } else if(/^\/(en\/)?(?:guides|destinations)$/.test(from)) {
        to=from.replace(/guides$/,'guide').replace(/destinations$/,'region');reason='EXISTING_INDEX_LINK'
      } else if(from.startsWith('/en/packages/')&&byRoute.has(from.slice(3))) {
        // No English option renderer exists in the source application. Keep
        // access to its actual Chinese content without inventing a translation.
        to=from.slice(3);status=302;reason='UNTRANSLATED_OPTION_CHINESE_FALLBACK'
      }
      if(to){redirect(from,to,status);linkAliases.push({from,to,status,owner:page.route,reason})}
    }
  }
  assert.ok(redirects.size<=2000,'STATIC_REDIRECT_LIMIT')
  const redirectText=[...redirects.values()].map(item=>`${item.from} ${item.to} ${item.status}`)
  redirectText.push('/api/locations /public-data/locations.json 200','/api/spots/:slug /public-data/spots/:slug.json 200')
  await writeFile(path.join(out,'_redirects'),redirectText.join('\n')+'\n')
  // Never select Production policy from environment variables or a deploy flag.
  const indexing=staticRecoveryIndexingPolicy('preview')
  await writeFile(path.join(out,'_headers'),indexing.headers)
  await writeFile(path.join(out,'robots.txt'),indexing.robots)
  const originalSitemap=await readFile(path.join(out,'sitemap.xml'),'utf8')
  const blocks=[...originalSitemap.matchAll(/<url>[\s\S]*?<\/url>/g)].map(match=>match[0])
  const removed=[]
  const accepted=[]
  const sitemapPaths=new Set()
  for(const block of blocks) {
    const url=decode(block.match(/<loc>([^<]+)<\/loc>/)?.[1]||'')
    const route=new URL(url).pathname
    const page=byRoute.get(route)
    if(!page||!page.indexable){removed.push({route,reason:!page?'NOT_RENDERED':'PAGE_NOINDEX'});continue}
    if(sitemapPaths.has(route)){removed.push({route,reason:'DUPLICATE'});continue}
    assert.ok(new URL(page.canonical).pathname===route && ['www.jnqjourney.com','jnqjourney.com'].includes(new URL(page.canonical).hostname),'INVALID_CANONICAL_'+route)
    sitemapPaths.add(route)
    accepted.push(block.replace(/<loc>[^<]+<\/loc>/,`<loc>${page.canonical}</loc>`).replace(/<xhtml:link\b[^>]*\/>/g,tag=>{
      const href=decode(tag.match(/href="([^"]+)"/)?.[1]||'')
      const target=byRoute.get(new URL(href).pathname)
      return target?.indexable?tag:''
    }))
  }
  const added=[]
  for(const page of pages.filter(page=>page.indexable&&!sitemapPaths.has(page.route))) {
    assert.equal(new URL(page.canonical).pathname,page.route)
    assert.ok(['www.jnqjourney.com','jnqjourney.com'].includes(new URL(page.canonical).hostname))
    const alternates=page.alternates.filter(item=>byRoute.get(new URL(item.href).pathname)?.indexable).map(item=>`<xhtml:link rel="alternate" hreflang="${item.hreflang}" href="${item.href}" />`).join('')
    accepted.push(`<url><loc>${page.canonical}</loc>${alternates}<changefreq>weekly</changefreq><priority>0.6</priority></url>`)
    added.push(page.route)
  }
  await writeFile(path.join(out,'sitemap.xml'),originalSitemap.replace(/<url>[\s\S]*?<\/url>/g,'').replace('</urlset>',accepted.join('\n')+'\n</urlset>'))
  const sourceManifest=await json('source-manifest.json')
  const receipt={schemaVersion:1,sourceCapturedAt:sourceManifest.capturedAt,sourceFingerprint:manifest.sourceFingerprint,
    sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),publicPages:pages.length,publicSpots:db.locations.length,
    published:false,hosting:'static-files',runtimeFunctions:0,realtimeRevocation:false,formalMigration:'HOLD'}
  await writeFile(path.join(out,'_publication.json'),JSON.stringify(receipt))
  const result={pages,redirects:[...redirects.values()],linkAliases,sitemap:{kept:accepted.length,removed,added},inlineTiomanOptions:inlineOptions,
    originalGeneratedRoutes:manifest.routes.length,publicHtmlPages:pages.length,files:files.length+3,previewNoindex:true,productionReady:false}
  await writeFile(path.join(RECOVERY,'package-result.json'),JSON.stringify(result,null,2))
  await writeFile(path.join(RECOVERY,'url-inventory.csv'),'route,representation,indexable\n'+pages.map(page=>`${page.route},HTML,${page.indexable}`).join('\n')+'\n'+[...redirects.values()].map(item=>`${item.from},${item.status} -> ${item.to},false`).join('\n')+'\n')
  console.log(JSON.stringify({publicHtmlPages:pages.length,files:result.files,redirects:redirects.size,sitemap:accepted.length,filteredNoindex:removed.length,functions:0}))
  return result
}
