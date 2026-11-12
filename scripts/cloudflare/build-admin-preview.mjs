import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFile, cp, mkdir, readFile, readdir, realpath, statfs, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { FUNCTION as ISOLATED_FUNCTION, SUPABASE_ORIGIN as ISOLATED_ORIGIN, PROJECT_REF as ISOLATED_REF } from '../../cloudflare/admin-preview/scope.mjs'
import { FORMAL_ADMIN_API, FORMAL_PROJECT } from '../../cloudflare/admin-preview/formal-admin-read.mjs'

const workspace = process.cwd()
const formal = process.argv[2] === '--formal-read-only'
assert.deepEqual(process.argv.slice(2), formal ? ['--formal-read-only', FORMAL_PROJECT] : [])
const projectRef = formal ? FORMAL_PROJECT : ISOLATED_REF
const FUNCTION = formal ? FORMAL_ADMIN_API : ISOLATED_FUNCTION
const SUPABASE_ORIGIN = formal ? `https://${projectRef}.supabase.co` : ISOLATED_ORIGIN
const privateWorkspace = path.resolve(process.env.JNQ_RECOVERY_WORKSPACE || '.')
const root = formal ? path.join(privateWorkspace, 'production-publisher', 'frontend-review') :
  path.resolve('artifacts/cloudflare-admin-isolated')
if (formal) {
  assert.ok(process.env.JNQ_RECOVERY_WORKSPACE && await realpath(privateWorkspace) === privateWorkspace)
  const settings = JSON.parse(await readFile(path.join(privateWorkspace, 'production-publisher/settings.json'), 'utf8'))
  assert.equal(settings.projectRef, FORMAL_PROJECT)
  assert.equal(settings.enabled, false)
  await mkdir(root, { recursive: true })
}
const disk = await statfs(formal ? privateWorkspace : workspace)
assert.ok(disk.bavail * disk.bsize >= 250 * 1024 * 1024, 'ADMIN_BUILD_DISK_HEADROOM')
const stage = path.join(root, 'site-' + Date.now())
const adapter = 'cloudflare/admin-preview/'
const write = async (file, text) => {
  await mkdir(path.dirname(path.join(stage, file)), { recursive: true })
  await writeFile(path.join(stage, file), text)
}
const copy = async (source, file = source) => write(file, await readFile(source))
const replace = async (file, from, to) => {
  const text = (await readFile(path.join(stage, file), 'utf8')).replaceAll('\r\n', '\n')
  assert.ok(typeof from === 'string' ? text.includes(from) : from.test(text), 'ADMIN_ADAPTER_SOURCE_CHANGED: ' + file)
  await write(file, text.replace(from, to))
}
const input = JSON.parse(await readFile(formal ? 'artifacts/cloudflare-static-recovery/.public-read-key.json' :
  path.join(root, 'anon-build.json'), 'utf8'))
if (formal) assert.equal(input.projectRef, FORMAL_PROJECT)
const anon = formal ? { origin: SUPABASE_ORIGIN, key: input.apiKey } : input
assert.equal(anon.origin, SUPABASE_ORIGIN)
const keyClaims = JSON.parse(Buffer.from(anon.key.split('.')[1], 'base64url').toString())
assert.equal(keyClaims.role, 'anon')
assert.equal(keyClaims.ref, projectRef)

await mkdir(stage, { recursive: true })
for (const directory of ['components', 'lib', 'types', 'data']) {
  await cp(directory, path.join(stage, directory), { recursive: true })
}
for (const file of ['postcss.config.mjs', 'app/globals.css', 'app/site-fonts.css',
  'app/admin/layout.tsx', 'app/admin/page.tsx', 'app/admin/add/page.tsx', 'app/admin/notes/page.tsx',
  'app/admin/guides/page.tsx', 'app/admin/login/page.tsx']) await copy(file)
