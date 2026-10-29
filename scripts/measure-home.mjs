// Local HTTP/SSR evidence only; this does not claim browser performance.
import fs from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

const label = process.argv[2] || 'before'
const origin = process.argv[3] || 'http://127.0.0.1:3010'
const timings = []
let html = ''
for (let i = 0; i < 4; i++) {
  const start = performance.now()
  const response = await fetch(origin)
  if (!response.ok) throw new Error(`Home returned ${response.status}`)
  html = await response.text()
  timings.push(Math.round(performance.now() - start))
}
const scripts = [...new Set([...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(match => match[1].replaceAll('&amp;', '&')))]
const js = await Promise.all(scripts.map(async url => {
  const response = await fetch(new URL(url, origin))
  const body = Buffer.from(await response.arrayBuffer())
  return { url, bytes: body.length, gzipBytes: gzipSync(body).length }
}))
const images = [...html.matchAll(/<img\s[^>]*>/g)].map(match => match[0])
const result = {
  label, mode: 'Next development server, local bundled public snapshots; HTTP/SSR only',
  htmlBytes: Buffer.byteLength(html), htmlGzipBytes: gzipSync(html).length,
  requestMs: timings, warmMedianMs: timings.slice(1).sort((a, b) => a - b)[1],
  scriptRequests: scripts.length, jsBytes: js.reduce((sum, item) => sum + item.bytes, 0),
  jsGzipBytes: js.reduce((sum, item) => sum + item.gzipBytes, 0),
  imageElements: images.length, imagesWithSizes: images.filter(tag => tag.includes('sizes=')).length,
  htmlElements: (html.match(/<[a-z][a-z0-9-]*(?:\s|>)/g) || []).length,
  spotLinkElements: (html.match(/href="\/spot\//g) || []).length,
  js,
}
await fs.mkdir('artifacts/experience-performance', { recursive: true })
await fs.writeFile(`artifacts/experience-performance/home-${label}.html`, html)
await fs.writeFile(`artifacts/experience-performance/${label}.json`, JSON.stringify(result, null, 2))
console.log(JSON.stringify({ ...result, js: undefined }, null, 2))
