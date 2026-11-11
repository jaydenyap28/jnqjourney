import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {RECOVERY_BASE} from './recovery-sources.mjs'
import {pageMetadata} from './package-static-recovery.mjs'

const directory=path.join(RECOVERY_BASE,'runs/production-20261111')
const deployment=JSON.parse(await readFile(path.join(directory,'production-deployment.json'),'utf8'))
assert.ok(deployment.success&&deployment.environment==='production'&&deployment.functions===0)
const origin=process.argv[2]??deployment.url
assert.ok([deployment.url,'https://www.jnqjourney.com'].includes(origin),'UNAPPROVED_PRODUCTION_CHECK_ORIGIN')
const routes=[
  ['/','index.html'],['/en','en.html'],['/spot/turtle-alley-636','spot/turtle-alley-636.html'],
  ['/en/spot/turtle-alley-636','en/spot/turtle-alley-636.html'],
  ['/notes/malaysia-turtle-night-terengganu','notes/malaysia-turtle-night-terengganu.html'],
  ['/guide/china-dali-shangri-la-lijiang-11d10n','guide/china-dali-shangri-la-lijiang-11d10n.html'],
  ['/robots.txt','robots.txt'],['/sitemap.xml','sitemap.xml'],['/ads.txt','ads.txt'],
  ['/api/locations','public-data/locations.json'],
  ['/public-data/fx/MYR.json','public-data/fx/MYR.json'],
  ['/not-found-production-recovery-20261111','404.html'],
]
const sha=b=>createHash('sha256').update(b).digest('hex')
const map=JSON.parse(await readFile('cloudflare/static-recovery/media-map-2026-11-11.json','utf8'))
const image=map.records.find(row=>row.disposition==='static-copy'&&row.owners.includes('spot:636'))
assert.ok(image)
routes.push([image.path,image.path.slice(1)])
const report={checkedAt:new Date().toISOString(),origin,deploymentId:deployment.deploymentId,checks:[],passed:false}
for(const [url,file] of routes){
  const r=await fetch(origin+url,{redirect:'manual',signal:AbortSignal.timeout(20000)})
  const bytes=Buffer.from(await r.arrayBuffer()),expected=await readFile(path.join(directory,'deploy',file))
  const row={path:url,http:r.status,matched:sha(bytes)===sha(expected),type:r.headers.get('content-type'),robots:r.headers.get('x-robots-tag'),
    passed:r.status===(file==='404.html'?404:200)&&sha(bytes)===sha(expected)}
  if(file.endsWith('.html')&&file!=='404.html'){
    const meta=pageMetadata(bytes.toString())
    row.canonical=meta.canonical;row.indexable=meta.indexable
    row.passed&&=meta.h1===1&&meta.canonical==='https://www.jnqjourney.com'+(url==='/'?'/':url)&&!/noindex/.test(row.robots??'')
  }
  if(file==='robots.txt')row.passed&&=!bytes.toString().includes('Disallow: /\n')
  report.checks.push(row)
}
const redirects=await fetch(origin+'/spot/spot-636',{redirect:'manual',signal:AbortSignal.timeout(15000)})
report.alias={http:redirects.status,path:new URL(redirects.headers.get('location')??'/',origin).pathname}
report.passed=report.checks.every(row=>row.passed)&&report.alias.http===301&&report.alias.path==='/spot/turtle-alley-636'
const name=new URL(origin).hostname==='www.jnqjourney.com'?'formal-http.json':'production-pages-http.json'
await writeFile(path.join(directory,name),JSON.stringify(report,null,2))
console.log(JSON.stringify(report))
if(!report.passed)process.exitCode=1
