import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {RECOVERY} from './recovery-sources.mjs'
const deployment=JSON.parse(await readFile(path.join(RECOVERY,'deployment.json'),'utf8'))
assert.ok(deployment.success&&deployment.environment==='preview')
const buildId=(await readFile(path.join(RECOVERY,'source/.next/BUILD_ID'),'utf8')).trim()
const cases=[
  ['/','index.html'],['/spot/turtle-alley-636','spot/turtle-alley-636.html'],
  ['/en/packages','en/packages.html'],['/en/disclaimer','en/disclaimer.html'],
  ['/spot/turtle-alley-636.txt','spot/turtle-alley-636.txt'],
  [`/_next/data/${buildId}/en/spot/turtle-alley-636.json`,`_next/data/${buildId}/en/spot/turtle-alley-636.json`],
  ['/api/locations','public-data/locations.json'],['/api/spots/turtle-alley-636','public-data/spots/turtle-alley-636.json'],
  ...['regions.json','guides.json','notes.json','guide-trip-costs.json','i18n/en/records.json','spots/index.json','affiliate-links.json','fx/MYR.json'].map(file=>['/public-data/'+file,'public-data/'+file]),
  ['/sitemap.xml','sitemap.xml'],['/robots.txt','robots.txt'],['/definitely-not-a-page-20261111','404.html'],
]
if(process.argv.includes('--final-media')){
  const gate=JSON.parse(await readFile(path.join(RECOVERY,'media-approval-gate.json'),'utf8'))
  assert.ok(gate.finalPackageVerified)
  const {FINAL_DIR}=await import('./recovery-media-inventory-final.mjs')
  const approval=JSON.parse(await readFile(path.join(FINAL_DIR,'owner-approved-media.json'),'utf8'))
  const copies=approval.decisions.filter(item=>item.disposition==='static-copy').sort((a,b)=>b.bytes-a.bytes)
  for(const item of copies.slice(0,3))cases.push([item.path,item.path.slice(1)])
  cases.push(['/placeholder-image.jpg','placeholder-image.jpg'])
}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const report={checkedAt:new Date().toISOString(),buildId,checks:[],passed:false}
for(const [route,file] of cases) {
  const response=await fetch(deployment.url+route,{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(20000)})
  const bytes=Buffer.from(await response.arrayBuffer()),expected=await readFile(path.join(RECOVERY,'deploy',file))
  const expectedStatus=file==='404.html'?404:200
  const record={route,status:response.status,type:response.headers.get('content-type'),noindex:response.headers.get('x-robots-tag'),bytes:bytes.length,sha256:sha(bytes),matched:sha(bytes)===sha(expected)}
  record.passed=record.status===expectedStatus&&record.matched&&/noindex/.test(record.noindex)
  report.checks.push(record)
}
report.passed=report.checks.every(check=>check.passed)
await writeFile(path.join(RECOVERY,'byte-checks.json'),JSON.stringify(report,null,2))
console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,failures:report.checks.filter(check=>!check.passed)}))
if(!report.passed)process.exitCode=1
