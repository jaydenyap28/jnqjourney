// Check Pages export against the actual tracked route tree. This script has no
// deployment or remote credentials. Run with the repo's installed dependencies.
import { execFileSync, spawn } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

const root = process.cwd()
const require = createRequire(path.join(root, 'package.json'))
const englishOnly = process.argv.includes('--english-only')
const artifactRoot = path.join(root, 'artifacts', 'cloudflare-frontend-hosting')
await mkdir(artifactRoot, { recursive: true })
const candidate = await mkdtemp(path.join(artifactRoot, englishOnly ? 'english-export-' : 'pages-export-'))
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
const source = /^(?:app\/|pages\/|components\/|lib\/|data\/|public\/|public-data\/|types\/|cloudflare\/spot-loop\/[^/]+\.mjs$|(?:package(?:-lock)?\.json|tsconfig\.json|middleware\.ts|next\.config\.mjs|postcss\.config\.mjs)$)/
const files = git(['ls-files', '-z']).split('\0').filter(file => {
  if (!source.test(file) || /(^|\/)\.(?:env|dev\.vars)(?:\.|$)/.test(file) || file.endsWith('.bak')) return false
  // Isolate the genuine Pages Router entry after the mixed build's first
  // error. This diagnostic variant is never a deployable candidate.
  return !englishOnly || file.endsWith('.css') || !(file.startsWith('app/') || file.startsWith('pages/api/') || file === 'middleware.ts')
})
let sourceBytes = 0
for (const file of files) {
  const input = path.join(root, file)
  const output = path.join(candidate, file)
  sourceBytes += (await stat(input)).size
  await mkdir(path.dirname(output), { recursive: true })
  await copyFile(input, output)
}

const config = path.join(candidate, 'next.config.mjs')
const currentConfig = await readFile(config, 'utf8')
if (!currentConfig.includes('export default nextConfig;')) throw new Error('UNEXPECTED_NEXT_CONFIG')
await writeFile(config, currentConfig.replace('export default nextConfig;', `export default {
  ...nextConfig,
  output: 'export',
  experimental: { ...nextConfig.experimental, cpus: 2 },
  eslint: { ignoreDuringBuilds: true },
};`))

// No workspace dotenv files, live tokens, or platform account credentials.
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(PATH|SystemRoot|WINDIR|TEMP|TMP|COMSPEC|PATHEXT|APPDATA|LOCALAPPDATA|USERPROFILE|NUMBER_OF_PROCESSORS)$/i.test(name)))
Object.assign(env, {
  NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_SUPABASE_URL: 'https://pages-build-probe.invalid',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'pages-build-probe-inert',
  NEXT_PUBLIC_SITE_URL: 'https://pages-build-probe.invalid',
})

const started = Date.now()
const result = await new Promise(resolve => {
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'build'], { cwd: candidate, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''
  const record = chunk => { log = (log + chunk).slice(-40_000) }
  child.stdout.setEncoding('utf8').on('data', record)
  child.stderr.setEncoding('utf8').on('data', record)
  child.on('error', () => resolve({ exitCode: null, signal: null, log, launchError: true }))
  child.on('close', (exitCode, signal) => resolve({ exitCode, signal, log }))
})
const log = result.log.replace(/\x1b\[[0-9;]*m/g, '').replaceAll(candidate, '<candidate>').replaceAll(root, '<repo>')
const report = {
  checkedAt: new Date().toISOString(),
  commit: git(['rev-parse', 'HEAD']).trim(),
  next: require('next/package.json').version,
  react: require('react/package.json').version,
  scope: englishOnly ? 'pages-router-only diagnostic' : 'complete tracked App and Pages router tree',
  sourceFiles: files.length,
  sourceBytes,
  routeCodeChanged: false,
  deployAttempted: false,
  build: {
    output: 'export',
    exitCode: result.exitCode,
    signal: result.signal,
    elapsedMs: Date.now() - started,
    relevantLines: log.split(/\r?\n/).filter(line => /Error|export|ServerSideProps|generateStaticParams|Middleware|force-dynamic/i.test(line)).slice(-30),
  },
}
await writeFile(path.join(candidate, 'build.log'), log)
await writeFile(path.join(candidate, 'preflight.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ ...report, artifact: path.relative(root, candidate) }, null, 2))
process.exitCode = result.exitCode ?? 1
