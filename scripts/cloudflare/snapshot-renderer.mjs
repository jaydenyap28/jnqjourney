import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

const round = process.env.JNQ_SNAPSHOT_RUN
assert.ok(!round || /^[a-z][a-z0-9-]{1,40}$/.test(round), 'INVALID_SNAPSHOT_ROUND')
export const ROOT = path.resolve(round ? `artifacts/cloudflare-snapshot-${round}` : 'artifacts/cloudflare-snapshot-poc')
export const SITE = path.join(ROOT, 'renderer')
export const PREVIEW = 'https://codex-snapshot-poc.jnqjourney-spot-loop-migration-candidate.pages.dev'
export const FIXTURE_ID = 92061
export const SLUG = 'consumer-fixture-92061-92061'
export const LOCAL = 'http://127.0.0.1:4417'
const next = createRequire(import.meta.url).resolve('next/dist/bin/next')
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|SystemRoot|WINDIR|TEMP|TMP|COMSPEC|PATHEXT|APPDATA|LOCALAPPDATA|USERPROFILE|NUMBER_OF_PROCESSORS)$/i.test(key)))
Object.assign(env, {
  NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_SUPABASE_URL: 'https://snapshot-renderer.invalid',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'inert-snapshot-renderer-key',
  NEXT_PUBLIC_SITE_URL: PREVIEW,
})

async function replace(relative, needle, replacement) {
  const file = path.join(SITE, relative)
  const source = await readFile(file, 'utf8')
  assert.ok(source.includes(needle), `Renderer adapter no longer matches ${relative}`)
  await writeFile(file, source.replace(needle, replacement))
}

async function prepare() {
  await mkdir(SITE, { recursive: true })
  assert.equal((await readdir(SITE)).length, 0, 'Renderer staging is already populated')
  const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0')
  for (const file of tracked) {
    if (!/^(app\/|pages\/|components\/|lib\/|data\/|public\/|public-data\/|types\/|cloudflare\/spot-loop\/[^/]+\.mjs$|(?:package(?:-lock)?\.json|tsconfig\.json|middleware\.ts|next\.config\.mjs|postcss\.config\.mjs)$)/.test(file) || /(^|\/)\.(?:env|dev\.vars)|\.bak$/.test(file)) continue
    const target = path.join(SITE, file)
    await mkdir(path.dirname(target), { recursive: true })
    await copyFile(file, target)
  }
  // Data adapters and diagnostics apply only to this isolated renderer copy.
  await writeFile(path.join(SITE, 'snapshot-row.json'), 'null\n')
  await writeFile(path.join(SITE, 'data/location-slugs.json'), '{}\n')
  await replace('lib/server/public-spot-projection.ts', 'export async function readPublicRows(ids?: number[]) {', `export async function readPublicRows(ids?: number[]) {
  const {readFile} = await import('node:fs/promises')
  const row = JSON.parse(await readFile('snapshot-row.json', 'utf8'))
  if (!row || (ids && !ids.includes(${FIXTURE_ID}))) return []
  return validatePublicRows([row], [${FIXTURE_ID}])
}
async function unusedRemoteReader(ids?: number[]) {`)
  await replace('lib/server/public-read-source.ts', 'export async function readPrivatePublicFeed<T>(key: string): Promise<T> {', `export async function readPrivatePublicFeed<T>(key: string): Promise<T> {
  const inputs: Record<string, unknown> = {
    'regions.json': {regions:[]}, 'guides.json': {guides:[]}, 'notes.json': {notes:[]},
    'guide-trip-costs.json': {schemaVersion:1,tripCosts:[]},
    'i18n/en/records.json': {schemaVersion:1,locale:'en',version:'synthetic-snapshot',records:[]},
  }
  if (!Object.hasOwn(inputs, key)) throw new PublicReadUnavailable()
  return inputs[key] as T
}
async function unusedRemoteFeed<T>(key: string): Promise<T> {`)
  await replace('lib/server/travel-packages.ts', 'export async function readPublishedPackagesUncached() {', `export async function readPublishedPackagesUncached(): Promise<TravelPackage[]> { return [] }
async function unusedRemotePackages() {`)
  await replace('next.config.mjs', 'export default nextConfig;', `export default {
  ...nextConfig, experimental: {cpus: 2}, eslint: {ignoreDuringBuilds: true},
};`)
  if (round) {
    for (const file of ['app/layout.tsx', 'pages/_app.tsx']) {
      await replace(file, "import { Analytics } from '@vercel/analytics/react'", '')
      await replace(file, "import { SpeedInsights } from '@vercel/speed-insights/next'", '')
      await replace(file, file === 'pages/_app.tsx' ? '<Analytics/>' : '<Analytics />', '')
      await replace(file, file === 'pages/_app.tsx' ? '<SpeedInsights/>' : '<SpeedInsights />', '')
    }
    const probe = await readFile(new URL('./snapshot-hydration-probe.tsx', import.meta.url), 'utf8')
    await writeFile(path.join(SITE, 'components/SnapshotHydrationProbe.tsx'), probe)
    await replace('app/layout.tsx', "import { Suspense } from 'react'", "import { Suspense } from 'react'\nimport SnapshotHydrationProbe from '@/components/SnapshotHydrationProbe'")
    await replace('app/layout.tsx', '{children}', '{children}<SnapshotHydrationProbe />')
    await replace('pages/_app.tsx', "import type { AppProps } from 'next/app'", "import type { AppProps } from 'next/app'\nimport { useEffect } from 'react'")
    await replace('pages/_app.tsx', '  return <div', `  useEffect(() => {
    Object.assign(window, { __JNQ_SNAPSHOT_PAGES_HYDRATED: { timeOrigin: performance.timeOrigin } })
  }, [])
  return <div`)
  }
}

export function runNext(args, stdio = 'inherit') {
  return spawn(process.execPath, [next, ...args], { cwd: SITE, env, stdio, windowsHide: true })
}

if (['--build', '--compile-staged'].includes(process.argv[2])) {
  if (process.argv[2] === '--build') await prepare()
  else {
    assert.ok(round, 'ISOLATED_ROUND_REQUIRED')
    const layout = await readFile(path.join(SITE, 'app/layout.tsx'), 'utf8')
    assert.ok(layout.includes('<SnapshotHydrationProbe />') && !layout.includes('@vercel/'), 'PREPARED_RENDERER_REQUIRED')
  }
  const compiler = runNext(['build'])
  const code = await new Promise((resolve, reject) => { compiler.on('error', reject); compiler.on('exit', resolve) })
  if (code !== 0) throw new Error('NEXT_RENDERER_BUILD_FAILED')
  const buildId = (await readFile(path.join(SITE, '.next/BUILD_ID'), 'utf8')).trim()
  await writeFile(path.join(ROOT, 'build.json'), JSON.stringify({ buildId, next: '14.2.35', mode: 'next build / next start', stagedDataAdapters: true })+'\n', { flag: 'wx' })
}
