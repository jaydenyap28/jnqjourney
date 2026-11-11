// Inspect the frozen candidate and emit inert, local review drafts. No deploy.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {staticRecoveryIndexingPolicy,normalizeRecoveryCanonical} from './recovery-launch-policy.mjs'
const base=path.resolve('artifacts/cloudflare-static-recovery'),root=path.resolve('artifacts/cloudflare-static-launch-p0')
const json=async file=>JSON.parse(await readFile(path.join(base,file),'utf8'))
const [bundle,verification,deployment]=await Promise.all(['package-result.json','verification.json','deployment.json'].map(json))
assert.equal(bundle.pages.length,1349);assert.equal(verification.files,3621)
const out=path.join(base,'deploy'),previewPolicy=staticRecoveryIndexingPolicy('preview')
const receipt=await readFile(path.join(out,'_publication.json'))
assert.equal(createHash('sha256').update(receipt).digest('hex'),verification.publicationReceiptSha256)
assert.equal(await readFile(path.join(out,'_headers'),'utf8'),previewPolicy.headers)
assert.equal(await readFile(path.join(out,'robots.txt'),'utf8'),previewPolicy.robots)
const files=[]
async function walk(dir=''){for(const entry of await readdir(path.join(out,dir),{withFileTypes:true})){const name=path.posix.join(dir,entry.name);if(entry.isDirectory())await walk(name);else files.push(name)}}
await walk()
assert.equal(files.length,3621)
assert.ok(!files.some(file=>/(^|\/)(?:functions|_worker\.js)(\/|$)/.test(file)||file==='_routes.json'))
const sitemap=await readFile(path.join(out,'sitemap.xml'),'utf8')
const urls=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>match[1])
const pages=new Map(bundle.pages.map(page=>[page.route,page]))
assert.equal(urls.length,706);assert.equal(new Set(urls).size,urls.length)
for(const page of bundle.pages){assert.equal(urls.includes(page.canonical),page.indexable);for(const alt of page.alternates)assert.ok(pages.get(new URL(alt.href).pathname)?.indexable)}
const canonicalChanges=bundle.pages.filter(page=>normalizeRecoveryCanonical(page.canonical)!==page.canonical).map(page=>({route:page.route,before:page.canonical,proposed:normalizeRecoveryCanonical(page.canonical)}))
const ads=(await readFile(path.join(out,'ads.txt'),'utf8')).trim()
const publisher=ads.match(/^google\.com, (pub-\d+), DIRECT, f08c47fec0942fa0$/)?.[1]
assert.ok(publisher)
const home=await readFile(path.join(out,'index.html'),'utf8'),english=await readFile(path.join(out,'en.html'),'utf8')
assert.ok(home.includes('ca-'+publisher))
assert.ok(!home.includes('src="https://pagead2.googlesyndication')&&!english.includes('src="https://pagead2.googlesyndication'))
const report={checkedAt:new Date().toISOString(),scope:'Frozen artifact metadata and three live Preview files; not another whole-site PoC',
  preserved:{preview:deployment.url,pages:bundle.pages.length,files:files.length,receiptSha256:verification.publicationReceiptSha256,unchanged:true,functions:0},
  seo:{sitemap:urls.length,indexable:bundle.pages.filter(page=>page.indexable).length,noindex:bundle.pages.filter(page=>!page.indexable).length,hreflangTargetsValid:true,currentCanonicalChanges:canonicalChanges,canonicalPatch:'NEXT_BUILD_ONLY'},
  ads:{adsTxtValid:true,publisherId:publisher,previewScriptEnabled:false,englishScriptEnabled:false,accountApprovalAndRevenue:'UNKNOWN',productionActivation:'SEPARATE_APPROVAL_REQUIRED'},
  live:[],formalLaunch:'HOLD',writesToProduction:0,rebuilds:0,deployments:0}
assert.match(deployment.url,/^https:\/\/[a-f0-9]+\.jnqjourney-static-recovery-candidate\.pages\.dev$/)
for(const file of ['_publication.json','robots.txt','ads.txt']) {
  const response=await fetch(deployment.url+'/'+file,{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(20000)})
  const bytes=Buffer.from(await response.arrayBuffer()),expected=await readFile(path.join(out,file))
  const matched=bytes.equals(expected)
  const row={path:'/'+file,status:response.status,type:response.headers.get('content-type'),noindex:response.headers.get('x-robots-tag'),byteMatched:matched}
  report.live.push(row);assert.equal(row.status,200);assert.ok(matched&&/noindex/.test(row.noindex))
}
await mkdir(path.join(root,'production-review'),{recursive:true})
const draft=staticRecoveryIndexingPolicy('production-review')
await writeFile(path.join(root,'production-review/headers.production.draft.txt'),draft.headers)
await writeFile(path.join(root,'production-review/robots.production.draft.txt'),draft.robots)
// Pages _redirects does not support domain-level source matching. This is a
// disabled Single Redirect dashboard draft, NOT a deployable Pages file/API body.
await writeFile(path.join(root,'production-review/host-redirect.disabled.draft.json'),JSON.stringify({enabled:false,product:'Cloudflare Single Redirects',matchExpression:'http.host eq "jnqjourney.com"',targetExpression:'concat("https://www.jnqjourney.com", http.request.uri.path)',statusCode:301,preserveQueryString:true,reviewOnly:true},null,2))
await writeFile(path.join(root,'production-review/emergency-waf.disabled.draft.json'),JSON.stringify({enabled:false,action:'block',description:'REVIEW ONLY - public website emergency stop',expression:'http.host in {"jnqjourney.com" "www.jnqjourney.com"}',scope:'Only proxied custom-domain requests; does not protect r2.dev, pages.dev or client caches.'},null,2))
await writeFile(path.join(root,'launch-checks.json'),JSON.stringify(report,null,2))
console.log(JSON.stringify(report))
