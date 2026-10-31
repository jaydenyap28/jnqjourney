import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Current runtime contract; archived per-Spot JSON is no longer the reader. */
export async function requiredBilingualFallbacks(root = process.cwd()) {
  const source = await fs.readFile(path.join(root,'lib/server/public-fallback-snapshot.ts'),'utf8')
  const snapshots = [...new Set(source.match(/public-data\/fallback\/[a-zA-Z0-9-]+\.json/g) || [])]
  if (snapshots.length !== 1) throw Error('Cannot determine the active public fallback from its owning reader')
  return ['data/location-slugs.json','data/guides.json','data/notes.json','public-data/guide-trip-costs.json',...snapshots]
}

export async function checkBilingualBundle(root = process.cwd()) {
  const manifestPath = path.join(root,'.next/server/pages/en/[[...path]].js.nft.json')
  const manifest = JSON.parse(await fs.readFile(manifestPath,'utf8'))
  const files = new Set(manifest.files.map(file=>path.resolve(path.dirname(manifestPath),file)))
  const required = await requiredBilingualFallbacks(root)
  return { required, missing: required.filter(file=>!files.has(path.resolve(root,file))) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await checkBilingualBundle()
    console.log(JSON.stringify({status:result.missing.length?'FAIL':'PASS',scope:'Existing serverless manifest only; candidate build identity must be verified separately',...result},null,2))
    if (result.missing.length) process.exitCode=1
  } catch { console.log(JSON.stringify({status:'UNVERIFIED',reason:'Build manifest absent or unreadable; run only after an authorized fresh build'}));process.exitCode=2 }
}
