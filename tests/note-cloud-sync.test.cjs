const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const test = require('node:test')
const assert = require('node:assert/strict')

function loader(mocks = {}, globals = {}) {
  const cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports
    const mod = { exports: {} }; cache.set(file, mod)
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText
    const req = name => {
      if (name in mocks) return mocks[name]
      if (name.startsWith('@/') || name.startsWith('.')) {
        let next = name.startsWith('@/') ? path.resolve(name.slice(2)) : path.resolve(path.dirname(file), name)
        if (!path.extname(next)) next += fs.existsSync(next + '.ts') ? '.ts' : '.tsx'
        return load(next)
      }
      return require(name)
    }
    new Function('require', 'exports', 'module', ...Object.keys(globals), source)(req, mod.exports, mod, ...Object.values(globals))
    return mod.exports
  }
  return file => load(path.resolve(file))
}
const plain = loader()
const { EMPTY_NOTE } = plain('lib/notes.ts')
const { mergeNoteSave, NoteConflictError, scheduleNoteAutosave, noteEditorKey } = plain('lib/note-sync.ts')
const note = (slug = 'a', version = '2026-09-20T00:00:00.000Z') => ({ ...EMPTY_NOTE, slug, title: slug, content: 'cloud text', updatedAt: version })

function cloudHarness() {
  const objects = new Map()
  const pointer = '_system/notes-latest.webp'
  let serial = 0, options, blockRead, failRead = false
  function seed(notes) { const key = `_system/notes/seed-${serial++}.webp`; objects.set(key, JSON.stringify(notes)); objects.set(pointer, key) }
  seed([note()])
  const bucket = {
    download: async key => {
      if (blockRead) await blockRead
      return { data: !failRead && objects.has(key) ? new Blob([objects.get(key)]) : null }
    },
    list: async () => ({ data: [] }),
    upload: async (key, bytes, opts) => {
      if (!opts.upsert && objects.has(key)) return { error: { message: 'already exists' } }
      objects.set(key, bytes); return {}
    },
    remove: async keys => { keys.forEach(key => objects.delete(key)); return {} },
  }
  const load = loader({
    'fs/promises': { readFile: async () => JSON.stringify([note('stale-local')]), writeFile: async () => {} },
    '@supabase/supabase-js': { createClient: (_url, _key, opts) => { options = opts; return { storage: { from: () => bucket } } } },
    '@/lib/server/r2': { uploadPublicNotesSnapshot: async () => {} },
    '@/lib/server/admin-auth': { requireAdminRequest: async () => ({ ok: true }) },
    'next/server': { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } },
    'next/cache': { revalidateTag() {}, revalidatePath() {} },
  }, {
    process: { cwd: () => process.cwd(), env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'test-only' } },
    fetch: async (url, init) => ({ url, init }),
  })
  return { store: load('lib/server/notes-store.ts'), route: load('app/api/admin/notes/route.ts'), seed, objects,
    fail: () => { failRead = true }, block: promise => { blockRead = promise }, options: () => options }
}

test('admin bypasses warmed memory; saves merge fresh unrelated Notes and generate server versions', async () => {
  const h = cloudHarness()
  await h.store.readNotes()
  h.seed([note('a'), note('b', '2026-09-20T02:00:00.000Z')])
  const get = await h.route.GET(new Request('https://test/api/admin/notes'))
  assert.equal((await get.json()).notes.length, 2)
  assert.match(get.headers.get('cache-control'), /no-store/)
  const response = await h.route.POST(new Request('https://test', { method: 'POST', body: JSON.stringify({
    ...note(), title: 'edited', previousSlug: 'a', expectedUpdatedAt: note().updatedAt, updatedAt: '2099-01-01T00:00:00Z',
  }) }))
  assert.equal(response.status, 200)
  const saved = (await response.json()).note
  assert.equal(saved.title, 'edited')
  assert.notEqual(saved.updatedAt, '2099-01-01T00:00:00Z')
  const latest = await h.store.readAuthoritativeNotes()
  assert.equal(latest.find(n => n.slug === 'b').updatedAt, '2026-09-20T02:00:00.000Z')
})

test('stale or missing editor version returns HTTP 409 without changing cloud objects', async () => {
  for (const expectedUpdatedAt of ['2025-01-01', undefined]) {
    const h = cloudHarness(), before = [...h.objects]
    const response = await h.route.POST(new Request('https://test', { method: 'POST', body: JSON.stringify({ ...note(), previousSlug: 'a', expectedUpdatedAt }) }))
    assert.equal(response.status, 409)
    assert.deepEqual([...h.objects], before)
  }
})

