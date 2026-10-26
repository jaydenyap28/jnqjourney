import { mkdir, writeFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

const task = process.argv[2]
const commands = {
  build: ['node_modules/next/dist/bin/next', 'build'],
  typecheck: ['node_modules/typescript/bin/tsc', '--noEmit', '--incremental', 'false'],
  lint: ['node_modules/eslint/bin/eslint.js', 'app', 'components', 'lib', 'pages', 'middleware.ts',
    'scripts/validate-offline.mjs', 'scripts/verify-offline-routes.mjs', 'scripts/lib/offline-network-guard.cjs',
    'scripts/compact-public-locations.mjs', 'tests/zero-deployment.test.ts', 'tests/zero-deployment-safety.test.ts',
    'tests/zero-deployment-p0.test.ts', 'tests/admin-locations.test.cjs', 'tests/admin-affiliate-links.test.cjs', 'tests/spot-localization-authoring.test.ts',
    'tests/note-cloud-sync.test.cjs', 'tests/public-data-contract.test.ts', 'tests/spot-content-network.test.ts',
    'tests/publication-consistency.test.ts', 'tests/helpers/publication-mock.cjs', 'tests/guide-attraction-display.test.ts',
    'tests/guide-segment-contract.test.ts', 'tests/guide-note-production-fix.test.cjs', 'tests/release-candidate.test.ts', 'tests/preview-safety.test.ts', 'scripts/verify-preview-safety.mjs'],
  runtime: ['scripts/verify-offline-routes.mjs'],
  'preview-runtime': ['scripts/verify-preview-safety.mjs'],
  'rc12-runtime': ['scripts/verify-rc12-packages.mjs'],
  test: ['--experimental-strip-types', '--test', ...process.argv.slice(3)],
  'test-all': ['--experimental-strip-types', '--test', ...(await readdir('tests')).filter(file => /\.test\.(ts|cjs|mjs)$/.test(file)).sort().map(file => `tests/${file}`)],
}
if (!commands[task] || (task === 'test' && process.argv.length < 4)) throw new Error('Usage: node scripts/validate-offline.mjs build|typecheck|lint|runtime|test [test files]')
const output = path.resolve(process.env.JNQ_OFFLINE_OUTPUT || 'artifacts/rc1.2')
if (!output.startsWith(path.resolve('artifacts') + path.sep)) throw new Error('Validation output must stay inside artifacts')
await mkdir(output, { recursive: true })
const fonts = path.join(output, 'font-responses.cjs')
// Next's supported test hook supplies CSS without downloading Google Fonts.
// This validates compilation and page generation, not production font metrics.
await writeFile(fonts, "module.exports = new Proxy({}, { get: () => '@font-face { font-family: offline-validation; src: url(offline-validation.woff2); }' });\n")
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1', NEXT_FONT_GOOGLE_MOCKED_RESPONSES: fonts,
  VERCEL_ENV: process.env.JNQ_OFFLINE_PREVIEW === '1' ? 'preview' : '', VERCEL_URL: 'rc11-fixture.vercel.app',
  NEXT_PUBLIC_GA_MEASUREMENT_ID: 'G-OFFLINE-RC11', ADMIN_EMAILS: '', JNQ_BUDGET_SYNC_SECRET: '',
  JNQ_OFFLINE_OUTPUT: output,
  NODE_OPTIONS: `--require "${path.resolve('scripts/lib/offline-network-guard.cjs').replaceAll('\\', '/')}"`,
  NEXT_PUBLIC_SUPABASE_URL: 'https://offline-validation.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'offline-validation',
  SUPABASE_SERVICE_ROLE_KEY: '', PUBLIC_DATA_CDN_BASE_URL: '', R2_PUBLIC_BASE_URL: '', NEXT_PUBLIC_R2_PUBLIC_BASE_URL: '',
  R2_ACCOUNT_ID: '', R2_ACCESS_KEY_ID: '', R2_SECRET_ACCESS_KEY: '', R2_BUCKET_NAME: '',
}
// Empty values above are intentional: Next's dotenv must not fill them with
// production values. Public DB attempts fail locally through the network guard.
const child = spawn(process.execPath, commands[task], { env, stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''
child.stdout.on('data', bytes => { log += bytes; process.stdout.write(bytes) })
child.stderr.on('data', bytes => { log += bytes; process.stderr.write(bytes) })
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('close', async code => {
  await writeFile(path.join(output, `${task}.log`), log)
  process.exitCode = code ?? 1
})
