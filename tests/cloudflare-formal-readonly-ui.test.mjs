import test from 'node:test'
import assert from 'node:assert/strict'
import { freezeFormalEditor } from '../scripts/cloudflare/formal-readonly-markup.mjs'
import { planFormalSpotMutation, assertFormalAuthorityVersion } from '../cloudflare/admin-preview/formal-write-plan.mjs'

test('readonly editor disables mutation and preserves navigation, filters and source handlers', () => {
  const source = `<><Input value={form.title} onChange={edit} /><Input onChange={e => setSearchQuery(e.target.value)} />
  <Button onClick={save} disabled={busy}>Save</Button><Button type="submit">Submit</Button>
  <Button onClick={() => selectGuide(guide)}>Read Guide</Button><Link href={\`/admin/edit?id=\${id}\`}><Button>Edit</Button></Link>
  <Link href="/admin/add"><Button>Add</Button></Link><Select onValueChange={edit} /><input type="file" />
  <Button onClick={() => hydrateNote(note)}>Read Note</Button></>`
  const result = freezeFormalEditor(source)
  assert.match(result, /value=\{form.title\} onChange=\{edit\} readOnly=\{true\}/)
  assert.match(result, /<Input onChange=\{e => setSearchQuery\(e.target.value\)\} \/>/)
  assert.match(result, /onClick=\{save\} disabled=\{true\}/)
  assert.match(result, /type="submit" disabled=\{true\}/)
  assert.match(result, /onClick=\{\(\) => selectGuide\(guide\)\}>Read Guide/)
  assert.match(result, /aria-label="查看资料"/)
  assert.match(result, /aria-disabled=\{true\}/)
  assert.match(result, /type="file" disabled=\{true\}/)
  assert.match(result, /onClick=\{\(\) => hydrateNote\(note\)\}>Read Note/)
  assert.ok(!source.includes('readOnly'))
})

test('formal preparation never allocates test IDs and never auto-publishes inserts', () => {
  const insert = planFormalSpotMutation('POST', { data: { name: 'Synthetic place', status: 'active', publication_status: 'published' } })
  assert.equal(insert.values.publication_status, 'draft')
  assert.equal(insert.databaseGeneratedId, true)
  assert.equal(insert.publish, false)
  assert.ok(!Object.hasOwn(insert.values, 'id'))
  assert.throws(() => planFormalSpotMutation('POST', { id: 95000, data: { name: 'Synthetic' } }))
  assert.throws(() => planFormalSpotMutation('PATCH', { id: 95000, expectedUpdatedAt: null, data: { name: 'Synthetic' } }))
})

test('formal update preserves NULL legacy status and requires an explicit version predicate', () => {
  assert.throws(() => planFormalSpotMutation('PATCH', { id: 636, data: { name: 'Synthetic' } }))
  const changed = planFormalSpotMutation('PATCH', { id: 636, expectedUpdatedAt: null, data: { description: 'Synthetic change' } })
  assert.deepEqual(changed.versionPredicate, { column: 'updated_at', operator: 'is', value: null })
  assert.ok(!Object.hasOwn(changed.values, 'publication_status'))
  assert.equal(changed.requireExactlyOneRow, true)
  const hidden = planFormalSpotMutation('HIDE', { id: 636, expectedUpdatedAt: '2026-11-12T00:00:00Z' })
  assert.equal(hidden.values.publication_status, 'hidden')
  assert.equal(hidden.versionPredicate.operator, 'eq')
})

test('Note/Guide authority preparations reject absent or stale versions', () => {
  assert.throws(() => assertFormalAuthorityVersion({}, undefined))
  assert.throws(() => assertFormalAuthorityVersion({ updatedAt: '2026-11-12T00:00:00Z' }, null))
  assert.equal(assertFormalAuthorityVersion({ updatedAt: null }, null), true)
})