test('cloud errors fail closed despite local fallback data; storage fetch bypasses caches', async () => {
  const h = cloudHarness()
  await h.store.readAuthoritativeNotes()
  const response = await h.options().global.fetch('https://example.test/storage/v1/object/authenticated/bucket/pointer', { method: 'GET' })
  assert.equal(response.init.cache, 'no-store')
  assert.ok(response.url.searchParams.get('_fresh'))
  h.fail()
  assert.equal((await h.route.GET(new Request('https://test'))).status, 503)
  await assert.rejects(h.store.mutateAuthoritativeNotes(notes => notes), /authoritative/)
  assert.equal(h.objects.has('_system/notes-write-lock.webp'), false)
})

test('shared storage lock prevents concurrent whole-document lost updates and releases on conflict', async () => {
  const h = cloudHarness()
  let release
  h.block(new Promise(resolve => { release = resolve }))
  const first = h.store.mutateAuthoritativeNotes(notes => notes)
  await Promise.resolve()
  await assert.rejects(h.store.mutateAuthoritativeNotes(notes => notes), /busy/)
  release(); await first
  assert.equal(h.objects.has('_system/notes-write-lock.webp'), false)
  await assert.rejects(h.store.mutateAuthoritativeNotes(() => { throw new Error('conflict') }), /conflict/)
  assert.equal(h.objects.has('_system/notes-write-lock.webp'), false)
})

test('slug collisions, deleted notes, and aliases cannot overwrite another cloud copy', () => {
  const a = note(), b = note('b')
  assert.throws(() => mergeNoteSave([a, b], { ...a, slug: 'b' }, 'a', a.updatedAt), NoteConflictError)
  assert.throws(() => mergeNoteSave([], a, 'a', a.updatedAt), NoteConflictError)
  assert.throws(() => mergeNoteSave([{ ...a, updatedAt: '' }], a, '', ''), NoteConflictError)
  assert.throws(() => mergeNoteSave([{ ...a, aliases: ['old'] }], { ...a, slug: 'old' }, 'old', 'stale'), NoteConflictError)
  const created = mergeNoteSave([], note('new'), '', '')[0]
  assert.ok(created.createdAt && created.updatedAt)
})

test('autosave waits three seconds after the last edit, runs once, and skips clean or blocked editors', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let saves = 0
  let cancel = scheduleNoteAutosave(() => saves++, true, false)
  for (let i = 0; i < 4; i++) {
    t.mock.timers.tick(2000); cancel()
    cancel = scheduleNoteAutosave(() => saves++, true, false)
  }
  assert.equal(saves, 0)
  t.mock.timers.tick(2999); assert.equal(saves, 0)
  t.mock.timers.tick(1); assert.equal(saves, 1)
  t.mock.timers.tick(10000); assert.equal(saves, 1)
  scheduleNoteAutosave(() => saves++, false, false)
  scheduleNoteAutosave(() => saves++, true, true)
  t.mock.timers.tick(3000); assert.equal(saves, 1)
  assert.equal(noteEditorKey(note(), 'x'), noteEditorKey({ ...note(), updatedAt: 'next' }, 'x'))
  assert.notEqual(noteEditorKey(note(), 'x'), noteEditorKey(note(), 'xy'))
})

// Execute the real editor component with a minimal hook host; no browser or extra dependency.
function editorHarness() {
  const slots = [], effects = [], listeners = new Map()
  let cursor = 0, changed = true, tree, cloud = note(), pendingSave, pendingRead, holdRead = false, requests = []
  const react = {
    ...require('react'),
    useState(initial) {
      const i = cursor++
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; changed = true }]
    },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial } },
    useMemo(fn) { return fn() },
    useEffect(fn, deps) {
      const i = cursor++, old = slots[i]
      if (!old || deps.some((v, j) => !Object.is(v, old.deps[j]))) {
        old?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = fn() })
      }
    },
  }
  const chain = new Proxy({}, { get: (_target, key) => key === 'then' ? resolve => resolve({ data: [] }) : () => chain })
  const ui = new Proxy({}, { get: (_target, key) => key })
  const mocks = { react, 'next/link': 'Link', 'lucide-react': ui,
    '@/lib/supabase': { supabase: { from: () => chain } },
    '@/lib/admin-fetch': { adminFetch: async (url, init) => {
      if (init?.method === 'POST') {
        requests.push(JSON.parse(init.body))
        return new Promise(resolve => { pendingSave = resolve })
      }
      if (holdRead && !url.includes('klook')) return new Promise(resolve => { pendingRead = resolve })
      return Response.json(url.includes('klook') ? { widgets: [] } : { notes: [cloud] })
    } },
  }
  for (const name of ['OrderedRelationPicker', 'FallbackImage', 'InlineMarkdown']) mocks['@/components/' + name] = name
  for (const name of ['badge', 'button', 'card', 'dialog', 'input', 'label', 'textarea']) mocks['@/components/ui/' + name] = ui
  const surface = { visibilityState: 'visible', addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key), localStorage: { getItem: () => null }, confirm: () => true }
  const Page = loader(mocks, { window: surface, document: surface })('app/admin/notes/page.tsx').default
  async function flush() {
    for (let n = 0; n < 12; n++) {
      if (changed) { cursor = 0; changed = false; tree = Page(); effects.splice(0).forEach(fn => fn()) }
      await new Promise(resolve => setImmediate(resolve))
    }
  }
  function find(predicate, value = tree) {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) { for (const v of value) { const found = find(predicate, v); if (found) return found } }
    else { if (predicate(value)) return value; return find(predicate, value.props?.children ?? null) }
  }
  return { flush, requests, find, cloud: value => { cloud = value }, focus: () => listeners.get('focus')?.(),
    edit: value => find(el => el.props?.id === 'markdown-editor').props.onChange({ target: { value } }),
    save: () => find(el => el.type === 'Button' && el.props.className === 'bg-white text-black hover:bg-amber-50' && !el.props.size).props.onClick(),
    finish: (status, body) => pendingSave(Response.json(body, { status })),
    holdRead: () => { holdRead = true },
    finishRead: value => { holdRead = false; pendingRead(Response.json({ notes: [value] })) },
    close: () => slots.forEach(slot => slot?.cleanup?.()),
  }
}

