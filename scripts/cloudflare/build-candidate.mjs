import { spawnSync } from 'node:child_process'
import path from 'node:path'
const root = process.cwd()
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(PATH|SystemRoot|WINDIR|TEMP|TMP|COMSPEC|PATHEXT|APPDATA|LOCALAPPDATA|USERPROFILE|NUMBER_OF_PROCESSORS)$/i.test(k)))
Object.assign(env, { NODE_ENV:'production', NEXT_TELEMETRY_DISABLED:'1', NEXT_PUBLIC_SITE_URL:'https://www.jnqjourney.com' })
const source = process.argv.includes('--recovery') ? (await import('./recovery-sources.mjs')).SOURCE : process.argv.includes('--public-readiness') ? 'artifacts/cloudflare-public-readiness/source' : 'artifacts/cloudflare-candidate/source'
const result = spawnSync(process.execPath, [path.join(root,'node_modules/next/dist/bin/next'),'build'], {cwd:path.resolve(root,source),env,stdio:'inherit'})
process.exitCode = result.status || (result.error ? 1 : 0)
