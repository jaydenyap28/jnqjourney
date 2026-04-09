import { requireAdminRequest } from '@/lib/server/admin-auth'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

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

function normalizeCandidateUrl(raw: string, baseUrl?: string) {
  const decoded = decodeHtml(raw)
    .replace(/\\u0025/g, '%')
    .replace(/\\u0026/g, '&')
    .replace(/\\u003d/g, '=')
    .replace(/\\u002F/g, '/')
    .replace(/\\u003A/g, ':')
    .replace(/\\\//g, '/')
    .replace(/^u003C/, '')
    .replace(/^\"+|\"+$/g, '')
    .trim()

  const resolved = decoded.startsWith('//')
    ? `https:${decoded}`
    : decoded.startsWith('http')
      ? decoded
      : baseUrl
        ? new URL(decoded, baseUrl).toString()
        : null

  if (!resolved) return null

  try {
    return new URL(resolved).toString()
  } catch {
    return null
  }
}

function isLikelyFacebookImage(urlString: string) {
  try {
    const url = new URL(urlString)
    const host = url.hostname.toLowerCase()
    const value = url.toString().toLowerCase()

    if (!host.includes('fbcdn.net') && !host.includes('facebook.com') && !host.includes('fbsbx.com')) {
      return false
    }

    if (host.includes('static.xx.fbcdn.net')) return false
    if (value.includes('emoji.php')) return false
    if (value.includes('safe_image.php')) return false
    if (value.includes('/rsrc.php/')) return false
    if (value.includes('profile_pic')) return false
    if (/[_-](p|s)\d+x\d+/i.test(value)) return false

    return true
  } catch {
    return false
  }
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items))
}

function imageFingerprint(urlString: string) {
  try {
    const url = new URL(urlString)
    return `${url.hostname.toLowerCase()}${url.pathname}`
  } catch {
    return urlString
  }
}

function uniqueImages(items: string[]) {
  const seen = new Set<string>()

  return items.filter((item) => {
    const fingerprint = imageFingerprint(item)
    if (seen.has(fingerprint)) return false
    seen.add(fingerprint)
    return true
  })
}

function isLikelyAlbumPage(urlString: string) {
  try {
    const url = new URL(urlString)
    const host = url.hostname.toLowerCase()
    const path = url.pathname.toLowerCase()
    const setValue = url.searchParams.get('set')?.toLowerCase() || ''

    if (!host.includes('facebook.com')) return false

    return path.includes('/media/set/') || setValue.startsWith('a.')
  } catch {
    return false
  }
}

function extractMatches(html: string, patterns: RegExp[], baseUrl?: string) {
  return unique(
    patterns.flatMap((pattern) =>
      Array.from(html.matchAll(pattern))
        .map((match) => normalizeCandidateUrl(match[1], baseUrl))
        .filter((value): value is string => Boolean(value))
    )
  )
}

function extractImageUrls(html: string, baseUrl?: string) {
  const patterns: RegExp[] = [
    /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/gi,
    /<img[^>]+(?:src|data-src)=["']([^"']+)["']/gi,
    /"image":\{"uri":"([^"]+)"/gi,
    /"image_url":"([^"]+)"/gi,
    /"thumbnailImage":\{"uri":"([^"]+)"/gi,
    /(https:\\\/\\\/[^"'<>\\]+(?:fbcdn\.net|fbsbx\.com)[^"'<>\\]*)/gi,
    /(https:\/\/[^"'<>]+(?:fbcdn\.net|fbsbx\.com)[^"'<>]*)/gi,
  ]

  return uniqueImages(
    patterns
      .flatMap((pattern) =>
        Array.from(html.matchAll(pattern))
          .map((match) => normalizeCandidateUrl(match[1], baseUrl))
          .filter((value): value is string => Boolean(value))
      )
      .filter(isLikelyFacebookImage)
  ).slice(0, 18)
}

function isLikelyPhotoPage(urlString: string) {
  try {
    const url = new URL(urlString)
    const host = url.hostname.toLowerCase()
    const path = url.pathname.toLowerCase()

    if (!host.includes('facebook.com')) return false

    return (
      path === '/photo/' ||
      path === '/photo.php' ||
      path.includes('/photo/') ||
      path.includes('/photos/') ||
      path.includes('/media/set/') ||
      path.includes('/photo/view/')
    )
  } catch {
    return false
  }
}

function extractPhotoPageUrls(html: string, baseUrl?: string, limit = 10) {
  const hrefPatterns = [
    /<a[^>]+href=["']([^"']+)["']/gi,
    /"(?:url|href)":"([^"]+)"/gi,
    /"(\/photo\/\?fbid=[^"]+)"/gi,
    /"(\/photo\.php\?fbid=[^"]+)"/gi,
  ]

  return extractMatches(html, hrefPatterns, baseUrl)
    .filter(isLikelyPhotoPage)
    .slice(0, limit)
}

function extractPhotoIds(html: string) {
  return unique(
    Array.from(
      html.matchAll(
        /(?:[?&]fbid=|["']fbid["']\s*:\s*["']?|\/photo\/\?fbid=|["']photo(?:_id)?["']\s*:\s*["']?|["']media_id["']\s*:\s*["']?)(\d{6,})/gi
      )
    ).map((match) => match[1])
  ).slice(0, 80)
}

