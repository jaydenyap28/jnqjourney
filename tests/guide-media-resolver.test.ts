import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveGuideMedia } from '../lib/guide-media.ts'
import type { GuideDayImage, TravelGuide } from '../lib/guides.ts'

function image(url: string, alt = url, extra: Partial<GuideDayImage> = {}): GuideDayImage {
  return { url, alt, ...extra }
}

function guide(coverImage: string | undefined, gallery: GuideDayImage[] = []) {
  return {
    slug: 'guide-fixture',
    title: 'Guide fixture',
    coverImage,
    days: [{ dayLabel: 'Day 1', title: 'Day one', summary: '', highlights: [], gallery }],
  } as unknown as TravelGuide
}

test('inserts a cover that is not in the gallery without mutating stored gallery data', () => {
  const source = guide('https://cdn.example.com/cover.webp', [image('https://cdn.example.com/one.webp')])
  const resolved = resolveGuideMedia(source)

  assert.deepEqual(resolved.images.map((item) => item.url), ['https://cdn.example.com/cover.webp', 'https://cdn.example.com/one.webp'])
  assert.deepEqual(source.days[0].gallery?.map((item) => item.url), ['https://cdn.example.com/one.webp'])
})

test('moves an existing cover to first position without duplication using normalized URLs', () => {
  const resolved = resolveGuideMedia(guide('https://CDN.example.com/path/cover.webp?width=1600', [
    image('https://cdn.example.com/path/one.webp'),
    image('https://cdn.example.com/path/cover.webp?format=webp'),
  ]))

  assert.equal(resolved.images.length, 2)
  assert.equal(resolved.images[0].url, 'https://CDN.example.com/path/cover.webp?width=1600')
  assert.equal(resolved.images[1].url, 'https://cdn.example.com/path/one.webp')
})

test('matches equivalent R2 assets before URL text and preserves the gallery item once', () => {
  const resolved = resolveGuideMedia(guide('https://jnq.r2.dev/guides/cover.webp?version=2', [
    image('https://images.example.com/rendered-cover.webp', 'R2 cover', { r2Key: 'guides/cover.webp' }),
    image('https://images.example.com/second.webp'),
  ]))

  assert.equal(resolved.images.length, 2)
  assert.equal(resolved.images[0].alt, 'R2 cover')
  assert.equal(resolved.images[0].url, 'https://jnq.r2.dev/guides/cover.webp?version=2')
})

test('uses a stable asset ID in the URL before treating transformed URLs as distinct images', () => {
  const assetId = '0a8689bc-5f04-430c-afd5-ecc43fc29f40'
  const resolved = resolveGuideMedia(guide(`https://r2.example.com/cover/${assetId}.webp`, [
    image(`https://images.example.com/derivatives/${assetId}-large.webp?width=1600`),
    image('https://images.example.com/second.webp'),
  ]))

  assert.equal(resolved.images.length, 2)
  assert.equal(resolved.images[0].url, `https://r2.example.com/cover/${assetId}.webp`)
})

test('changing a cover changes only the display lead image and retains older gallery images', () => {
  const source = guide('https://cdn.example.com/new.webp', [
    image('https://cdn.example.com/old.webp'),
    image('https://cdn.example.com/new.webp'),
  ])
  const resolved = resolveGuideMedia(source)

  assert.deepEqual(resolved.images.map((item) => item.url), ['https://cdn.example.com/new.webp', 'https://cdn.example.com/old.webp'])
})

test('clearing a cover restores the original gallery order and uses its first image as fallback', () => {
  const source = guide(undefined, [image('https://cdn.example.com/first.webp'), image('https://cdn.example.com/second.webp')])
  const resolved = resolveGuideMedia(source)

  assert.equal(resolved.coverImage, 'https://cdn.example.com/first.webp')
  assert.deepEqual(resolved.images.map((item) => item.url), ['https://cdn.example.com/first.webp', 'https://cdn.example.com/second.webp'])
})

test('six Guide records use the same resolver contract', () => {
  const guides = Array.from({ length: 6 }, (_, index) => guide(
    index % 2 ? undefined : `https://cdn.example.com/cover-${index}.webp`,
    [image(`https://cdn.example.com/gallery-${index}.webp`)]
  ))

  for (const item of guides) {
    const resolved = resolveGuideMedia(item)
    assert.equal(resolved.coverImage, resolved.images[0].url)
  }
})