await copy('app/admin/edit/[id]/page.tsx', 'app/admin/edit/page.tsx')
await copy(adapter + 'browser-fetch.ts', 'lib/admin-fetch.ts')
await copy(adapter + 'browser-image.ts', 'lib/admin-preview-image.ts')
await copy(adapter + 'publication-panel.tsx', 'components/PublicationPanel.tsx')
if (formal) {
  await write('components/PublicationPanel.tsx', `export default function PublicationPanel() {
    return <p role="status">正式资料只读验收。编辑、上传及发布尚未启用。</p>
  }`)
  await replace('lib/admin-fetch.ts', '  const { data } = await supabase.auth.getSession()', `  if (init.method && init.method.toUpperCase() !== 'GET') {
    return Response.json({ error: '正式资料只读验收，写入尚未启用。' }, { status: 405 })
  }
  const { data } = await supabase.auth.getSession()`)
  await replace('components/AdminAuthShell.tsx', 'await supabase.auth.signOut()', "await supabase.auth.signOut({ scope: 'local' })")
}
await write('lib/admin-preview-config.ts', `export const ADMIN_API = ${JSON.stringify(SUPABASE_ORIGIN + '/functions/v1/' + FUNCTION)}\n`)
await write('types/admin-preview.d.ts', 'interface Window { gtag?: (...args: unknown[]) => void }\n')
await mkdir(path.join(stage, 'public'), { recursive: true })
await cp('public/fonts', path.join(stage, 'public/fonts'), { recursive: true })
await copyFile('public/placeholder-image.jpg', path.join(stage, 'public/placeholder-image.jpg'))

await write('app/layout.tsx', `import './globals.css'
export const metadata = { title: '${formal ? 'JnQ Journey 正式后台只读验收' : 'JnQ Journey Admin Preview'}', robots: { index: false, follow: false } }
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="zh"><body>{children}</body></html>
}`)
await write('app/page.tsx', `import Link from 'next/link'
export default function Page() { return <main className="p-8"><Link href="/admin">${formal ? '打开 JnQ Journey 正式后台只读验收' : '打开 JnQ Journey 隔离后台'}</Link></main> }`)
await replace('app/admin/layout.tsx', "import AdminAuthShell", "import { Suspense } from 'react'\nimport AdminAuthShell")
await replace('app/admin/layout.tsx', '<AdminAuthShell>{children}</AdminAuthShell>', '<Suspense><AdminAuthShell>{children}</AdminAuthShell></Suspense>')
await replace('app/admin/login/page.tsx', "searchParams.get('next') || '/admin'",
  "(/^\\/admin(?:\\/|$|\\?)/.test(searchParams.get('next') || '') && !/[\\\\\\r\\n]/.test(searchParams.get('next') || '')) ? searchParams.get('next')! : '/admin'")
await replace('app/admin/login/page.tsx', 'href="/"', 'href="https://www.jnqjourney.com"')

await replace('components/AdminAuthShell.tsx', "import { supabase }", "import { adminFetch } from '@/lib/admin-fetch'\nimport PublicationPanel from '@/components/PublicationPanel'\nimport { supabase }")
await replace('components/AdminAuthShell.tsx', "const [email, setEmail] = useState('')", "const [email, setEmail] = useState('')\n  const [denied, setDenied] = useState(false)")
await replace('components/AdminAuthShell.tsx', /  useEffect\(\(\) => \{[\s\S]*?\}, \[isLoginPage, pathname, router\]\)/, `  useEffect(() => {
    let mounted = true
    let revision = 0
    let timer: ReturnType<typeof setTimeout>
    const syncSession = async () => {
      const current = ++revision
      const { data } = await supabase.auth.getSession()
      const session = data.session
      const authorized = session ? await adminFetch('/session').then(result => result.ok).catch(() => false) : false
      if (!mounted || current !== revision) return
      setSignedIn(authorized)
      setDenied(Boolean(session) && !authorized)
      setEmail(authorized ? String(session?.user?.email || '') : '')
      setLoading(false)
      if (!session && !isLoginPage) router.replace('/admin/login?next=' + encodeURIComponent(window.location.pathname + window.location.search))
      if (authorized && isLoginPage) router.replace('/admin')
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      clearTimeout(timer)
      timer = setTimeout(() => void syncSession(), 0)
    })
    void syncSession()
    return () => { mounted = false; clearTimeout(timer); subscription.unsubscribe() }
  }, [isLoginPage, pathname, router])`)
