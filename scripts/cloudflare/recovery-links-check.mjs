import {readFile,writeFile,stat} from 'node:fs/promises'
import path from 'node:path'
import {RECOVERY} from './recovery-sources.mjs'
const out=path.join(RECOVERY,'deploy')
const bundle=JSON.parse(await readFile(path.join(RECOVERY,'package-result.json'),'utf8'))
const valid=new Set([...bundle.pages.map(item=>item.route),...bundle.redirects.map(item=>item.from)])
const unresolved=new Map(),cache=new Map()
for(const page of bundle.pages) {
  const html=await readFile(path.join(out,page.file),'utf8')
  for(const match of html.matchAll(/<a\b[^>]*href="([^"]*)"/g)) {
    const href=match[1].replaceAll('&amp;','&')
    if(!href.startsWith('/')||href.startsWith('//'))continue
    const pathname=new URL(href,'https://www.jnqjourney.com').pathname
    if(valid.has(pathname)||pathname.startsWith('/_next/'))continue
    if(!cache.has(pathname))cache.set(pathname,await stat(path.join(out,pathname.slice(1))).then(()=>true,()=>false))
    if(cache.get(pathname))continue
    const entry=unresolved.get(pathname)||{path:pathname,owners:[]}
    if(!entry.owners.includes(page.route))entry.owners.push(page.route)
    unresolved.set(pathname,entry)
  }
}
const report={checkedAt:new Date().toISOString(),pages:bundle.pages.length,unresolved:[...unresolved.values()]}
await writeFile(path.join(RECOVERY,'link-checks.json'),JSON.stringify(report,null,2))
console.log(JSON.stringify({pages:report.pages,unresolved:report.unresolved.map(item=>({path:item.path,owners:item.owners.length,examples:item.owners.slice(0,2)}))}))
if(report.unresolved.length)process.exitCode=1
