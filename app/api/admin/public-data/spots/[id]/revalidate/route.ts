import { createHash } from 'node:crypto'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { revalidatePath, revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'

import { PRIVATE_NO_STORE } from '@/lib/public-data'
import { createClient } from '@supabase/supabase-js'
import { confirmedSpotAliases, planSpotInvalidation, resolveSpotSnapshotSlug, verifySpotRevalidation } from '@/lib/spot-media-revalidation'

export const runtime = 'nodejs'
const HEADERS = { 'Cache-Control': PRIVATE_NO_STORE }

// Maintenance-only, signed with the existing R2 credential. This endpoint cannot
// upload or rebuild data. Supabase Storage is read only for the canonical alias
// map used by the public page. The exact published snapshot hash is required.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  let payload: ReturnType<typeof verifySpotRevalidation>
  try {
    const body = await request.text()
    if (body.length > 2048) throw new Error('Oversized request')
    payload = verifySpotRevalidation(body, request.headers.get('x-jnq-maintenance-signature') || '', process.env.R2_SECRET_ACCESS_KEY || '')
    if (!/^[1-9]\d*$/.test(params.id) || !payload.slug.endsWith(`-${params.id}`)) throw new Error('Spot identity mismatch')
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid maintenance request.' }, { status: 403, headers: HEADERS })
  }
  try {
    const client = new S3Client({ region: 'auto', maxAttempts: 1, endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! } })
    const indexObject = await client.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: 'public-data/spots/index.json' }), { abortSignal: AbortSignal.timeout(10000) })
    const index = JSON.parse(await indexObject.Body!.transformToString())
    const snapshotSlug = resolveSpotSnapshotSlug(Number(params.id), index)
    const object = await client.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: `public-data/spots/${snapshotSlug}.json` }), { abortSignal: AbortSignal.timeout(10000) })
    const bytes = Buffer.from(await object.Body!.transformToByteArray())
    const snapshot = JSON.parse(bytes.toString())
    if (createHash('sha256').update(bytes).digest('hex') !== payload.sha256) throw new Error('Published snapshot mismatch')
    const storage = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
        url.searchParams.set('cacheNonce', String(Date.now()))
        return fetch(url, init)
      } },
    }).storage
    const bucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'location-images'
    let aliasMap: Record<string, string> | undefined
    for (const key of ['_system/location-slugs.webp', '_system/location-slugs.json']) {
      const result = await storage.from(bucket).download(key)
      if (result.error) {
        if ('statusCode' in result.error && String(result.error.statusCode) === '404') continue
        throw new Error('Authoritative alias map unavailable')
      }
      aliasMap = JSON.parse(await result.data.text())
      break
    }
    if (!aliasMap) throw new Error('Authoritative alias map missing')
    const plan = planSpotInvalidation(Number(params.id), payload.slug, snapshotSlug, snapshot, confirmedSpotAliases(aliasMap, snapshot.spot))
    // No global public-spots tag. Existing per-slug tags are the complete
    // targeted identity set; ID slug is also the shared snapshot fetch tag.
    for (const tag of plan.tags) revalidateTag(tag)
    for (const publicPath of plan.paths) revalidatePath(publicPath)
    return NextResponse.json({ ok: true, slug: payload.slug, sha256: payload.sha256, ...plan }, { headers: HEADERS })
  } catch {
    return NextResponse.json({ ok: false, error: 'Published snapshot could not be verified; cache unchanged.' }, { status: 409, headers: HEADERS })
  }
}
