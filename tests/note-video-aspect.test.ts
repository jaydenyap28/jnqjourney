import assert from 'node:assert/strict'
import test from 'node:test'

import { convertBlocksToMarkdown, normalizeNoteVideoAspect, parseMarkdownToBlocks } from '../lib/notes.ts'

test('preserves an explicit portrait video block and defaults other videos to auto', () => {
  const markdown = '[video url="https://www.facebook.com/reel/123" title="Shanghai" aspect="portrait"]\n\n[video url="https://www.youtube.com/watch?v=abc" title="Landscape"]'
  const blocks = parseMarkdownToBlocks(markdown)

  assert.equal(blocks[0].videoAspect, 'portrait')
  assert.equal(blocks[1].videoAspect, 'auto')
  assert.equal(convertBlocksToMarkdown(blocks), markdown)
})

test('accepts only the supported video aspect values', () => {
  assert.equal(normalizeNoteVideoAspect('LANDSCAPE'), 'landscape')
  assert.equal(normalizeNoteVideoAspect('portrait'), 'portrait')
  assert.equal(normalizeNoteVideoAspect('square'), 'auto')
})
