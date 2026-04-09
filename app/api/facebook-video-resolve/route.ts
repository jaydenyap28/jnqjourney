import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

function normalizeFacebookUrl(url?: string | null) {
  if (!url) return ''

  return String(url)
    .replace('m.facebook.com', 'www.facebook.com')
    .replace('web.facebook.com', 'www.facebook.com')
    .trim()
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#47;/g, '/')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function extractCanonicalUrl(html: string) {
  const candidates = [
    html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1],
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:url["'][^>]*>/i)?.[1],
    html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i)?.[1],
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["'][^>]*>/i)?.[1],
  ]
    .map((item) => decodeHtml(String(item || '').trim()))
    .filter(Boolean)

  return candidates[0] || ''
}

function isEmbeddableFacebookVideoUrl(url?: string | null) {
  const cleanUrl = normalizeFacebookUrl(url)
  if (!cleanUrl) return false

  if (/facebook\.com\/share\/v\//i.test(cleanUrl)) return false

  return /facebook\.com\/.+\/(posts|videos|reel|watch|permalink)\//i.test(cleanUrl) || /story\.php|permalink\.php|video\.php|fb\.watch\//i.test(cleanUrl)
}

function toUrlVariants(input: string) {
  try {
    const base = new URL(normalizeFacebookUrl(input))
    const list = [base.toString()]

    const mobile = new URL(base.toString())
    mobile.hostname = 'm.facebook.com'
    list.push(mobile.toString())

    const mbasic = new URL(base.toString())
    mbasic.hostname = 'mbasic.facebook.com'
    list.push(mbasic.toString())

    return Array.from(new Set(list))
  } catch {
    return []
  }
}

async function fetchFacebookPage(url: string) {
  const response = await fetch(url, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      'accept-language': 'en-US,en;q=0.9,zh-CN;q=0.8',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    },
    redirect: 'follow',
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Facebook page fetch failed: HTTP ${response.status}`)
  }

  return {
    finalUrl: response.url,
    html: await response.text(),
  }
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get('url')

  if (!rawUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  const variants = toUrlVariants(rawUrl)
  if (!variants.length) {
    return NextResponse.json({ error: 'Invalid Facebook URL' }, { status: 400 })
  }

  for (const variant of variants) {
    try {
      const { finalUrl, html } = await fetchFacebookPage(variant)
      const canonicalUrl = normalizeFacebookUrl(extractCanonicalUrl(html))
      const candidates = [canonicalUrl, normalizeFacebookUrl(finalUrl), normalizeFacebookUrl(rawUrl)].filter(Boolean)
      const resolvedUrl = candidates.find((candidate) => isEmbeddableFacebookVideoUrl(candidate)) || candidates[0] || ''

      if (resolvedUrl) {
        return NextResponse.json({
          resolvedUrl,
          embeddable: isEmbeddableFacebookVideoUrl(resolvedUrl),
        })
      }
    } catch {
      // Try the next variant.
    }
  }

  return NextResponse.json({
    resolvedUrl: normalizeFacebookUrl(rawUrl),
    embeddable: false,
  })
}
