import { applyLocalization, localizationRecord, type LocalizationSnapshot, type TranslationStatus } from './localization.ts'

export const spotTranslationFields = ['description', 'review', 'address'] as const
export type SpotTranslationField = typeof spotTranslationFields[number]
export type SpotTranslationSource = { id: number; name: string; [key: string]: unknown }
export type SpotTranslationEdits = Record<SpotTranslationField, { source: string; text: string }>

export function editSpotTranslation(snapshot: LocalizationSnapshot, spot: SpotTranslationSource, canonicalPath: string,
  edits: SpotTranslationEdits, requestedStatus: TranslationStatus, version: string) {
  if (!['missing', 'partial', 'complete'].includes(requestedStatus)) throw new Error('Invalid translation status')
  if (!edits || Object.keys(edits).some(key => !spotTranslationFields.includes(key as SpotTranslationField))) throw new Error('Only description, review and address can be edited')
  const previous = localizationRecord(snapshot, 'spot', spot.id)
  const record = structuredClone(previous || {
    entityType: 'spot' as const, entityId: String(spot.id), locale: 'en' as const, canonicalPath,
    translationStatus: 'missing' as TranslationStatus, source: { url: canonicalPath, capturedAt: new Date().toISOString() }, fields: {},
  })
  for (const key of spotTranslationFields) {
    const field = edits[key]
    if (!field || typeof field.text !== 'string' || typeof field.source !== 'string' || field.text.length > 30000) throw new Error(`Invalid ${key}`)
    const old = previous?.fields[key]
    const changed = field.text !== (old?.text || '') || field.source !== (old?.source || '')
    if (field.text && changed && field.source !== String(spot[key] ?? '')) throw new Error(`Source changed: ${key}. Reload before saving.`)
    if (field.text.trim()) record.fields[key] = { ...field }
    else delete record.fields[key]
  }
  record.canonicalPath = canonicalPath
  record.translationStatus = Object.keys(record.fields).length ? requestedStatus : 'missing'
  if (Object.keys(record.fields).length) record.translationStatus = applyLocalization(spot, record).status
  const next = structuredClone(snapshot)
  next.version = version
  const index = next.records.findIndex(r => r.entityType === 'spot' && r.entityId === String(spot.id) && r.locale === 'en')
  if (index < 0) next.records.push(record)
  else next.records[index] = record
  return next
}
