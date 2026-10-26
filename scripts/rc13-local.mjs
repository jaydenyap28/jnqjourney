// Loopback-only development, synthetic credentials, no production writes.
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

if (process.argv[2] === 'serve') {
  const { default: next } = await import('next')
  const { default: config } = await import('../next.config.mjs')
  const { createServer } = await import('node:http')
  const port = Number(process.env.JNQ_RC13_PORT || 3214)
  const app = next({ dev: true, dir: process.cwd(), hostname: '127.0.0.1', port, conf: { ...config, distDir: '.next-rc13' } })
  await app.prepare()
  const handle = app.getRequestHandler()
  createServer((req, res) => {
    // Local fixtures never submit data, analytics or jobs to real handlers.
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end('{"error":"Local review is read-only"}'); return }
    return handle(req, res)
  }).listen(port, '127.0.0.1', () => console.log(`RC1.3 local http://127.0.0.1:${port}`))
} else {
  const out = path.resolve(process.env.JNQ_OFFLINE_OUTPUT || 'artifacts/rc1.3')
  if (!out.startsWith(path.resolve('artifacts') + path.sep)) throw new Error('Local evidence output must stay inside artifacts')
  mkdirSync(out, { recursive: true })
  const fonts = path.join(out, 'font-responses.cjs')
  writeFileSync(fonts, "module.exports = new Proxy({}, { get: () => '@font-face { font-family: offline-validation; src: local(Arial); }' });\n")
  const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1', VERCEL_ENV: '', ADMIN_EMAILS: '', JNQ_BUDGET_SYNC_SECRET: '',
    NEXT_FONT_GOOGLE_MOCKED_RESPONSES: fonts, NEXT_PUBLIC_SUPABASE_URL: 'https://offline-validation.invalid',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'offline-validation', SUPABASE_SERVICE_ROLE_KEY: 'offline-runtime-fixture',
    PUBLIC_DATA_CDN_BASE_URL: '', R2_PUBLIC_BASE_URL: '', NEXT_PUBLIC_R2_PUBLIC_BASE_URL: '',
    R2_ACCOUNT_ID: '', R2_ACCESS_KEY_ID: '', R2_SECRET_ACCESS_KEY: '', R2_BUCKET_NAME: '', NEXT_PUBLIC_GA_MEASUREMENT_ID: '',
    JNQ_OFFLINE_RUNTIME_FIXTURE: path.join(out, 'browser-fixture.json'),
    NODE_OPTIONS: `--require "${path.resolve('scripts/lib/offline-network-guard.cjs').replaceAll('\\', '/')}"` + (process.env.JNQ_RC13_ROUTING_DIAGNOSTICS === '1' ? ` --require "${path.resolve('scripts/lib/rc13-routing-diagnostics.cjs').replaceAll('\\', '/')}"` : ''),
  }
  const child = spawn(process.execPath, [process.argv[1], 'serve'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  process.on('SIGINT', () => { child.kill(); process.exit() })
  child.stdout.on('data', b => process.stdout.write(b))
  child.stderr.on('data', b => process.stderr.write(b))
  child.on('close', code => { process.exitCode = code ?? 1 })
}
