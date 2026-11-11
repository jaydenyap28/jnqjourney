// Exhaustive route checks against our own static Preview. No content mutation.
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {RECOVERY} from './recovery-sources.mjs'
const json=async name=>JSON.parse(await readFile(path.join(RECOVERY,name),'utf8'))
const deployment=await json('deployment.json'),bundle=await json('package-result.json')
assert.ok(deployment.success&&deployment.environment==='preview')
const origin=deployment.url
const delta=process.argv.includes('--delta')
const changed=new Set((bundle.linkAliases||[]).map(item=>item.from))
const rules=(await readFile(path.join(RECOVERY,'deploy/_redirects'),'utf8')).trim().split('\n').map(line=>line.trim().split(/\s+/)).filter(rule=>rule.length===3&&rule[2]!=='200'&&(!delta||changed.has(rule[0])))
const pages=bundle.pages.filter(page=>!delta||['/en/packages','/en/disclaimer'].includes(page.route))
const tests=[...pages.map(page=>({path:page.route,status:200})),...rules.map(([from,to,status])=>({path:from,status:Number(status),to})),
  {path:'/does-not-exist-static-recovery-20261111',status:404},{path:'/admin',status:404},
  ...['/robots.txt','/sitemap.xml','/api/locations','/api/spots/turtle-alley-636','/public-data/notes.json','/public-data/guides.json'].map(p=>({path:p,status:200}))]
const results=new Array(tests.length)
let cursor=0
await Promise.all(Array.from({length:8},async()=>{
  while(cursor<tests.length){const index=cursor++,test=tests[index]
    try {
      const response=await fetch(origin+test.path,{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(20000)})
      const target=response.headers.get('location'),noindex=response.headers.get('x-robots-tag')||''
      results[index]={...test,actual:response.status,location:target,noindex}
      results[index].passed=response.status===test.status&&/noindex/.test(noindex)&&(!test.to||new URL(target,origin).href===origin+test.to)
      await response.body?.cancel()
    }catch(error){results[index]={...test,passed:false,error:error.cause?.code||error.name}}
  }
}))
const report={checkedAt:new Date().toISOString(),origin,scope:delta?'ROUTE_FIX_DELTA':'FULL_ROUTE_INVENTORY',total:tests.length,pages:pages.length,totalPageInventory:bundle.pages.length,redirects:rules.length,passed:results.every(row=>row.passed),results}
await writeFile(path.join(RECOVERY,'http-checks.json'),JSON.stringify(report,null,2))
console.log(JSON.stringify({total:report.total,pages:report.pages,redirects:report.redirects,passed:report.passed,failures:results.filter(row=>!row.passed).slice(0,20)}))
if(!report.passed)process.exitCode=1
