// Read-only loopback review of the real Next routes. No cloud credentials or writes.
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { japanNotes } from '../tests/fixtures/japan-notes.mjs'
import { EMPTY_GUIDE } from '../lib/guides.ts'

const output = path.resolve('artifacts/note-publishing')
const port = 3227
if (process.argv[2] !== 'serve') {
  mkdirSync(output, { recursive: true })
  const fonts = path.join(output, 'font-responses.cjs')
  writeFileSync(fonts, "module.exports = new Proxy({}, { get: () => '@font-face { font-family: offline-validation; src: local(Arial); }' });\n")
  const state = path.join(output, 'runtime-fixture.json')
  writeFileSync(state, JSON.stringify({ spots: [], packages: [], widgets: [] }))
  const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1', VERCEL_ENV: '', VERCEL_URL: '',
    JNQ_NOTE_REVIEW_RUN_ID: String(Date.now()),
    NEXT_FONT_GOOGLE_MOCKED_RESPONSES: fonts,
    NEXT_PUBLIC_SUPABASE_URL: 'https://offline-validation.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'offline-validation', SUPABASE_SERVICE_ROLE_KEY: '',
    PUBLIC_DATA_CDN_BASE_URL: `http://127.0.0.1:${port}/fixtures`, R2_PUBLIC_BASE_URL: '', NEXT_PUBLIC_R2_PUBLIC_BASE_URL: '',
    NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${port}`, SITE_URL: `http://127.0.0.1:${port}`,
    R2_ACCOUNT_ID: '', R2_ACCESS_KEY_ID: '', R2_SECRET_ACCESS_KEY: '', R2_BUCKET_NAME: '',
    NEXT_PUBLIC_GA_MEASUREMENT_ID: '', NEXT_PUBLIC_MAPBOX_TOKEN: '', JNQ_BUDGET_SYNC_SECRET: '', ADMIN_EMAILS: '',
    JNQ_OFFLINE_RUNTIME_FIXTURE: state,
    NODE_OPTIONS: `--require "${path.resolve('scripts/lib/offline-network-guard.cjs').replaceAll('\\', '/')}"`,
  }
  const child = spawn(process.execPath, [process.argv[1], 'serve'], { env, stdio: 'inherit', windowsHide: true })
  process.on('SIGINT', () => { child.kill(); process.exit() })
  child.on('close', code => { process.exitCode = code ?? 1 })
} else {
  const { default: next } = await import('next')
  const { default: config } = await import('../next.config.mjs')
  const app = next({ dev: true, hostname: '127.0.0.1', port, dir: process.cwd(), conf: { ...config,
    distDir: `artifacts/note-publishing/dev-${process.env.JNQ_NOTE_REVIEW_RUN_ID}`,
    webpack(config) {
      config.watchOptions = { ...config.watchOptions, ignored: /[\\/]artifacts[\\/]|[\\/]\.next[^\\/]*[\\/]|[\\/]node_modules[\\/]|[\\/]\.git[\\/]/ }
      return config
    },
  } })
  await app.prepare()
  const handle = app.getRequestHandler()
  const regions = JSON.parse(readFileSync('public-data/regions.json', 'utf8'))
  const locations = JSON.parse(readFileSync('public-data/locations.json', 'utf8'))
  // The public route requires published=true. Only this loopback transport projects
  // drafts as readable fixtures; source fixtures stay unpublished and outside data/.
  const japanSpot = locations.locations.find(spot => spot.region?.country === 'Japan')
  const notes = japanNotes.map(note => ({ ...note, published: true, relatedSpotIds: japanSpot ? [japanSpot.id] : [] }))
  const reviewGuide = { ...EMPTY_GUIDE, slug: 'test-japan-guide',
    title: '[测试资料·不可发布] Note 关联路线', days: [{ dayLabel: '资料阅读', title: '测试关联', routeItems: [{ type: 'note', noteSlug: notes[0].slug, displayName: '测试 Note' }] }] }
  createServer((req, res) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')
    res.setHeader('Content-Security-Policy', "connect-src 'self' ws://127.0.0.1:3227; frame-src 'none'")
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end('Local review is read-only'); return }
    const url = new URL(req.url, `http://127.0.0.1:${port}`)
    const snapshots = {
      '/fixtures/public-data/notes.json': { schemaVersion: 1, notes },
      '/fixtures/public-data/guides.json': { schemaVersion: 1, guides: [reviewGuide] },
      '/fixtures/public-data/regions.json': regions,
      '/fixtures/public-data/locations.json': locations,
    }
    if (url.pathname in snapshots) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(snapshots[url.pathname])); return
    }
    return handle(req, res)
  }).listen(port, '127.0.0.1', () => console.log(`Read-only Note review: http://127.0.0.1:${port}/notes/test-japan-jr-pass`))
}
