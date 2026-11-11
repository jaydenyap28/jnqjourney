import assert from 'node:assert/strict'
import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { RECOVERY, SOURCE } from './recovery-sources.mjs'
import { decode, pageMetadata } from './package-static-recovery.mjs'

export async function verifyRecoveryPackage() {
  const out=path.join(RECOVERY,'deploy')
  const result=JSON.parse(await readFile(path.join(RECOVERY,'package-result.json'),'utf8'))
  const db=JSON.parse(await readFile(path.join(RECOVERY,'sources/database.json'),'utf8'))
  const allowedIds=new Set(db.locations.map(item=>item.id))
  const files=[]
  async function walk(directory='') {
    for(const item of await readdir(path.join(out,directory),{withFileTypes:true})) {
      const file=path.posix.join(directory,item.name)
      if(item.isDirectory())await walk(file)
      else files.push(file)
    }
  }
  await walk()
  assert.ok(files.length<=20000,'PAGES_FREE_FILE_COUNT_EXCEEDED')
  assert.ok(!files.some(file=>/(^|\/)(?:_worker\.js|functions|admin)(?:\/|$)/.test(file)||file==='_routes.json'),'FUNCTIONS_OR_ADMIN_IN_STATIC_SITE')
  const sitemap=await readFile(path.join(out,'sitemap.xml'),'utf8')
  const entries=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(item=>decode(item[1]))
  assert.equal(new Set(entries).size,entries.length,'DUPLICATE_SITEMAP_URL')
  const byRoute=new Map(result.pages.map(page=>[page.route,page]))
  const hostDifferences=[]
  for(const page of result.pages) {
    const html=await readFile(path.join(out,page.file),'utf8')
    const meta=pageMetadata(html)
    assert.ok(meta.title&&meta.canonical,'METADATA_MISSING_'+page.route)
    assert.equal(meta.h1,1,'H1_COUNT_'+page.route)
    const canonical=new URL(meta.canonical)
    assert.ok(canonical.protocol==='https:'&&['www.jnqjourney.com','jnqjourney.com'].includes(canonical.hostname),'CANONICAL_HOST_'+page.route)
    assert.equal(canonical.pathname,page.route,'CANONICAL_PATH_'+page.route)
    if(canonical.hostname!=='www.jnqjourney.com')hostDifferences.push({route:page.route,canonical:meta.canonical})
    assert.equal(entries.includes(meta.canonical),meta.indexable,'SITEMAP_QUALIFICATION_'+page.route)
    for(const alternate of meta.alternates)assert.ok(byRoute.get(new URL(alternate.href).pathname)?.indexable,'HREFLANG_TARGET_NOT_INDEXABLE_'+page.route)
    assert.ok(!/https:\/\/(?:www\.)?jnqjourney\.com\/api\//.test(html),'VERCEL_API_DEPENDENCY_'+page.route)
    assert.ok(!/src="https:\/\/pagead2\.googlesyndication/.test(html),'PREVIEW_AD_SCRIPT_'+page.route)
  }
  const publicFeed=JSON.parse(await readFile(path.join(out,'public-data/locations.json'),'utf8'))
  assert.equal(publicFeed.locations.length,db.locations.length,'HOME_FEED_SPOT_COUNT')
  assert.ok(publicFeed.locations.every(item=>allowedIds.has(item.id)),'HIDDEN_RECORD_IN_PUBLIC_INDEX')
  const affiliates=JSON.parse(await readFile(path.join(out,'public-data/affiliate-links.json'),'utf8'))
  assert.ok(affiliates.links.every(item=>!item.location_id||allowedIds.has(item.location_id)),'HIDDEN_SPOT_AFFILIATE_EXPOSURE')
  let details=0
  for(const file of files.filter(file=>/^public-data\/spots\/.+\.json$/.test(file)&&!file.endsWith('/index.json'))) {
    const data=JSON.parse(await readFile(path.join(out,file),'utf8'))
    assert.ok(allowedIds.has(data.spot.id)&&data.spot.status==='active'&&[null,'published'].includes(data.spot.publication_status),'INELIGIBLE_PUBLIC_DETAIL')
    assert.ok(!Object.hasOwn(data.spot,'review_jayden')&&!Object.hasOwn(data.spot,'review_qing')&&!Object.hasOwn(data.spot,'is_visited'),'PRIVATE_SPOT_FIELD')
    details++
  }
  assert.equal(details,allowedIds.size,'FULL_SPOT_JSON_COUNT')
  for(const row of db.inventory.filter(row=>!allowedIds.has(row.id))) {
    assert.ok(!result.pages.some(page=>new RegExp('^/(en/)?spot/.*-'+row.id+'$').test(page.route)),'CLOSED_SPOT_PAGE')
    assert.ok(!result.redirects.some(item=>new RegExp('^/(en/)?spot/.*-'+row.id+'$').test(item.from)),'CLOSED_SPOT_ALIAS')
  }
  for(const alias of result.redirects)assert.ok(byRoute.has(alias.to)&&!byRoute.has(alias.from),'INVALID_ALIAS_GRAPH')
  const leaks=[]
  let bytes=0,maxFileBytes=0
  const media=new Map()
  function reference(url,owner) {
    if(!/^https?:\/\//.test(url))return
    let parsed
    try{parsed=new URL(decode(url))}catch{return}
    if(!/\.(?:png|jpe?g|webp|gif|avif|svg)(?:$|[?#])/i.test(parsed.pathname+parsed.search))return
    assert.ok(![...parsed.searchParams.keys()].some(key=>/^(?:token|signature|x-amz-)/i.test(key)),'SIGNED_OR_PRIVATE_IMAGE_URL')
    const entry=media.get(parsed.href)||{url:parsed.href,owners:[],legacyR2:parsed.hostname==='pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev'}
    if(!entry.owners.includes(owner))entry.owners.push(owner)
    media.set(parsed.href,entry)
  }
  for(const file of files) {
    const size=(await stat(path.join(out,file))).size
    bytes+=size;maxFileBytes=Math.max(maxFileBytes,size)
    assert.ok(size<=25*1024*1024,'PAGES_FREE_FILE_SIZE_'+file)
    if(!/\.(?:html|js|json|txt)$/.test(file))continue
    const text=await readFile(path.join(out,file),'utf8')
    if(/BEGIN (?:RSA |EC )?PRIVATE KEY|sb_secret_[a-zA-Z0-9_-]{16,}|X-Amz-Credential=|X-Amz-Signature=/.test(text))leaks.push(file)
    for(const token of text.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)||[]) {
      try{if(JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).role==='service_role')leaks.push(file)}catch{}
    }
    if(file.endsWith('.html'))for(const image of text.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g))reference(image[1],'/'+file.replace(/\.html$/,'').replace(/^index$/,''))
  }
  assert.deepEqual(leaks,[],'PUBLIC_SECRET_LEAK')
  assert.match(await readFile(path.join(out,'_headers'),'utf8'),/X-Robots-Tag: noindex, nofollow/)
  assert.match(await readFile(path.join(out,'robots.txt'),'utf8'),/Disallow: \//)
  assert.match(await readFile(path.join(out,'404.html'),'utf8'),/noindex/)
  const receipt=JSON.parse(await readFile(path.join(out,'_publication.json'),'utf8'))
  assert.equal(receipt.runtimeFunctions,0)
  let buildMs=null
  try {
    const trace=(await readFile(path.join(SOURCE,'.next/trace'),'utf8')).trim().split('\n').flatMap(line=>JSON.parse(line))
    const build=trace.filter(event=>event.name==='next-build').at(-1)
    if(build)buildMs=Math.round(build.duration/1000)
  } catch {}
  const report={verifiedAt:new Date().toISOString(),passed:true,publicPages:result.pages.length,publicSpotDetails:details,sitemapEntries:entries.length,
    indexablePages:result.pages.filter(page=>page.indexable).length,redirects:result.redirects.length,files:files.length,bytes,maxFileBytes,
    freeFileLimit:20000,freeFileByteLimit:25*1024*1024,actualLocalBuildMs:buildMs,functions:0,canonicalHostDifferences:hostDifferences,
    actualAccountRemainingQuota:'UNKNOWN',realtimeRevocation:false,formalMigration:'HOLD',media:{renderedUnique:media.size,legacyPublicR2:[...media.values()].filter(item=>item.legacyR2).length,identityAndRevocation:'UNVERIFIED_FORMAL_MEDIA',sharedConsumers:[...media.values()].filter(item=>item.owners.length>1).length},
    publicationReceiptSha256:createHash('sha256').update(await readFile(path.join(out,'_publication.json'))).digest('hex')}
  await writeFile(path.join(RECOVERY,'media-inventory.json'),JSON.stringify([...media.values()],null,2))
  await writeFile(path.join(RECOVERY,'verification.json'),JSON.stringify(report,null,2))
  console.log(JSON.stringify(report))
  return report
}
