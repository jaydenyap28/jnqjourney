import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Offline inventory only. A reference does not prove object existence, image
// identity, current publication, byte size, or that an object is safe to delete.
export async function auditLocalResourceRefs(root = process.cwd()) {
  const files = []
  async function walk(dir) {
    for (const entry of await readdir(path.join(root, dir), { withFileTypes: true })) {
      const file = `${dir}/${entry.name}`
      if (entry.isDirectory()) await walk(file)
      else if (entry.name.endsWith('.json')) files.push(file)
    }
  }
  await walk('public-data')
  await walk('data')
  const refs = new Map()
  const invalidJson = []
  const snapshots = []
  function visit(value, file, field = '') {
    if (typeof value === 'string') {
      // Include URLs embedded in markdown/HTML as well as image fields.
      for (const match of value.matchAll(/https?:\/\/[^\s<>"'\])]+/g)) {
        let url
        try { url = new URL(match[0]) } catch { continue }
        const provider = url.hostname.endsWith('.supabase.co') && url.pathname.includes('/storage/v1/') ? 'supabase-storage'
          : url.hostname.endsWith('.r2.dev') ? 'r2' : 'other'
        if (provider === 'other' && !/image|thumbnail|gallery|cover|brochure/i.test(field)) continue
        const key = `${url.origin}${url.pathname}`
        const ref = refs.get(key) || { url: key, provider, occurrences: 0, files: new Set(), fields: new Set() }
        ref.occurrences++
        ref.files.add(file)
        ref.fields.add(field)
        refs.set(key, ref)
      }
    } else if (Array.isArray(value)) value.forEach(item => visit(item, file, field))
    else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) visit(item, file, key)
  }
  for (const file of files.sort()) {
    try {
      const raw = await readFile(path.join(root, file), 'utf8')
      const value = JSON.parse(raw.replace(/^\uFEFF/, ''))
      visit(value, file)
      if (file.startsWith('public-data/') && !file.startsWith('public-data/spots/')) {
        snapshots.push({ file, bytes: Buffer.byteLength(raw), source: value.source || null,
          counts: Object.fromEntries(Object.entries(value).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length])) })
      }
    } catch { invalidJson.push(file) }
  }
  const references = [...refs.values()].map(ref => ({ ...ref, files: [...ref.files].sort(), fields: [...ref.fields].sort() })).sort((a, b) => a.url.localeCompare(b.url))
  return { scope: 'Local data/ and public-data/ JSON only; no network or credentials; custom R2 domains may be classified as other.',
    filesScanned: files.length, invalidJson, snapshots,
    providers: Object.fromEntries(['supabase-storage', 'r2', 'other'].map(provider => {
      const subset = references.filter(ref => ref.provider === provider)
      return [provider, { uniqueUrls: subset.length, occurrences: subset.reduce((n, ref) => n + ref.occurrences, 0) }]
    })), references }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await auditLocalResourceRefs()
  await mkdir('artifacts/zero-deployment', { recursive: true })
  await writeFile('artifacts/zero-deployment/local-resource-refs.json', `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({ filesScanned: report.filesScanned, invalidJson: report.invalidJson, providers: report.providers, snapshots: report.snapshots }, null, 2))
}