test('manual save preserves typing during the request, advances base version, and conflict preserves edits', async () => {
  const h = editorHarness()
  try {
    await h.flush(); h.edit('first edit'); await h.flush()
    const saving = h.save(); await h.flush()
    h.edit('second edit during save'); await h.flush()
    const updatedAt = '2026-09-20T03:00:00.000Z'
    h.finish(200, { note: { ...note(), content: 'first edit', updatedAt } }); await saving; await h.flush()
    assert.equal(h.find(el => el.props?.id === 'markdown-editor').props.value, 'second edit during save')
    assert.equal(h.find(el => el.props?.role === 'status').props.children, 'Unsaved')
    const retry = h.save(); await h.flush()
    assert.equal(h.requests[1].expectedUpdatedAt, updatedAt)
    h.finish(409, { error: 'Newer cloud version detected' }); await retry; await h.flush()
    assert.equal(h.find(el => el.props?.role === 'status').props.children, 'Newer cloud version detected')
    assert.equal(h.find(el => el.props?.id === 'markdown-editor').props.value, 'second edit during save')
  } finally { h.close() }
})

test('focus refreshes clean editor from cloud and preserves dirty editor', async () => {
  const h = editorHarness()
  try {
    await h.flush()
    h.cloud({ ...note(), content: 'remote edit', updatedAt: 'next' }); await h.focus(); await h.flush()
    assert.equal(h.find(el => el.props?.id === 'markdown-editor').props.value, 'remote edit')
    h.edit('local unsaved'); await h.flush()
    h.cloud({ ...note(), content: 'newer remote' }); await h.focus(); await h.flush()
    assert.equal(h.find(el => el.props?.id === 'markdown-editor').props.value, 'local unsaved')
  } finally { h.close() }
})


test('refresh response arriving after typing begins cannot replace local edits', async () => {
  const h = editorHarness()
  try {
    await h.flush(); h.holdRead()
    const refresh = h.focus(); await h.flush()
    h.edit('typed while refresh was pending'); await h.flush()
    h.finishRead({ ...note(), content: 'remote content' }); await refresh; await h.flush()
    assert.equal(h.find(el => el.props?.id === 'markdown-editor').props.value, 'typed while refresh was pending')
  } finally { h.close() }
})

test('failed save keeps local text; manual retry succeeds and clean editor does not save again', async () => {
  const h = editorHarness()
  try {
    await h.flush(); h.edit('retry this'); await h.flush()
    const first = h.save(); await h.flush()
    h.finish(500, { error: 'offline' }); await first; await h.flush()
    assert.equal(h.find(el => el.props?.role === 'status').props.children, 'Save failed')
    assert.equal(h.find(el => el.props?.id === 'markdown-editor').props.value, 'retry this')
    const second = h.save(); await h.flush()
    h.finish(200, { note: { ...note(), content: 'retry this', updatedAt: '2026-09-20T04:00:00.000Z' } })
    await second; await h.flush()
    assert.match(h.find(el => el.props?.role === 'status').props.children, /^Saved to cloud \d{2}:\d{2}:\d{2}$/)
    await h.save(); assert.equal(h.requests.length, 2)
  } finally { h.close() }
})
