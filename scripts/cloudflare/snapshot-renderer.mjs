import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

export const ROOT = path.resolve('artifacts/cloudflare-snapshot-poc')
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
  // Only the isolated renderer's inputs are replaced. All route modules,
  // layouts, templates, middleware and browser components stay unmodified.
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
}

export function runNext(args, stdio = 'inherit') {
  return spawn(process.execPath, [next, ...args], { cwd: SITE, env, stdio, windowsHide: true })
}

if (process.argv[2] === '--build') {
  await prepare()
  const process = runNext(['build'])
  const code = await new Promise((resolve, reject) => { process.on('error', reject); process.on('exit', resolve) })
  if (code !== 0) throw new Error('NEXT_RENDERER_BUILD_FAILED')
  const buildId = (await readFile(path.join(SITE, '.next/BUILD_ID'), 'utf8')).trim()
  await writeFile(path.join(ROOT, 'build.json'), JSON.stringify({ buildId, next: '14.2.35', mode: 'next build / next start', stagedDataAdapters: true })+'\n', { flag: 'wx' })
}
