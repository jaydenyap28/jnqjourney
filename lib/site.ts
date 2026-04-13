const fallbackSiteUrl = 'https://www.jnqjourney.com'

export function getSiteUrl() {
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
