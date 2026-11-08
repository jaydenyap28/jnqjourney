import { mkdir,copyFile,writeFile,readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import path from 'node:path'
const out=path.resolve('artifacts/cloudflare-spot-loop/out')
await mkdir(path.join(out,'admin'),{recursive:true})
for(const [src,dest] of [['worker.mjs','_worker.js'],['admin.html','admin/cloudflare-spot.html'],['editor.js','candidate-editor.js'],['candidate.css','candidate.css']])await copyFile(`cloudflare/spot-loop/${src}`,path.join(out,dest))
await writeFile(path.join(out,'404.html'),'<!doctype html><meta name="robots" content="noindex,nofollow"><title>404 · JnQ Journey candidate</title><h1>Not Found</h1>')
await writeFile(path.join(out,'index.html'),'<!doctype html><meta name="robots" content="noindex,nofollow"><title>JnQ Journey candidate</title><a href="/admin/cloudflare-spot">Spot 隔离发布测试</a>')
await writeFile(path.join(out,'robots.txt'),'User-agent: *\nDisallow: /\n')
await writeFile(path.join(out,'_headers'),"/*\n  X-Robots-Tag: noindex, nofollow\n  Cache-Control: no-store\n  X-Content-Type-Options: nosniff\n  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self' https://41feff7cd62964f2eb33bb82508509a1.r2.cloudflarestorage.com/jnqjourney-spot-loop-isolated-media/_candidate-staging/; form-action 'self'; frame-ancestors 'none'; base-uri 'none'\n")
// All representations of Spot HTML/JSON/media pass through the live gate.
await writeFile(path.join(out,'_routes.json'),JSON.stringify({version:1,include:['/api/*','/spot/*','/en/spot/*','/media/candidate/*','/_next/data/*'],exclude:[]},null,2))
const worker=await readFile(path.join(out,'_worker.js'))
const report={output:out,workerBytes:worker.length,workerGzipBytes:gzipSync(worker).length,nodeDependencies:0,buildsPerSpotSave:0,containsStaticSpotHtml:false,productionReady:false}
await writeFile(path.resolve('artifacts/cloudflare-spot-loop/package.json'),JSON.stringify(report,null,2))
console.log(JSON.stringify(report))
