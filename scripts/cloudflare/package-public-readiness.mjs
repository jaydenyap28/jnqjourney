import assert from 'node:assert/strict'
import {copyFile,mkdir,readFile,readdir,stat,writeFile} from 'node:fs/promises'
import path from 'node:path'

const root='artifacts/cloudflare-public-readiness'
const built=root+'/source/out'
const out=root+'/deploy'
const routes=['/','/en','/spot/turtle-alley-636','/spot/bukit-tun-razak-274','/en/spot/bukit-tun-razak-274','/en/spot/turtle-alley-636','/notes/malaysia-turtle-night-terengganu','/en/notes/malaysia-turtle-night-terengganu']
const manifest=JSON.parse(await readFile(root+'/manifest.json'))
assert.equal(manifest.mode,'public-readiness-sample')
await mkdir(out,{recursive:true})
assert.equal((await readdir(out)).length,0,'Existing deployment bundle must be preserved')
const files=[]
async function copy(dir=''){
  for(const item of await readdir(path.join(built,dir),{withFileTypes:true})){
    const relative=path.posix.join(dir,item.name)
    if(/^admin(?:\/|\.|$)|^_next\/(?:data\/[^/]+\/admin|static\/chunks\/app\/admin)(?:\/|\.|$)/.test(relative))continue
    if(item.isDirectory()){
      await mkdir(path.join(out,relative),{recursive:true})
      await copy(relative)
    }else if(item.isFile()){
      assert.ok((await stat(path.join(built,relative))).size<=25*1024*1024)
      await copyFile(path.join(built,relative),path.join(out,relative))
      files.push(relative)
    }
  }
}
await copy()
for(const [source,target] of [['legacy-media-preview.mjs','_worker.js'],['worker.mjs','worker.mjs'],['spot-contract.mjs','spot-contract.mjs'],['media-identity.mjs','media-identity.mjs']])await copyFile('cloudflare/spot-loop/'+source,out+'/'+target)
await writeFile(out+'/_routes.json',JSON.stringify({version:1,include:['/locations/*','/media/legacy/*'],exclude:[]},null,2))
await writeFile(out+'/_headers','/*\n  X-Robots-Tag: noindex, nofollow\n  Cache-Control: no-store\n  X-Content-Type-Options: nosniff\n')
await writeFile(out+'/robots.txt','User-agent: *\nDisallow: /\n')
const aliases=[
  ['/spot/turtle-alley-turtle-alley-636','/spot/turtle-alley-636'],
  ['/spot/spot-274','/spot/bukit-tun-razak-274'],
  ['/en/spot/spot-274','/en/spot/bukit-tun-razak-274'],
  ['/notes/turtle','/notes/malaysia-turtle-night-terengganu'],
  ['/en/notes/turtle','/en/notes/malaysia-turtle-night-terengganu'],
]
for(const [,destination] of aliases)assert.ok(files.includes(destination.slice(1)+'.html'))
await writeFile(out+'/_redirects',aliases.map(([from,to])=>`${from} ${to} 301`).join('\n')+'\n')
for(const file of files.filter(name=>/\.(html|js|json|txt)$/.test(name))){
  const value=await readFile(out+'/'+file,'utf8')
  assert.ok(!/SUPABASE_SERVICE_ROLE_KEY|R2_SECRET_ACCESS_KEY|BEGIN (?:RSA |EC )?PRIVATE KEY|sb_secret_[A-Za-z0-9_-]{20,}/.test(value),'Credential marker in public build')
}
const sitemap=await readFile(out+'/sitemap.xml','utf8')
const urls=[...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match=>new URL(match[1]).pathname)
const rendered=routes.map(route=>({route,exists:files.includes(route==='/'?'index.html':route.slice(1)+'.html'),inSitemap:urls.includes(route)}))
assert.ok(rendered.every(page=>page.exists))
assert.ok(files.includes('404.html')&&files.length+8<=20000)
const result={routes:rendered,aliases,sitemapEntries:urls.length,filesCopied:files.length,robotsPreview:'Disallow: /',productionReady:false}
await writeFile(root+'/package-result.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify(result,null,2))
