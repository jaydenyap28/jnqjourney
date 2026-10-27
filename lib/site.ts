const fallbackSiteUrl = 'https://www.jnqjourney.com'

export function getSiteUrl() {
  if (process.env.VERCEL_ENV === 'preview') {
    const host = process.env.VERCEL_URL || ''
    if (!/^[a-z0-9-]+\.vercel\.app$/.test(host)) throw new Error('Unverified Preview site origin')
    return new URL(`https://${host}`)
  }
  const rawSiteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)

  const envSiteUrl = rawSiteUrl ? rawSiteUrl.replace(/\/+$/, '') : null

  try {
    return new URL(envSiteUrl || fallbackSiteUrl)
  } catch {
    return new URL(fallbackSiteUrl)
  }
}

export function absoluteUrl(path: string) {
  return new URL(path, getSiteUrl()).toString()
}