await replace('components/AdminAuthShell.tsx', '  if (isLoginPage) {', `  if (denied) return <main className="p-8 text-white" role="alert">这个账号没有后台权限，或身份服务暂不可用。 <Button onClick={handleSignOut}>Sign out</Button></main>
  if (isLoginPage) {`)
await replace('components/AdminAuthShell.tsx', '<Link href="/admin/packages" className="hidden text-xs text-white/60 transition hover:text-white md:inline">旅游配套</Link>', '')
await replace('components/AdminAuthShell.tsx', '      {children}\n', '      <PublicationPanel />\n      {children}\n')

await replace('app/admin/edit/page.tsx', "import { supabase } from '@/lib/supabase'", "import { useSearchParams } from 'next/navigation'")
await replace('app/admin/edit/page.tsx', 'EditLocationPage({ params }: { params: { id: string } }) {', "EditLocationPage() {\n  const id = useSearchParams().get('id') || ''")
await replace('app/admin/edit/page.tsx', /params\.id/g, 'id')
await replace('app/admin/page.tsx', "import { supabase } from '@/lib/supabase'", "import { readPreviewRegions } from '@/lib/admin-fetch'")
await replace('app/admin/page.tsx', /supabase\.from\('regions'\)[^\r\n]+/, 'readPreviewRegions(),')
await replace('app/admin/page.tsx', "supabase.from('affiliate_links').select('location_id, is_active'),", 'Promise.resolve({ data: [], error: null }),')
await replace('app/admin/page.tsx', /`\/admin\/edit\/\$\{location.id\}`/g, '`/admin/edit?id=${location.id}`')
await replace('app/admin/page.tsx', /\s*<Link href="\/admin\/(?:regions|packages|affiliate|klook-widgets|reports)"[^>]*>.*?<\/Link>/g, '')
await replace('app/admin/page.tsx', /\s*<Link href=\{`\/admin\/affiliate\?[^\n]+[\s\S]*?<\/Link>/g, '')
await replace('app/admin/page.tsx', /<Button variant="outline" size="sm" onClick=\{handleBulkPublishSnapshots\}[^\n]+<\/Button>/, '')
// Bulk writes need per-row versions. Hide the bulk selection controls in
// Preview and pass the displayed version to the existing single-delete flow.
await replace('app/admin/page.tsx', "mutateAdminLocations('DELETE', { id })", "mutateAdminLocations('DELETE', { id, expectedUpdatedAt: (locations.find(row => row.id === id) as any)?.updated_at ?? null })")
await replace('lib/admin-locations.ts', '  returning?: boolean', '  returning?: boolean\n  expectedUpdatedAt?: string | null')

await replace('components/AdminLocationForm.tsx', "import { assertR2ImageUrl }", "import { readPreviewRegions } from '@/lib/admin-fetch'\nimport { assertR2ImageUrl }")
await replace('components/AdminLocationForm.tsx', "supabase.from('regions').select('*').order('name')", 'readPreviewRegions()')
await replace('components/AdminLocationForm.tsx', '{ id: initialData.id, data, returning: true }', '{ id: initialData.id, data, returning: true, expectedUpdatedAt: lastUpdatedAt }')
await replace('components/AdminLocationForm.tsx', "id: initialData.id,\n        data: { image_url: '' },", "id: initialData.id,\n        expectedUpdatedAt: lastUpdatedAt,\n        returning: true,\n        data: { image_url: '' },")
await replace('components/AdminLocationForm.tsx', "const { error } = await mutateAdminLocations('PATCH', {\n        id: initialData.id,",
  "const { data, error } = await mutateAdminLocations('PATCH', {\n        id: initialData.id,")
await replace('components/AdminLocationForm.tsx', "setMessage(`Error: Failed to clear cover from database: ${error.message}`)\n        return\n      }", "setMessage(`Error: Failed to clear cover from database: ${error.message}`)\n        return\n      }\n      setLastUpdatedAt(data?.updated_at ?? null)")
await replace('components/AdminLocationForm.tsx', /      \/\/ --- Safe Save Fallback ---[\s\S]*?      \/\/ --------------------------/, '')
await replace('components/AdminLocationForm.tsx', 'let { data: savedRecord, error }', 'const { data: savedRecord, error }')
await replace('components/AdminLocationForm.tsx', 'slug: formData.custom_slug }),', 'slug: formData.custom_slug, expectedUpdatedAt: savedRecord.updated_at }),')
await replace('components/AdminLocationForm.tsx', /        const snapshotResponse = await adminFetch\([\s\S]*?\n      }\n\n      setLastUpdatedAt/, '      }\n\n      setLastUpdatedAt')
await replace('components/AdminLocationForm.tsx', "'更新成功！' : '发布成功！'", "'已保存到隔离后台。' : '草稿已保存到隔离后台。'")
await replace('components/AdminLocationForm.tsx', "'保存更新' : '发布景点'", "'保存更新' : '保存景点草稿'")
await replace('components/SpotEnglishEditor.tsx', /<button type="button" disabled=\{busy\} onClick=\{generate\}[^\n]*?<\/button>/, '')
await replace('components/SpotEnglishEditor.tsx', "setMessage(value.revalidated?'英文版已保存、发布并刷新英文景点页面。':'英文版已保存并发布；英文景点页面刷新失败，请稍后重试刷新。')",
  "setMessage('英文草稿已保存到隔离后台。')")
await replace('components/SpotEnglishEditor.tsx', '保存并发布英文版', '保存英文草稿')
await replace('components/SpotEnglishEditor.tsx', /<a href=\{`\/en\$\{data.canonicalPath\}`\}[^\n]+<\/a>/, '')
await replace('app/admin/notes/page.tsx', "hydrated.published ? 'Published note saved.' : 'Draft saved.'", "'Draft saved in Admin Preview.'")
await replace('app/admin/notes/page.tsx', "form.published ? 'Save & Update + English' : 'Save Draft'", "'Save Draft'")
await replace('app/admin/notes/page.tsx', /<Link href=\{`\/notes\/\$\{form.slug\}`\}[^\n]+>\s*Preview\s*<\/Link>/,
  '<Button type="button" variant="outline" onClick={openPreviewFromEditor}>Preview</Button>')

await replace('app/admin/guides/page.tsx', 'previousSlug?: string }', 'previousSlug?: string; expectedUpdatedAt?: string }')
await replace('app/admin/guides/page.tsx', 'previousSlug: originalSlug || undefined,', "previousSlug: originalSlug || undefined,\n        expectedUpdatedAt: (form as TravelGuide & { updatedAt?: string }).updatedAt,")
await replace('app/admin/guides/page.tsx', '/api/admin/guides?slug=${encodeURIComponent(form.slug)}', '/api/admin/guides?slug=${encodeURIComponent(form.slug)}&expectedUpdatedAt=${encodeURIComponent((form as TravelGuide & { updatedAt?: string }).updatedAt || "")}')
await replace('app/admin/guides/page.tsx', '`/guide/${form.slug}`', '`/admin/guide-preview?slug=${encodeURIComponent(form.slug)}`')
await replace('app/admin/guides/page.tsx', 'Save the guide to publish this binding.', 'Save the guide to keep this draft image.')
await write('app/admin/guide-preview/page.tsx', `'use client'
import { useSearchParams } from 'next/navigation'
import AdminGuideDraftPreview from '@/components/AdminGuideDraftPreview'
export default function GuidePreview() {
  const slug = useSearchParams().get('slug')
  return slug ? <AdminGuideDraftPreview guideSlug={slug} /> : <p>请选择已保存的攻略。</p>
}`)
await replace('components/FallbackImage.tsx', "import Image,", "import { useDraftImage } from '@/lib/admin-preview-image'\nimport Image,")
await replace('components/FallbackImage.tsx', '  const mergedStyle =', "  const previewSrc = useDraftImage(resolvedImage.src || fallbackSrc)\n  const mergedStyle =")
await replace('components/FallbackImage.tsx', 'src={resolvedImage.src || fallbackSrc}', 'src={previewSrc}')
await write('next.config.mjs', "export default { output: 'export', images: { unoptimized: true }, experimental: { cpus: 2 }, eslint: { ignoreDuringBuilds: true } }\n")
await write('tsconfig.json', JSON.stringify({
  compilerOptions: { target: 'ES2017', lib: ['dom', 'dom.iterable', 'esnext'], allowJs: true, allowImportingTsExtensions: true, skipLibCheck: true, strict: true,
    noEmit: true, esModuleInterop: true, module: 'esnext', moduleResolution: 'bundler', resolveJsonModule: true,
    isolatedModules: true, jsx: 'preserve', paths: { '@/*': ['./*'] }, plugins: [{ name: 'next' }] },
  include: ['next-env.d.ts', 'app/**/*.ts', 'app/**/*.tsx', '.next/types/**/*.ts', 'types/**/*.d.ts'],
  exclude: ['node_modules'],
}, null, 2))
await write('public/_headers', `/*
  X-Robots-Tag: noindex, nofollow
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Cache-Control: no-store
  Content-Security-Policy: frame-ancestors 'none'; base-uri 'none'; object-src 'none'; connect-src 'self' ${SUPABASE_ORIGIN}; form-action 'self'
`)
await write('public/robots.txt', 'User-agent: *\nDisallow: /\n')

const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(PATH|SystemRoot|WINDIR|TEMP|TMP|COMSPEC|PATHEXT|APPDATA|LOCALAPPDATA|USERPROFILE|NUMBER_OF_PROCESSORS)$/i.test(key)))
if (formal) await symlink(path.join(privateWorkspace, 'build-dependencies/node_modules'), path.join(stage, 'node_modules'), 'junction')
const result = spawnSync(process.execPath, [path.join(formal ? stage : workspace, 'node_modules/next/dist/bin/next'), 'build'], {
  cwd: stage, stdio: 'inherit',
  env: { ...env, NEXT_TELEMETRY_DISABLED: '1', NODE_ENV: 'production',
    NEXT_PUBLIC_SUPABASE_URL: SUPABASE_ORIGIN, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon.key },
})
if (result.status !== 0) throw new Error('ADMIN_BUILD_FAILED')
const out = path.join(stage, 'out')
const entries = await readdir(out, { recursive: true })
assert.ok(entries.includes('admin.html') && entries.some(file => file.endsWith('notes.html')))
for (const file of entries.filter(file => /\.(?:html|json|js|txt)$/.test(file))) {
  const text = await readFile(path.join(out, file), 'utf8')
  const unexpected = new RegExp(`${formal ? ISOLATED_REF : FORMAL_PROJECT}|sb_secret_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+`)
  assert.doesNotMatch(text.replaceAll(anon.key, 'PUBLIC_ANON_KEY'), unexpected, 'Unexpected credentials or cross-environment target in ' + file)
}
await writeFile(path.join(root, 'package.json'), JSON.stringify({ out, zeroFunctions: true, files: entries.length,
  ...(formal ? { projectRef, readOnly: true, deployed: false } : {}) }))
console.log(JSON.stringify({ built: true, out, entries: entries.length, ...(formal ? { projectRef, readOnly: true, deployed: false } : {}) }))
