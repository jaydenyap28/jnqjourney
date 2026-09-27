import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { CLOSED_IMAGE_LIGHTBOX, reduceImageLightbox } from '../lib/image-lightbox.ts'

test('shared Lightbox reducer opens and closes idempotently', () => {
  const open = reduceImageLightbox(CLOSED_IMAGE_LIGHTBOX, { type: 'open' })
  assert.equal(open.isOpen, true)
  assert.equal(reduceImageLightbox(open, { type: 'open' }), open)
  assert.deepEqual(reduceImageLightbox(open, { type: 'close' }), CLOSED_IMAGE_LIGHTBOX)
})

test('shared Lightbox owns dialog accessibility, scroll lock, Escape and focus return', () => {
  const source = fs.readFileSync('components/ZoomableImage.tsx', 'utf8')
  assert.match(source, /role="dialog"/)
  assert.match(source, /aria-modal="true"/)
  assert.match(source, /aria-label="关闭图片预览"/)
  assert.match(source, /event\.key === 'Escape'/)
  assert.match(source, /body\.style\.overflow = 'hidden'/)
  assert.match(source, /returnFocusTo\?\.focus\(\)/)
})

test('Spot and Note single/gallery images use the same shared component without changing Note sizing helpers', () => {
  const spot = fs.readFileSync('components/SpotDescription.tsx', 'utf8')
  const note = fs.readFileSync('app/notes/[slug]/page.tsx', 'utf8')
  const reader = fs.readFileSync('components/NoteInteractiveReader.tsx', 'utf8')

  assert.match(spot, /import ZoomableImage/)
  assert.match(note, /import ZoomableImage/)
  assert.ok((note.match(/<ZoomableImage/g) || []).length >= 2)
  assert.match(note, /getImageFigureClass\(block\.imageSize\)/)
  assert.match(note, /getGalleryClass\(block\.imageSize, block\.images\.length\)/)
  assert.doesNotMatch(note, /data-lightbox-src|lightbox-trigger/)
  assert.doesNotMatch(reader, /data-lightbox-src|lightbox-trigger/)
})
