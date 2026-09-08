import { createHash } from 'node:crypto'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { verifySpotRevalidation } from '@/lib/spot-media-revalidation'
import { PRIVATE_NO_STORE } from '@/lib/public-data'

export const runtime = 'nodejs'

// Uses the existing maintenance signature protocol and verifies the exact R2
// collection before invalidating. No content writes or arbitrary paths accepted.
export async function POST(request: Request, { params }: { params: { slug: string } }) {
  let payload: ReturnType<typeof verifySpotRevalidation>
  try {
    const body = await request.text()
    if (body.length > 2048) throw Error('Oversized body')
    payload = verifySpotRevalidation(body, request.headers.get('x-jnq-maintenance-signature') || '', process.env.R2_SECRET_ACCESS_KEY || '')
    if (payload.slug !== params.slug || payload.slug.length > 150) throw Error('Guide mismatch')
  } catch {
    return NextResponse.json({ ok: false }, { status: 403, headers: { 'Cache-Control': PRIVATE_NO_STORE } })
  }
  try {
    const client = new S3Client({ region: 'auto', maxAttempts: 1, endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! } })
    const result = await client.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: 'public-data/guides.json' }), { abortSignal: AbortSignal.timeout(10000) })
    const bytes = Buffer.from(await result.Body!.transformToByteArray())
    const snapshot = JSON.parse(bytes.toString())
    if (createHash('sha256').update(bytes).digest('hex') !== payload.sha256 || snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.guides) || snapshot.guides.filter((g: any) => g.slug === payload.slug).length !== 1) throw Error('Snapshot mismatch')
    // The collection tags are required when adding a new Guide and new entities.
    for (const tag of ['guides', `guide:${payload.slug}`, 'public-data', 'public-locations', 'public-regions', 'public-spots']) revalidateTag(tag)
    for (const path of ['/guide', `/guide/${payload.slug}`, '/api/guides', '/api/locations', '/api/regions', '/sitemap.xml']) revalidatePath(path)
    return NextResponse.json({ ok: true, slug: payload.slug, sha256: payload.sha256 }, { headers: { 'Cache-Control': PRIVATE_NO_STORE } })
  } catch {
    return NextResponse.json({ ok: false, error: 'Published Guide snapshot could not be verified.' }, { status: 409, headers: { 'Cache-Control': PRIVATE_NO_STORE } })
  }
}
