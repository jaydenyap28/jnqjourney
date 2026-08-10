import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import {
  assertCompletePublishedNote,
  fetchProductionNoteDetails,
  replaceSingleNote,
  sha256Text,
  validateNoteSnapshot,
} from '../scripts/lib/public-note-snapshot.mjs'

const root = process.cwd()
const turtleSlug = 'malaysia-turtle-night-terengganu'
const turtleContentHash = '4130a73fb6e5b9da5e9441d8a4bd8521f5fc2baa4011b37891eac703c4044e7d'

test('published Note list DTOs cannot become detail snapshots', () => {
  assert.throws(
    () => assertCompletePublishedNote({ slug: 'list-only', title: 'List', published: true }),
    /list DTO/,
  )
  assert.throws(
    () => assertCompletePublishedNote({ slug: 'empty', title: 'Empty', published: true, blocks: [] }),
    /0 blocks/,
  )
})

test('publisher fetches every complete Note detail after the list', async () => {
  const urls: string[] = []
  const fetchMock = async (url: string) => {
    urls.push(url)
    if (!url.includes('?slug=')) return { ok: true, json: async () => ({ notes: [{ slug: 'complete' }] }) }
    return { ok: true, json: async () => ({ note: { slug: 'complete', title: 'Complete', published: true, content: 'body', blocks: [{ type: 'paragraph', content: 'body' }] } }) }
  }
  const notes = await fetchProductionNoteDetails('https://example.test', fetchMock as typeof fetch)
  assert.equal(notes.length, 1)
  assert.deepEqual(urls, ['https://example.test/api/notes', 'https://example.test/api/notes?slug=complete'])
})

test('snapshot validation refuses block count regression and reports body hashes', () => {
  const current = { slug: 'note', title: 'Note', published: true, content: 'old', blocks: [{}, {}] }
  const next = { ...current, content: 'new', blocks: [{}] }
  assert.throws(() => validateNoteSnapshot([next], [current]), /fall from 2 to 1/)
})

test('targeted replacement preserves every other Note byte-for-byte', () => {
  const current = [
    { slug: 'other', title: 'Other', published: true, content: 'other', blocks: [{}] },
    { slug: 'target', title: 'Target', published: true, content: 'old', blocks: [{}] },
  ]
  const replacement = { ...current[1], content: 'new', blocks: [{}, {}] }
  const merged = replaceSingleNote(current, replacement)
  assert.equal(merged[0], current[0])
  assert.equal(merged[1], replacement)
})

test('trusted turtle Note passes the exact 84-block and content hash contract', async () => {
  const notes = JSON.parse(await readFile(path.join(root, 'data/notes.json'), 'utf8'))
  const note = notes.find((item: { slug?: string }) => item.slug === turtleSlug)
  assert.ok(note)
  assert.equal(note.blocks.length, 84)
  assert.equal(sha256Text(note.content), turtleContentHash)
  assert.doesNotThrow(() => assertCompletePublishedNote(note, {
    expectedBlocks: 84,
    expectedContentSha256: turtleContentHash,
  }))
})
