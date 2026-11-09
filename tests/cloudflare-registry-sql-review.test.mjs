import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {SPOT_FIELDS} from '../cloudflare/spot-loop/spot-contract.mjs'
import {registryFixture} from './helpers/media-registry-poc-fixture.mjs'

const draft = await readFile(new URL('../cloudflare/spot-loop/review/trusted-media-registry.draft.sql', import.meta.url), 'utf8')
const body = name => draft.match(new RegExp(`create function ${name.replace('.', '\\.')}\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`))[1]
const quoted = value => [...value.matchAll(/'([^']+)'/g)].map(match => match[1])

test('review draft explicitly grants exactly the six RPCs to service_role', () => {
  const rpc = [...draft.matchAll(/create function public\.(jnq_media_\w+)\(/g)].map(match => match[1])
  assert.deepEqual(rpc, ['register', 'save', 'withdraw', 'revoke', 'delete', 'lookup'].map(name => `jnq_media_${name}`))
  for (const name of rpc) {
    const revoke = draft.match(new RegExp(`revoke all on function public\\.${name}\\(([^)]+)\\) from public, anon, authenticated, service_role;`))
    assert.ok(revoke, `Missing default EXECUTE removal for ${name}`)
    assert.ok(draft.includes(`grant execute on function public.${name}(${revoke[1]}) to service_role;`))
    assert.ok(draft.includes(`create function public.${name}(`))
  }
  assert.doesNotMatch(draft, /security definer/i)
  assert.match(draft, /revoke all on all functions in schema jnq_media_private from public, anon, authenticated, service_role;/)
  assert.match(draft, /revoke all on table jnq_media_private.enabled_spots, jnq_media_private.registry\s+from public, anon, authenticated, service_role;/)
})

test('draft save allowlist, assignments and projection match the Spot contract', () => {
  const save = body('public.jnq_media_save')
  const expected = SPOT_FIELDS.filter(field => !['id', 'created_at', 'updated_at'].includes(field)).sort()
  assert.deepEqual(quoted(save.match(/k\.field <> all\(array\[([\s\S]*?)\]\)/)[1]).sort(), expected)
  const assignments = [...save.matchAll(/^\s+(\w+) = v_after\.\1,?$/gm)].map(match => match[1]).sort()
  assert.deepEqual(assignments, [...expected, 'updated_at'].sort())
  assert.match(save, /v_after\.updated_at := greatest\(/)
  assert.deepEqual(quoted(body('jnq_media_private.spot_projection').match(/any\(array\[([\s\S]*?)\]\)/)[1]).sort(), [...SPOT_FIELDS].sort())
  assert.match(save, /v_before\.updated_at is distinct from p_expected_updated_at/)
  assert.match(save, /count\(distinct o\.key\)/)
  assert.match(save, /r\.revoked_at is null/)
})

test('draft pins namespaces and rejects un-revocation and suppressed or altered writes', () => {
  assert.equal([...draft.matchAll(/create function /g)].length,
    [...draft.matchAll(/set search_path = pg_catalog, pg_temp/g)].length)
  assert.match(body('jnq_media_private.guard_registry_update'), /old\.revoked_at is not null and new\.revoked_at is distinct from old\.revoked_at/)
  assert.match(draft, /before update on jnq_media_private\.registry/)
  assert.match(body('public.jnq_media_save'), /to_jsonb\(v_before\) is distinct from to_jsonb\(v_after\)/)
  for (const [rpc, error] of [['save','SPOT_SAVE'], ['withdraw','SPOT_WITHDRAW'], ['delete','SPOT_DELETE'], ['revoke','MEDIA_REVOKE']]) {
    assert.match(body('public.jnq_media_'+rpc), new RegExp('JNQ_'+error+'_NOT_APPLIED'))
  }
})

for (const failure of ['before commit', 'after commit', 'receipt write']) {
  test(`confirm-only retry preserves final object after ${failure}`, async () => {
    const f = registryFixture({confirmOnlyRetry:true})
    const key = await f.legacy.issue()
    await f.legacy.stage(key)
    if (failure === 'before commit') f.model.failRegistrationBefore()
    else if (failure === 'after commit') f.model.failRegistrationAfter()
    else f.legacy.faultReceipt()
    assert.equal((await f.complete(key)).status, 503)
    const committed = failure === 'after commit'
    assert.equal((await f.complete(key)).status, committed ? 201 : 503)
    assert.equal(f.model.entries.size, Number(committed))
    assert.equal(f.legacy.copies(), 1)
    assert.ok(f.legacy.objects.has(key))
    assert.ok(!f.legacy.deletes.includes(key))
    if (!committed) {
      await assert.rejects(f.save({images:['/'+key], image_url:'/'+key}), {code:'MEDIA_NOT_REGISTERED_OR_ACTIVE'})
    }
  })
}

test('a substituted object and matching replacement receipt cannot bootstrap a retry', async () => {
  const f = registryFixture({confirmOnlyRetry:true})
  const key = await f.legacy.issue()
  await f.legacy.stage(key)
  f.model.failRegistrationBefore()
  assert.equal((await f.complete(key)).status, 503)
  const receipt = '_candidate-validation/' + key.slice('media/candidate/'.length) + '.json'
  const proof = JSON.parse(f.legacy.objects.get(receipt).bytes)
  const original = f.legacy.objects.get(key)
  const replacement = await f.r2.put(key, original.bytes, {httpMetadata:original.metadata})
  await f.r2.put(receipt, JSON.stringify({...proof, etag:replacement.etag, version:replacement.version}))
  assert.equal((await f.complete(key)).status, 503)
  assert.equal(f.model.entries.size, 0)
  assert.equal(f.legacy.copies(), 1)
})
