import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { revalidatePath, revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { PRIVATE_NO_STORE, type PublicRegionsPayload } from '@/lib/public-data'
import { requireAdminRequest } from '@/lib/server/admin-auth'
import { uploadPublicDataSnapshot } from '@/lib/server/r2'

export const runtime = 'nodejs'
const HEADERS = { 'Cache-Control': PRIVATE_NO_STORE }
const REGION_SELECT = 'id,name,name_cn,country,image_url,code,parent_id,description'

function displayName(name: unknown, nameCn: unknown) {
  const english = String(name || '').trim()
  const chinese = String(nameCn || '').trim()
  return chinese && english && chinese !== english ? `${chinese} / ${english}` : chinese || english
}

function slugify(value: unknown, id: number) {
  const base = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'region'
  return `${base}-${id}`
}

function summary(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 180) || null
}

function r2Client() {
  const required = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'] as const
  const missing = required.filter((name) => !process.env[name])
  if (missing.length) throw new Error(`Missing Cloudflare R2 environment variables: ${missing.join(', ')}`)
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
  })
}

async function readPublishedRegions() {
  const object = await r2Client().send(new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: 'public-data/regions.json',
  }))
  const payload = JSON.parse(await object.Body!.transformToString()) as PublicRegionsPayload
  if (payload.schemaVersion !== 1 || !Array.isArray(payload.regions)) throw new Error('Published Region snapshot is invalid.')
  return payload
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const adminCheck = await requireAdminRequest(request)
  if (!adminCheck.ok) return adminCheck.response
  const id = Number(params.id)
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: 'Invalid Region id.' }, { status: 400, headers: HEADERS })

  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: row, error } = await supabase.from('regions').select(REGION_SELECT).eq('id', id).maybeSingle()
    if (error || !row) throw new Error('Authoritative Region could not be read after save.')

    const snapshot = await readPublishedRegions()
    const index = snapshot.regions.findIndex((region) => region.id === id)
    if (index < 0) throw new Error('Published Region snapshot is missing the saved Region.')
    const region = {
      id,
      slug: slugify(row.name, id),
      name: displayName(row.name, row.name_cn),
      country: row.country || null,
      thumbnail: String(row.image_url || '').trim() || null,
      shortSummary: summary(row.description),
      parentId: row.parent_id == null ? null : Number(row.parent_id),
      code: row.code || null,
    }
    snapshot.regions[index] = region
    const generatedAt = new Date().toISOString()
    const regionsUrl = await uploadPublicDataSnapshot('regions.json', Buffer.from(`${JSON.stringify({
      ...snapshot,
      source: { type: 'supabase-admin-region-refresh', generatedAt },
    })}\n`))

    revalidateTag('public-data')
    revalidateTag('public-regions')
    revalidateTag('regions')
    revalidatePath('/')
    revalidatePath('/api/regions')
    revalidatePath('/region')
    revalidatePath(`/region/${region.slug}`)
    return NextResponse.json({ ok: true, generatedAt, region, regionsUrl }, { headers: HEADERS })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Region was saved but its public snapshot could not be refreshed.' }, { status: 503, headers: HEADERS })
  }
}