function buildPhotoUrlsFromIds(ids: string[]) {
  return ids.flatMap((id) => [
    `https://www.facebook.com/photo/?fbid=${id}`,
    `https://mbasic.facebook.com/photo.php?fbid=${id}`,
  ])
}

function extractMessage(html: string) {
  const ogDescription =
    html.match(/property=["']og:description["']\s+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/content=["']([^"']+)["']\s+property=["']og:description["']/i)?.[1]
  const title =
    html.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/content=["']([^"']+)["']\s+property=["']og:title["']/i)?.[1]

  return decodeHtml(ogDescription || title || '').trim()
}

function extractPhotoItems(pages: Array<{ url: string; html: string }>) {
  const seen = new Set<string>()

  return pages.flatMap((page) => {
    const caption = extractMessage(page.html)
    const images = extractImageUrls(page.html, page.url)

    return images.slice(0, 2).flatMap((url) => {
      const fingerprint = imageFingerprint(url)
      if (seen.has(fingerprint)) return []
      seen.add(fingerprint)

      return [{ url, caption, sourceUrl: page.url }]
    })
  })
}

function toMbasicUrl(input: string) {
  const url = new URL(input)
  url.hostname = 'mbasic.facebook.com'
  return url.toString()
}

function toMobileUrl(input: string) {
  const url = new URL(input)
  url.hostname = 'm.facebook.com'
  return url.toString()
}

async function fetchFacebookHtml(url: string) {
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

  return response.text()
}

async function fetchHtmlVariants(urls: string[]) {
  const uniqueUrls = unique(urls.filter(Boolean))
  const results = await Promise.allSettled(uniqueUrls.map((url) => fetchFacebookHtml(url)))

  return results
    .map((result, index) => ({ result, url: uniqueUrls[index] }))
    .filter(
      (item): item is { result: PromiseFulfilledResult<string>; url: string } => item.result.status === 'fulfilled'
    )
    .map((item) => ({ url: item.url, html: item.result.value }))
}

export async function POST(request: Request) {
  const adminCheck = await requireAdminRequest(request)
  if (!adminCheck.ok) return adminCheck.response

  try {
    const body = await request.json()
    const postUrl = String(body?.postUrl || '').trim()

    if (!postUrl) {
      return NextResponse.json({ error: '???? Facebook ???' }, { status: 400 })
    }

    let parsedUrl: URL
    try {
      parsedUrl = new URL(postUrl)
    } catch {
      return NextResponse.json({ error: 'Facebook ????????' }, { status: 400 })
    }

    if (!parsedUrl.hostname.includes('facebook.com') && !parsedUrl.hostname.includes('fb.watch')) {
      return NextResponse.json({ error: '????? Facebook ??????????????' }, { status: 400 })
    }

    const isAlbumRequest = isLikelyAlbumPage(postUrl)
    const primaryUrls = [
      postUrl,
      parsedUrl.hostname.includes('facebook.com') && parsedUrl.hostname !== 'mbasic.facebook.com' ? toMbasicUrl(postUrl) : '',
      parsedUrl.hostname.includes('facebook.com') && parsedUrl.hostname !== 'm.facebook.com' ? toMobileUrl(postUrl) : '',
    ]

    const primaryPages = await fetchHtmlVariants(primaryUrls)
    const photoPageUrls = unique(
      primaryPages.flatMap((page) => [
        ...extractPhotoPageUrls(page.html, page.url, isAlbumRequest ? 48 : 12),
        ...buildPhotoUrlsFromIds(extractPhotoIds(page.html)),
      ])
    ).slice(0, isAlbumRequest ? 48 : 12)

    const photoPages = await fetchHtmlVariants(
      photoPageUrls.flatMap((url) => {
        const variants = [url]
        if (!url.includes('mbasic.facebook.com')) variants.push(toMbasicUrl(url))
        if (!url.includes('m.facebook.com')) variants.push(toMobileUrl(url))
        return variants
      })
    )

    const allPages = [...primaryPages, ...photoPages]
    const items = extractPhotoItems(photoPages)
    const albumImages = uniqueImages(items.map((item) => item.url))
    const images = isAlbumRequest
      ? albumImages.slice(0, 48)
      : uniqueImages(allPages.flatMap((page) => extractImageUrls(page.html, page.url))).slice(0, 18)
    const message = allPages.map((page) => extractMessage(page.html)).find(Boolean) || ''

    if (isAlbumRequest && !albumImages.length) {
      return NextResponse.json({
        postUrl,
        images: [],
        items: [],
        photoLinks: unique(photoPageUrls),
        message: '??????????????',
        suggestedFacebookVideoUrl: null,
      })
    }

    if (!images.length) {
      return NextResponse.json(
        {
          error: '??????? Facebook ????????????????????????????',
        },
        { status: 404 }
      )
    }

    return NextResponse.json({
      postUrl,
      images,
      items,
      message,
      suggestedFacebookVideoUrl:
        /\/(videos|reel)\//i.test(postUrl) || postUrl.includes('fb.watch') ? postUrl : null,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '?? Facebook ???????????' },
      { status: 500 }
    )
  }
}
