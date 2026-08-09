import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { resolveSpotDisplayImages } from '../lib/spot-media.ts'

test('a cover duplicated as the only gallery item remains visible', () => {
  const cover = 'https://cdn.example.com/spot.webp#focus=50,50'
  assert.deepEqual(resolveSpotDisplayImages({ image_url: cover, images: [cover] }), [cover])
})

test('cover leads the gallery while equivalent URLs are deduplicated', () => {
  const cover = 'https://cdn.example.com/spot.webp#focus=40,60'
  assert.deepEqual(
    resolveSpotDisplayImages({
      image_url: cover,
      images: ['https://CDN.example.com/spot.webp#focus=50,50', 'https://cdn.example.com/gallery.webp'],
    }),
    [cover, 'https://cdn.example.com/gallery.webp']
  )
})

test('an empty media record remains empty', () => {
  assert.deepEqual(resolveSpotDisplayImages({ image_url: null, images: [] }), [])
})

test('Youchao Villa snapshot cover is renderable', async () => {
  const raw = await readFile(path.join(process.cwd(), 'public-data', 'spots', 'youchao-villa-807.json'), 'utf8')
  const snapshot = JSON.parse(raw)
  assert.match(snapshot.spot.image_url, /\.r2\.dev\//)
  assert.deepEqual(resolveSpotDisplayImages(snapshot.spot), [snapshot.spot.image_url])
})
