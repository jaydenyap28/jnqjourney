// Build an isolated, credential-free compatibility sample. Never rewrites app/.
import { execFileSync, spawnSync } from 'node:child_process'
import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const readiness = process.argv.includes('--public-readiness')
const base = path.join(root, readiness ? 'artifacts/cloudflare-public-readiness' : 'artifacts/cloudflare-candidate')
const source = path.join(base, 'source')
const json = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'))
await mkdir(source, { recursive: true })
// Refuse stale staging instead of recursively deleting any workspace directory.
if ((await readdir(source)).length) throw new Error('Staging already exists; archive it before preparing another candidate.')
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
for (const file of files) {
  if (!/^(app\/|pages\/|components\/|lib\/|data\/|public\/|public-data\/|types\/|[^/]+\.(?:json|mjs|js|ts|css)$)/.test(file)) continue
  if (/^\.env|^app\/api\/|^pages\/api\/|^middleware\.|^tsconfig\.tsbuildinfo|\.bak$/.test(file)) continue
  const dest = path.join(source, file)
  await mkdir(path.dirname(dest), { recursive: true })
  await copyFile(path.join(root, file), dest)
}
// Node resolves dependencies from the workspace's parent node_modules. No
// Windows junction privileges or duplicate dependency installation is needed.
const fallback = await json('public-data/fallback/2026-10-30.json')
const guides = readiness ? (await json('artifacts/cloudflare-public-readiness/sources/guides.json')).guides : await json('data/guides.json')
const notes = (readiness ? (await json('artifacts/cloudflare-public-readiness/sources/notes.json')).notes : await json('data/notes.json')).filter(n => n.published)
const packages = await json('data/travel-packages-snapshot.json')
const slugMap = await json('data/location-slugs.json')
const pilot = await json('public-data/i18n/en/records.json')
const sampledSpots = ['turtle-alley-636','bukit-tun-razak-274']
const noteSlug = 'malaysia-turtle-night-terengganu'
if (readiness) {
  // Only the staging copy receives the public snapshots, never app/ or DB.
  for (const [name,id,slug] of [['spot636Canonical',636,sampledSpots[0]],['spot274',274,sampledSpots[1]]]) {
    const {schemaVersion,spot} = await json(`artifacts/cloudflare-public-readiness/sources/${name}.json`)
    if (schemaVersion !== 1 || spot.id !== id || spot.slug !== slug || ![null,'published'].includes(spot.publication_status) || !fallback.eligibility[id] || fallback.withdrawnIds.includes(id)) throw new Error('Unexpected representative public Spot')
    fallback.spots[id] = spot
  }
  const current = await json('artifacts/cloudflare-public-readiness/sources/english.json')
  const representative = current.records.filter(record => record.entityType === 'spot' && [274,636].includes(Number(record.entityId)))
  if (current.schemaVersion !== 1 || current.locale !== 'en' || representative.length !== 2) throw new Error('Unexpected representative public localizations')
  pilot.records = [...pilot.records.filter(record => !(record.entityType === 'spot' && [274,636].includes(Number(record.entityId)))), ...representative]
  for (const [file,value] of [['public-data/fallback/2026-10-30.json',fallback],['public-data/i18n/en/records.json',pilot],['data/guides.json',guides],['data/notes.json',notes]]) {
    await writeFile(path.join(source,file), JSON.stringify(value))
  }
  if (!notes.find(note => note.slug === noteSlug && note.aliases?.includes('turtle'))) throw new Error('Historical Note alias missing')
}
const spot = fallback.locations.find(s => slugMap[String(s.id)]) || fallback.locations[0]
const spotSlug = slugMap[String(spot.id)] ? `${slugMap[String(spot.id)]}-${spot.id}` : spot.slug
const params = {
  'spot/[slug]': (readiness ? sampledSpots : [spotSlug]).map(slug => ({ slug })),
  'region/[slug]': [{ slug: fallback.regions[0].slug }],
  'guide/[slug]': [{ slug: guides[0].slug }],
  'notes/[slug]': readiness ? [{slug:noteSlug}] : notes.slice(0, 1).map(n => ({ slug: n.slug })),
  'packages/[slug]': packages.packages.filter(p => p.slug !== 'hainan').map(p => ({ slug: p.slug })),
  'packages/[slug]/[optionSlug]': packages.options.filter(o => o.package_id === packages.packages.find(p => p.slug === 'batam-3d2n')?.id).slice(0, 1).map(o => ({ slug: 'batam-3d2n', optionSlug: o.slug })),
  'packages/hainan/[optionSlug]': packages.options.filter(o => o.package_id === packages.packages.find(p => p.slug === 'hainan')?.id).slice(0, 1).map(o => ({ optionSlug: o.slug })),
  'admin/edit/[id]': [{ id: String(spot.id) }],
  'admin/packages/[id]/preview': packages.packages.slice(0, 1).map(p => ({ id: String(p.id) })),
  'admin/guides/[slug]/draft-preview': [{ slug: guides[0].slug }],
  'admin/guides/[slug]/actual-spend-preview': [{ slug: guides[0].slug }],
  'admin/guides/[slug]/price-highlights': [{ slug: guides[0].slug }],
}
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  return (await Promise.all(entries.map(e => e.isDirectory() ? walk(path.join(dir, e.name)) : path.join(dir, e.name)))).flat()
}
for (const file of await walk(path.join(source, 'app'))) {
  if (!file.endsWith('/page.tsx') && !file.endsWith('\\page.tsx') && !/sitemap\.ts$/.test(file)) continue
  let text = await readFile(file, 'utf8')
  text = text.replace(/export const dynamic\s*=\s*['"]force-dynamic['"]/g, "export const dynamic = 'force-static'")
    .replace(/export const revalidate\s*=\s*\d+/g, 'export const revalidate = false')
  const route = path.relative(path.join(source, 'app'), path.dirname(file)).replaceAll('\\', '/')
  if (route.includes('[')) {
    if (!Object.hasOwn(params, route)) throw new Error(`Unmapped dynamic route: ${route}`)
    text = text.replace(/export function generateStaticParams\(\)\s*\{ return \[\] \}/g, '')
    const generator = `\nexport function generateStaticParams() { return ${JSON.stringify(params[route])} }\n`
    if (/^['"]use client['"]/.test(text)) {
      await writeFile(path.join(path.dirname(file), 'candidate-client.tsx'), text)
      text = `import Client from './candidate-client'\n${generator}\nexport default function Page({ params }: {params: any}) { return <Client params={params} /> }\n`
    } else text += generator
  }
  await writeFile(file, text)
}
const englishPaths = ['/en', '/en/about', `/en/guide/${guides[0].slug}`, `/en/notes/${readiness ? noteSlug : notes[0]?.slug}`, ...(readiness ? sampledSpots.map(slug => `/en/spot/${slug}`) : [])]
const englishFile = path.join(source, 'pages/en/[[...path]].tsx')
let english = await readFile(englishFile, 'utf8')
const start = english.indexOf('export const getStaticPaths:')
const end = english.indexOf('export const getStaticProps:')
english = english.slice(0, start) + `export const getStaticPaths: GetStaticPaths = async () => ({paths:${JSON.stringify(englishPaths)},fallback:false})\n` + english.slice(end)
english = english.replace(/,revalidate:600/g, '')
await writeFile(englishFile, english)
await writeFile(path.join(source, 'next.config.mjs'), `export default {output:'export',images:{unoptimized:true},experimental:{cpus:2},eslint:{ignoreDuringBuilds:true},typescript:{ignoreBuildErrors:false}}\n`)
await writeFile(path.join(source, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2017', lib: ['dom','dom.iterable','esnext'], allowJs: true, allowImportingTsExtensions: true, skipLibCheck: true, strict: true, noEmit: true, esModuleInterop: true, module: 'esnext', moduleResolution: 'bundler', resolveJsonModule: true, isolatedModules: true, jsx: 'preserve', incremental: true, plugins: [{name:'next'}], paths: {'@/*':['./*']} }, include: ['next-env.d.ts','app/**/*.ts','app/**/*.tsx','pages/**/*.tsx','components/**/*.tsx','lib/**/*.ts','types/**/*.ts','.next/types/**/*.ts'], exclude: ['node_modules'] }, null, 2))
// Client construction requires a URL/key. These are inert sample values, never
// production access. Server readers use the bundled, explicitly stale backup.
const supabaseFile = path.join(source, 'lib/supabase.ts')
let supabase = await readFile(supabaseFile, 'utf8')
supabase = supabase.replace('process.env.NEXT_PUBLIC_SUPABASE_URL!', "(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://candidate.invalid')").replace('process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!', "(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'candidate-no-access')")
await writeFile(supabaseFile, supabase)
const manifest = { mode: readiness ? 'public-readiness-sample' : 'compatibility-sample', productionReady: false, sourceCommit: execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(), snapshotVersion: fallback.version, sampledParams: params, englishPaths, inventory: { spots: fallback.locations.length, regions: fallback.regions.length, guides: guides.length, notes: notes.length, packages: packages.packages.length, options: packages.options.length, localizations: pilot.records.length }, blockers: readiness ? ['Scoped static sample with no live publication or complete URL inventory.', 'No production API runtime or authoritative rollback target.'] : ['Sample only: complete fresh publication inventory required.', 'No dynamic API runtime connected; admin saves/uploads are not enabled.', 'Automatic publication outbox migration is unapplied.', 'Cloudflare account authorization and deployed Free-plan CPU measurement required.'] }
await writeFile(path.join(base, 'manifest.json'), JSON.stringify(manifest, null, 2))
if (process.argv.includes('--build')) {
  // Whitelist environment: .env.local is never copied or loaded, and secrets
  // inherited by the parent are not passed to this process.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(PATH|Path|SystemRoot|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC|PATHEXT|APPDATA|LOCALAPPDATA|USERPROFILE|NUMBER_OF_PROCESSORS)$/i.test(k)))
  Object.assign(env, { NODE_ENV:'production', NEXT_TELEMETRY_DISABLED:'1', NEXT_PUBLIC_SITE_URL:'https://www.jnqjourney.com' })
  const result = spawnSync(process.execPath, [path.join(root,'node_modules/next/dist/bin/next'),'build'], {cwd:source,env,stdio:'inherit'})
  if (result.status !== 0) process.exit(result.status || 1)
}
console.log(JSON.stringify({ source, manifest: path.join(base,'manifest.json'), next: 'node scripts/cloudflare/package-candidate.mjs' }))
