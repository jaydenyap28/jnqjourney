/** Accept provider hosts exactly; never turn a lookalike URL into an embed. */
export function parseNoteVideo(value?: string | null) {
  try {
    const url = new URL(String(value || '').trim())
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null
    const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, '')
    if (host === 'youtu.be' || host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const id = host === 'youtu.be' ? url.pathname.slice(1) : url.pathname === '/watch'
        ? url.searchParams.get('v') : url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)\/?$/)?.[1]
      if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null
      return { provider: 'youtube' as const, id, watchUrl: `https://www.youtube.com/watch?v=${id}` }
    }
    if (host === 'facebook.com' || host === 'fb.watch') {
      url.protocol = 'https:'
      return { provider: 'facebook' as const, watchUrl: url.href }
    }
  } catch {}
  return null
}
