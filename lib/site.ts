const fallbackSiteUrl = 'https://jnqjourney.com'

export function getSiteUrl() {
  const envSiteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)

  try {
    return new URL(envSiteUrl || fallbackSiteUrl)
  } catch {
    return new URL(fallbackSiteUrl)
  }
}

export function absoluteUrl(path: string) {
  return new URL(path, getSiteUrl()).toString()
}
