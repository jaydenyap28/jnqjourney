import type { NextApiRequest, NextApiResponse } from 'next'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { requireAdminRequest } from '@/lib/server/admin-auth'
import { createLocalizationIO, readAuthoritativeLocalization, saveAndPublishLocalization } from '@/lib/server/localization-publisher.mjs'
import { editSpotTranslation, spotTranslationFields } from '@/lib/spot-localization-authoring'
import { applyLocalization, localizationRecord, type LocalizationSnapshot } from '@/lib/localization'
import { buildCanonicalLocationPath } from '@/lib/server/location-slugs-store'

export const config = { api: { bodyParser: { sizeLimit: '128kb' } } }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control','private, no-store, max-age=0')
  res.setHeader('X-Robots-Tag','noindex, nofollow')
  const auth = await requireAdminRequest(new Request('http://localhost/api/admin/spot-localization', {headers:{authorization:req.headers.authorization || ''}}))
  if (!auth.ok) return res.status(auth.response.status).json(await auth.response.json())
  if (!['GET','PUT'].includes(req.method || '')) return res.status(405).end()
  const id = Number(req.query.id)
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({error:'Invalid Spot ID'})
  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
    // Read only: canonical writes remain exclusively in the original Chinese form.
    const {data:row,error} = await db.from('locations').select('*').eq('id',id).single()
    if (error || !row) return res.status(404).json({error:'Spot not found'})
    const spot = {...row, id, name:String(row.name || ''), title:String(row.name || ''), description:String(row.description || '').trim() || null, review:String(row.review || '').trim() || null, address:String(row.address || '').trim() || null}
    const canonicalPath = await buildCanonicalLocationPath(row.name,id)
    const io = createLocalizationIO()
    const current = req.method === 'PUT'
      ? await saveAndPublishLocalization(io, req.body?.revision, (snapshot:LocalizationSnapshot) => editSpotTranslation(snapshot,spot,canonicalPath,req.body?.fields,req.body?.translationStatus,`admin-${randomUUID()}`))
      : await readAuthoritativeLocalization(io)
    const record = localizationRecord(current.snapshot as LocalizationSnapshot,'spot',id)
    let revalidated = false
    if (req.method === 'PUT') {
      // Pages ISR refresh uses a fresh CDN read; regular public reads retain their caches.
      try { await res.revalidate(`/en${canonicalPath}`); revalidated = true } catch { /* Publishing succeeded; distinguish page refresh failure. */ }
    }
    return res.json({revision:current.revision,record,source:Object.fromEntries(spotTranslationFields.map(key=>[key,String(spot[key] ?? '')])),status:applyLocalization(spot,record).status,canonicalPath,published:req.method==='PUT',revalidated})
  } catch (error) {
    return res.status(409).json({error:error instanceof Error?error.message:'Localization operation failed'})
  }
}
