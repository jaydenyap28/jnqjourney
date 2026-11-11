import { readFile, writeFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
if(process.argv.includes('--recovery')) { await (await import('./package-static-recovery.mjs')).packageRecovery(); process.exit(0) }
const base = path.resolve('artifacts/cloudflare-candidate')
const out = path.join(base, 'source/out')
const manifest = JSON.parse(await readFile(path.join(base,'manifest.json'),'utf8'))
await stat(path.join(out, '404.html')) // Required: disables Pages' SPA fallback.
await writeFile(path.join(out, '_headers'), `/*\n  X-Robots-Tag: noindex, nofollow\n  X-JnQ-Candidate: compatibility-sample\n  Cache-Control: public, max-age=0, must-revalidate\n/_next/static/*\n  Cache-Control: public, max-age=31536000, immutable\n/admin/*\n  Cache-Control: no-store\n`)
// Deliberate sample of existing middleware/route aliases, preserving statuses.
const redirects = [
  ...['tioman-aman-resort-3d2n','tioman-paya-beach-resort-3d2n','tioman-barat-resort-3d2n'].map(s => `/packages/${s} /packages/tioman-3d2n 308`),
  '/packages/batam-3d2n/value-499 /packages/batam-3d2n/amazing-promo-499 307',
  '/packages/batam-3d2n/new-classic-599 /packages/batam-3d2n/new-version-599 307',
]
const sampleSpot = manifest.sampledParams['spot/[slug]'][0].slug
const sampleId = sampleSpot.match(/-(\d+)$/)?.[1]
if (sampleId && sampleSpot !== `spot-${sampleId}`) redirects.push(`/spot/spot-${sampleId} /spot/${sampleSpot} 301`)
await writeFile(path.join(out, '_redirects'), `${redirects.join('\n')}\n`)
async function walk(dir) { return (await Promise.all((await readdir(dir,{withFileTypes:true})).map(e => e.isDirectory()?walk(path.join(dir,e.name)):path.join(dir,e.name)))).flat() }
const files = await walk(out)
const oversized = []
for (const file of files) if ((await stat(file)).size > 25*1024*1024) oversized.push(path.relative(out,file))
const secretPatterns = [/SUPABASE_SERVICE_ROLE_KEY/, /R2_SECRET_ACCESS_KEY/, /BEGIN (?:RSA |EC )?PRIVATE KEY/, /"role"\s*:\s*"service_role"/]
const leaks = []
for (const file of files.filter(f => /\.(html|js|json|txt)$/.test(f))) {
  const raw = await readFile(file,'utf8')
  if (secretPatterns.some(p => p.test(raw))) leaks.push(path.relative(out,file))
}
const result = {files:files.length, maxFiles:20000, oversized, leaks, deployableSample:files.length<=20000&&!oversized.length&&!leaks.length, productionReady:false}
await writeFile(path.join(base,'package-result.json'),JSON.stringify(result,null,2))
console.log(JSON.stringify(result))
if (!result.deployableSample) process.exitCode=1
