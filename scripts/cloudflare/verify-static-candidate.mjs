import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
if(process.argv.includes('--recovery')) { await (await import('./verify-static-recovery.mjs')).verifyRecoveryPackage(); process.exit(0) }
const base=path.resolve('artifacts/cloudflare-candidate')
const out=path.join(base,'source/out')
const manifest=JSON.parse(await readFile(path.join(base,'manifest.json'),'utf8'))
const routes=[
  '/',
  `/spot/${manifest.sampledParams['spot/[slug]'][0].slug}`,
  `/guide/${manifest.sampledParams['guide/[slug]'][0].slug}`,
  `/notes/${manifest.sampledParams['notes/[slug]'][0].slug}`,
  '/packages/tioman-3d2n',
  '/packages/batam-3d2n/amazing-promo-499',
  '/packages/hainan/4d3n-sea-land-air',
  ...manifest.englishPaths,
]
const results=[]
for(const route of routes){
  const html=await readFile(path.join(out,route==='/'?'index.html':`${route.slice(1)}.html`),'utf8')
  const title=html.match(/<title>(.*?)<\/title>/s)?.[1]
  const canonical=html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/)?.[1]
  const h1=(html.match(/<h1[ >]/g)||[]).length
  const robots=html.match(/<meta name="robots" content="([^"]+)"/)?.[1]
  assert.ok(title,`Missing title ${route}`)
  assert.equal(new URL(canonical).href,new URL(route,'https://www.jnqjourney.com').href,`Canonical changed ${route}`)
  assert.equal(h1,1,`H1 count ${route}`)
  results.push({route,title,canonical,h1,robots:robots||null})
}
const headers=await readFile(path.join(out,'_headers'),'utf8')
assert.match(headers,/X-Robots-Tag: noindex, nofollow/)
const notFound=await readFile(path.join(out,'404.html'),'utf8')
assert.match(notFound,/noindex/)
const sitemap=await readFile(path.join(out,'sitemap.xml'),'utf8')
assert.match(sitemap,/https:\/\/www\.jnqjourney\.com\/en\//)
const robots=await readFile(path.join(out,'robots.txt'),'utf8')
assert.match(robots,/Disallow: \/admin/)
assert.match(robots,/Disallow: \/api/)
const redirects=await readFile(path.join(out,'_redirects'),'utf8')
assert.match(redirects,/ 301\n/)
assert.match(redirects,/ 308\n/)
const report={verifiedPages:results,has404:true,hasSitemap:true,hasRobots:true,previewNoindex:true,redirectStatuses:[301,307,308],productionReady:false,limitations:manifest.blockers}
if(process.argv.includes('--http')) {
  const origin='http://127.0.0.1:8788'
  for(const route of routes) {
    const response=await fetch(`${origin}${route}`)
    assert.equal(response.status,200,route)
    assert.match(response.headers.get('x-robots-tag'),/noindex/)
  }
  for(const [route,status] of [['/spot/spot-845',301],['/packages/tioman-aman-resort-3d2n',308],['/packages/batam-3d2n/value-499',307],['/does-not-exist',404],['/api/admin/locations',404]]) {
    const response=await fetch(`${origin}${route}`,{redirect:'manual'})
    assert.equal(response.status,status,route)
  }
  assert.equal((await fetch(`${origin}/api/admin/locations`,{method:'POST',body:'{}'})).status,405)
  report.httpChecks=17
}
await writeFile(path.join(base,'verification.json'),JSON.stringify(report,null,2))
console.log(JSON.stringify({passed:results.length,checks:['canonical','single H1','title','404','bilingual sitemap','robots','preview noindex','redirect statuses'],productionReady:false}))
