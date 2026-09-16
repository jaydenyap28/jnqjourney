import assert from 'node:assert/strict'
import test from 'node:test'

import { slugifyNote } from '../lib/notes.ts'

test('slugifyNote retains Chinese titles so a new draft has a valid slug', () => {
  assert.equal(slugifyNote('登嘉楼海龟之夜'), '登嘉楼海龟之夜')
})

test('slugifyNote keeps the existing ASCII slug format', () => {
  assert.equal(slugifyNote('Cameron Highlands: Tea & Trails'), 'cameron-highlands-tea-trails')
})
