// Read-only local development/compile runner. Empty values are set in Node,
// since PowerShell removes empty env vars and Next could reload .env.local.
import { spawn } from 'node:child_process'
const env = { ...process.env, VERCEL_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:3199', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-unavailable',
  SUPABASE_SERVICE_ROLE_KEY: '', PUBLIC_DATA_CDN_BASE_URL: '', R2_PUBLIC_BASE_URL: '', NEXT_PUBLIC_R2_PUBLIC_BASE_URL: '',
  NEXT_PUBLIC_GA_MEASUREMENT_ID: '', R2_ACCESS_KEY_ID: '', R2_SECRET_ACCESS_KEY: '', OPENAI_API_KEY: '', JNQ_BUDGET_SYNC_SECRET: '',
}
const args = process.argv.includes('--compile') ? ['build', '--experimental-build-mode', 'compile', '--no-lint']
  : ['dev', '--hostname', '127.0.0.1', '--port', '3010']
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', ...args], { env, stdio: 'inherit' })
child.on('exit', code => process.exit(code ?? 1))
