import type { Locale } from './locale.ts'

export type TranslationStatus = 'missing' | 'partial' | 'complete'
export type EntityType = 'page' | 'region' | 'guide' | 'spot'
export interface LocalizationRecord {
  entityType: EntityType
  entityId: string
  locale: 'en'
  canonicalPath: string
  translationStatus: TranslationStatus
  source: { url: string; capturedAt: string }
  fields: Record<string, { source: string; text: string }>
}
export interface LocalizationSnapshot { schemaVersion: 1; locale: 'en'; version: string; records: LocalizationRecord[] }

// Leaf-only text overlay. Identity, binding, money, coordinates, order and media are never writable.
const textKeys = new Set(['title', 'shortTitle', 'tagline', 'summary', 'shortSummary', 'description', 'review', 'duration', 'travelStyle',
  'name', 'displayName', 'guideSummary', 'routeNote', 'tips', 'note', 'stayNote', 'accommodationNote', 'transport', 'reminder', 'city', 'label', 'dayLabel', 'alt', 'caption', 'address', 'opening_hours'])
const textArrays = new Set(['highlightTags', 'heroBullets', 'highlights', 'bestFor', 'notes', 'practicalTips', 'actualExperiences', 'pendingItems'])
export function isLocalizedTextPath(path: string) {
  const parts = path.split('.')
  if (parts.some(p => ['__proto__', 'prototype', 'constructor'].includes(p))) return false
  // Related entity records have their own overlays; they are not this page's body.
  if (parts[0] === 'regions') return false
  // Canonical entity names must go through the shared name resolver; route names are presentation only.
  if (path === 'name' || path === 'displayName') return false
  return textKeys.has(parts.at(-1)!) || (textArrays.has(parts.at(-2)!) && /^\d+$/.test(parts.at(-1)!))
}
export function applyLocalization<T>(source: T, record: LocalizationRecord | undefined, locale: Locale = 'en'): { value: T; status: TranslationStatus } {
  if (locale === 'zh') return { value: source, status: 'complete' }
  if (!record || record.locale !== locale) return { value: source, status: 'missing' }
  const value = structuredClone(source)
  let stale = false
  for (const [path, field] of Object.entries(record.fields)) {
    if (!isLocalizedTextPath(path)) { stale = true; continue }
    const parts = path.split('.')
    let parent: any = value
    for (const key of parts.slice(0, -1)) parent = parent?.[key]
    const key = parts.at(-1)!
    const sourceValue = parent?.[key] ?? (['description', 'review', 'address'].includes(path) ? '' : undefined)
    if (!parent || sourceValue !== field.source || typeof field.text !== 'string') { stale = true; continue }
    if (path === 'opening_hours') {
      try {
        const original = JSON.parse(field.source), translated = JSON.parse(field.text)
        delete original.remarks; delete translated.remarks
        if (JSON.stringify(original) !== JSON.stringify(translated)) { stale = true; continue }
      } catch {
        // Unstructured opening-hours text can be faithfully localized as text.
        if (field.source.trim().startsWith('{')) { stale = true; continue }
      }
    }
    parent[key] = field.text
  }
  // Newly added Chinese body fields also make a formerly complete translation partial.
  function inspect(node: unknown, path = '') {
    if (typeof node === 'string' && isLocalizedTextPath(path) && /\p{Script=Han}/u.test(node)) stale = true
    else if (Array.isArray(node)) node.forEach((child,index)=>inspect(child,`${path}.${index}`))
    else if (node && typeof node === 'object') Object.entries(node).forEach(([key,child])=>inspect(child,path?`${path}.${key}`:key))
  }
  inspect(value)
  return { value, status: stale ? 'partial' : record.translationStatus }
}

export function localizationRecord(snapshot: LocalizationSnapshot, type: EntityType, id: string | number) {
  return snapshot.records.find(r => r.entityType === type && r.entityId === String(id))
}
