/** Server policy: Preview stays read-only. No environment opt-in can unlock it. */
export function previewReadOnlyResponse(tracking = false): Response | null {
  if (process.env.VERCEL_ENV !== 'preview') return null
  return Response.json(
    tracking ? { ok: true, skipped: true, reason: 'preview-read-only' } : { ok: false, error: 'Preview is read-only.', code: 'PREVIEW_READ_ONLY' },
    { status: tracking ? 200 : 503, headers: { 'Cache-Control': 'private, no-store' } },
  )
}

// Older Preview deployments may have cached content from a different source.
export function previewCacheKey(parts: string[]) {
  return process.env.VERCEL_ENV === 'preview' ? [...parts, 'isolated-preview-fixtures-v1'] : parts
}
