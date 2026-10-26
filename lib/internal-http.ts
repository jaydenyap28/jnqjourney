/** Protection credentials may only travel to this exact Preview deployment. */
export function internalPreviewHeaders(request: Request, target: URL): Headers {
  const headers = new Headers()
  if (process.env.VERCEL_ENV !== 'preview') return headers
  const host = process.env.VERCEL_URL || ''
  if (!/^[a-z0-9-]+\.vercel\.app$/.test(host)) throw new Error('Unverified Preview deployment')
  const origin = `https://${host}`
  const source = new URL(request.url)
  if (source.origin !== origin || target.origin !== origin || source.username || source.password || target.username || target.password) {
    throw new Error('Untrusted internal Preview origin')
  }
  const cookies = (request.headers.get('cookie') || '').split(';').map(value => value.trim())
    .filter(value => ['_vercel_jwt', '__vercel_protection_bypass'].includes(value.split('=')[0]))
  if (cookies.length) headers.set('cookie', cookies.join('; '))
  const bypass = request.headers.get('x-vercel-protection-bypass')
  if (bypass) headers.set('x-vercel-protection-bypass', bypass)
  // Never copy application Authorization, Host, forwarded headers, query tokens,
  // Set-Cookie controls, or the project-wide automation secret from the env.
  return headers
}
