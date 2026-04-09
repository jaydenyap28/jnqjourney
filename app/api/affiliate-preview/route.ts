import { NextRequest, NextResponse } from 'next/server'

function extractMetaContent(html: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) {
      return match[1].trim()
    }
  }

  return ''
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function makeAbsoluteUrl(baseUrl: string, maybeRelative: string) {
  if (!maybeRelative) return ''

  try {
    return new URL(maybeRelative, baseUrl).toString()
  } catch {
    return ''
  }
}

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get('url')

  if (!target) {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 })
  }

  let parsedTarget: URL

  try {
    parsedTarget = new URL(target)
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 })
  }

  if (!['http:', 'https:'].includes(parsedTarget.protocol)) {
    return NextResponse.json({ error: 'Unsupported protocol' }, { status: 400 })
  }

  try {
    const response = await fetch(parsedTarget.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; JnQJourneyPreviewBot/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      cache: 'no-store',
    })

    const finalUrl = response.url || parsedTarget.toString()
    const html = await response.text()

    const title = decodeHtml(
      extractMetaContent(html, [
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i,
        /<title[^>]*>([^<]+)<\/title>/i,
      ])
    )

    const image = makeAbsoluteUrl(
      finalUrl,
      decodeHtml(
        extractMetaContent(html, [
          /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
          /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
          /<meta[^>]+property=["']og:image:url["'][^>]+content=["']([^"']+)["']/i,
        ])
      )
    )

    return NextResponse.json({
      title,
      image,
      finalUrl,
      hostname: new URL(finalUrl).hostname.replace(/^www\./i, ''),
    })
  } catch {
    return NextResponse.json({
      title: '',
      image: '',
      finalUrl: parsedTarget.toString(),
      hostname: parsedTarget.hostname.replace(/^www\./i, ''),
    })
  }
}
