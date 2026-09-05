import { createHash } from 'node:crypto'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { revalidatePath, revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'

import { PRIVATE_NO_STORE } from '@/lib/public-data'
import { verifySpotRevalidation } from '@/lib/spot-media-revalidation'

export const runtime = 'nodejs'
const HEADERS = { 'Cache-Control': PRIVATE_NO_STORE }

// Maintenance-only, signed with the existing R2 credential. This endpoint cannot
// upload or rebuild data and never calls Supabase. The exact published hash is required.
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
    const object = await client.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: `public-data/spots/${payload.slug}.json` }), { abortSignal: AbortSignal.timeout(10000) })
    const bytes = Buffer.from(await object.Body!.transformToByteArray())
    const snapshot = JSON.parse(bytes.toString())
    if (createHash('sha256').update(bytes).digest('hex') !== payload.sha256 || snapshot.spot?.id !== Number(params.id) || snapshot.spot?.slug !== payload.slug) throw new Error('Published snapshot mismatch')
    revalidateTag(`public-spot:${payload.slug}`)
    revalidatePath(`/spot/${payload.slug}`)
    revalidatePath(`/api/spots/${payload.slug}`)
    return NextResponse.json({ ok: true, slug: payload.slug, sha256: payload.sha256 }, { headers: HEADERS })
  } catch {
    return NextResponse.json({ ok: false, error: 'Published snapshot could not be verified; cache unchanged.' }, { status: 409, headers: HEADERS })
  }
}
