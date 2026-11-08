// Local Pages-like static preview. No production API proxy and no write routes.
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
const out = path.resolve('artifacts/cloudflare-candidate/source/out')
const redirects = (await readFile(path.join(out,'_redirects'),'utf8')).trim().split('\n').map(line=>line.split(/\s+/))
const mime = {'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain','.xml':'application/xml','.png':'image/png','.woff2':'font/woff2','.webp':'image/webp','.svg':'image/svg+xml'}
const server=createServer(async (req,res)=>{
  res.setHeader('X-Robots-Tag','noindex, nofollow')
  res.setHeader('X-JnQ-Candidate','compatibility-sample')
  res.setHeader('Cache-Control','no-store')
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end('Candidate is read-only');return}
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname)
    const redirect=redirects.find(r=>r[0]===pathname)
    if(redirect){res.writeHead(Number(redirect[2]),{Location:redirect[1]});res.end();return}
    const relative=pathname==='/'?'index.html':pathname.slice(1)
    const candidates=[relative,`${relative}.html`,`${relative}/index.html`]
    let file
    for(const candidate of candidates){const full=path.resolve(out,candidate);if(!full.startsWith(`${out}${path.sep}`))continue;try{if((await stat(full)).isFile()){file=full;break}}catch{}}
    if(!file){file=path.join(out,'404.html');res.statusCode=404}
    res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream')
    const body=await readFile(file);res.end(req.method==='HEAD'?undefined:body)
  } catch {res.writeHead(400);res.end('Bad Request')}
})
server.listen(8788,'127.0.0.1',()=>console.log('Read-only compatibility sample: http://127.0.0.1:8788'))
