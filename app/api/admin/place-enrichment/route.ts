import { requireAdminRequest } from '@/lib/server/admin-auth'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

type EnrichmentBody = {
  query?: string
  category?: string
}

function cleanSummaryText(value?: string, maxLength = 260) {
  const normalized = String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\([^)]*\)/g, '')
    .trim()

  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized

  const sliced = normalized.slice(0, maxLength)
  const lastStop = Math.max(sliced.lastIndexOf('?'), sliced.lastIndexOf('. '), sliced.lastIndexOf('?'))
  return (lastStop > 60 ? sliced.slice(0, lastStop + 1) : `${sliced.trimEnd()}...`).trim()
}

function mapOsmType(osmType?: string) {
  if (osmType === 'node' || osmType === 'N') return 'node'
  if (osmType === 'way' || osmType === 'W') return 'way'
  if (osmType === 'relation' || osmType === 'R') return 'relation'
  return null
}

function deriveTags({
  query,
  category,
  className,
  typeName,
  rawTags,
}: {
  query: string
  category?: string
  className?: string
  typeName?: string
  rawTags?: Record<string, string>
}) {
  const tags = new Set<string>()
  const normalizedQuery = query.toLowerCase()

  if (category === 'food') {
    tags.add('food')
  } else if (category === 'attraction') {
    tags.add('spot')
  }

  const osmHints = [className, typeName, rawTags?.tourism, rawTags?.shop, rawTags?.amenity, rawTags?.leisure]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (/(restaurant|cafe|food_court|bakery|ice_cream|coffee_shop|bubble_tea)/.test(osmHints)) tags.add('food')
  if (/(museum|attraction|theme_park|zoo|aquarium|viewpoint|gallery|monument)/.test(osmHints)) tags.add('spot')
  if (/(hotel|guest_house|hostel|motel|resort)/.test(osmHints)) tags.add('hotel')
  if (/(station|railway|train|public_transport|bus)/.test(osmHints)) tags.add('transport')
  if (/(mall|shopping|shop)/.test(osmHints)) tags.add('shopping')
  if (/(beach|island|lake|waterfall|forest|mountain|peak|park|garden)/.test(osmHints)) tags.add('nature')

  if (rawTags?.cuisine) {
    rawTags.cuisine
      .split(/[;,]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 3)
      .forEach((item) => tags.add(item))
  }

  if (/(cafe|coffee)/.test(normalizedQuery)) tags.add('cafe')
  if (/(night)/.test(normalizedQuery)) tags.add('night-view')
  if (/(beach)/.test(normalizedQuery)) tags.add('sea-view')
  if (/(onsen)/.test(normalizedQuery)) tags.add('onsen')
  if (/(children|family)/.test(normalizedQuery)) tags.add('family')

  return Array.from(tags).slice(0, 8)
}

async function fetchWikipediaSummary(title: string, language = 'zh') {
  const normalizedTitle = String(title || '').trim()
  if (!normalizedTitle) return ''

  const endpoint = `https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(normalizedTitle)}`
  const response = await fetch(endpoint, {
    headers: {
      'user-agent': 'JnQJourney/1.0 (admin place enrichment)',
      accept: 'application/json',
    },
    cache: 'no-store',
  })

  if (!response.ok) return ''
  const payload = (await response.json()) as { extract?: string }
  return cleanSummaryText(payload.extract)
}

async function fetchSummaryFromWikipediaTag(tag?: string) {
  if (!tag || !tag.includes(':')) return ''
  const [language, ...titleParts] = tag.split(':')
  const title = titleParts.join(':').trim()
  if (!language || !title) return ''
  return fetchWikipediaSummary(title, language)
}

