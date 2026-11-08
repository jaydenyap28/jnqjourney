import { spawnSync } from 'node:child_process'
import path from 'node:path'
const root = process.cwd()
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(PATH|SystemRoot|WINDIR|TEMP|TMP|COMSPEC|PATHEXT|APPDATA|LOCALAPPDATA|USERPROFILE|NUMBER_OF_PROCESSORS)$/i.test(k)))
Object.assign(env, { NODE_ENV:'production', NEXT_TELEMETRY_DISABLED:'1', NEXT_PUBLIC_SITE_URL:'https://www.jnqjourney.com' })
const result = spawnSync(process.execPath, [path.join(root,'node_modules/next/dist/bin/next'),'build'], {cwd:path.join(root,'artifacts/cloudflare-candidate/source'),env,stdio:'inherit'})
process.exitCode = result.status || (result.error ? 1 : 0)
