// Horizontal swipes change the image. Vertical scrolling and pinch gestures
// remain native browser actions; taps and short jitter never change photos.
export function gallerySwipeDirection(start: { x: number; y: number }, end: { x: number; y: number }): -1 | 0 | 1 {
  const dx = end.x - start.x
  const dy = end.y - start.y
  return Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.5 ? dx < 0 ? 1 : -1 : 0
}