async function fetchSummaryFromWikidataId(id?: string) {
  if (!id) return ''

  const response = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(id)}.json`, {
    headers: {
      'user-agent': 'JnQJourney/1.0 (admin place enrichment)',
      accept: 'application/json',
    },
    cache: 'no-store',
  })

  if (!response.ok) return ''
  const payload = (await response.json()) as {
    entities?: Record<
      string,
      {
        sitelinks?: Record<string, { title?: string }>
      }
    >
  }

  const entity = payload.entities?.[id]
  const zhTitle = entity?.sitelinks?.zhwiki?.title
  const enTitle = entity?.sitelinks?.enwiki?.title

  return (
    (zhTitle ? await fetchWikipediaSummary(zhTitle, 'zh') : '') ||
    (enTitle ? await fetchWikipediaSummary(enTitle, 'en') : '') ||
    ''
  )
}

function buildFallbackDescription({
  query,
  displayName,
  category,
  className,
  typeName,
  openingHours,
}: {
  query: string
  displayName?: string
  category?: string
  className?: string
  typeName?: string
  openingHours?: string
}) {
  const categoryLabel = category === 'food' ? '????' : '??'
  const sourceLabel = [className, typeName].filter(Boolean).join(' / ')
  const locationPart = displayName ? `${query}??${displayName}?` : `${query}???${categoryLabel}?`
  const sourcePart = sourceLabel ? `????????? ${sourceLabel}?` : ''
  const hoursPart = openingHours ? `?????????????${openingHours}?` : ''

  return cleanSummaryText(`${locationPart}${sourcePart}${hoursPart}`.trim())
}

export async function POST(request: Request) {
  const adminCheck = await requireAdminRequest(request)
  if (!adminCheck.ok) return adminCheck.response
  try {
    const body = (await request.json()) as EnrichmentBody
    const query = String(body.query || '').trim()
    const category = String(body.category || '').trim()

    if (!query) {
      return NextResponse.json({ error: 'Missing place query.' }, { status: 400 })
    }

    const nominatimUrl = new URL('https://nominatim.openstreetmap.org/search')
    nominatimUrl.searchParams.set('format', 'jsonv2')
    nominatimUrl.searchParams.set('limit', '1')
    nominatimUrl.searchParams.set('addressdetails', '1')
    nominatimUrl.searchParams.set('extratags', '1')
    nominatimUrl.searchParams.set('namedetails', '1')
    nominatimUrl.searchParams.set('q', query)

    const nominatimResponse = await fetch(nominatimUrl, {
      headers: {
        'user-agent': 'JnQJourney/1.0 (admin place enrichment)',
      },
      cache: 'no-store',
    })

    if (!nominatimResponse.ok) {
      throw new Error(`Nominatim request failed: HTTP ${nominatimResponse.status}`)
    }

    const nominatimResults = (await nominatimResponse.json()) as Array<Record<string, any>>
    const primaryResult = nominatimResults[0]

    if (!primaryResult) {
      return NextResponse.json({ error: 'No matching place found.' }, { status: 404 })
    }

    const osmElementType = mapOsmType(primaryResult.osm_type)
    let osmTags: Record<string, string> = {}

    if (osmElementType && primaryResult.osm_id) {
      const overpassQuery = `[out:json][timeout:25];${osmElementType}(${primaryResult.osm_id});out tags center;`
      const overpassResponse = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: {
          'content-type': 'text/plain;charset=UTF-8',
          'user-agent': 'JnQJourney/1.0 (admin place enrichment)',
        },
        body: overpassQuery,
        cache: 'no-store',
      })

      if (overpassResponse.ok) {
        const overpassPayload = (await overpassResponse.json()) as { elements?: Array<{ tags?: Record<string, string> }> }
        osmTags = overpassPayload.elements?.[0]?.tags || {}
      }
    }

    const openingHours = osmTags.opening_hours || primaryResult.extratags?.opening_hours || ''
    const suggestedTags = deriveTags({
      query,
      category,
      className: primaryResult.class,
      typeName: primaryResult.type,
      rawTags: osmTags,
    })
    const suggestedDescription =
      (await fetchSummaryFromWikipediaTag(osmTags.wikipedia || primaryResult.extratags?.wikipedia)) ||
      (await fetchSummaryFromWikidataId(osmTags.wikidata || primaryResult.extratags?.wikidata)) ||
      buildFallbackDescription({
        query,
        displayName: primaryResult.display_name || '',
        category,
        className: primaryResult.class,
        typeName: primaryResult.type,
        openingHours,
      })

    return NextResponse.json({
      latitude: primaryResult.lat || '',
      longitude: primaryResult.lon || '',
      displayName: primaryResult.display_name || '',
      openingHours,
      suggestedTags,
      suggestedDescription,
      source: {
        className: primaryResult.class || '',
        typeName: primaryResult.type || '',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to enrich place details.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}




