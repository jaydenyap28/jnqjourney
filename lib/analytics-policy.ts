export const PRODUCTION_ANALYTICS_HOSTS = new Set(['jnqjourney.com', 'www.jnqjourney.com'])

// Match identifiable automation, not arbitrary substrings such as a Cubot phone.
const BOT_PATTERN = /\b(?:bot|googlebot(?:-[a-z]+)?|bingbot|duckduckbot|yandexbot|baiduspider|bytespider|petalbot|applebot|gptbot|chatgpt-user|claudebot|ahrefsbot|semrushbot|mj12bot|slackbot|discordbot|twitterbot|telegrambot|linkedinbot|meta-externalagent|meta-externalfetcher|[a-z0-9_-]*(?:crawler|spider)|slurp|facebookexternalhit|lighthouse|pagespeed|headlesschrome|python-requests|curl|wget|uptimerobot|bingpreview|mediapartners-google)\b/i

export function isAnalyticsBot(userAgent: string) {
  return BOT_PATTERN.test(userAgent)
}

export function isAnalyticsPath(path: string) {
  if (!path.startsWith('/') || path.startsWith('//')) return false
  const url = new URL(path, 'https://www.jnqjourney.com')
  const pathname = url.pathname.replace(/^\/en(?=\/|$)/, '') || '/'
  return !/^\/(?:admin|api|preview|_next)(?:\/|$)/i.test(pathname)
    && !['preview', 'draft'].some(key => url.searchParams.has(key))
}

export function analyticsRequestHost(request: Request) {
  // The actual request URL/Host is authoritative; don't accept a caller-supplied
  // x-forwarded-host to turn a Preview request into a production write.
  return new URL(request.url).hostname.toLowerCase()
}
