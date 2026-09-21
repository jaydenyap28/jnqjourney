import { spotTranslationFields, type SpotTranslationField } from './spot-localization-authoring.ts'
import { spotContentEnglishFields, type SpotContentEnglishField, type SpotContentChineseSource } from './spot-content.ts'

export const spotTranslationFieldLimit = 30000
export type SpotTranslationSourceFields = Record<SpotTranslationField, string>
export type SpotEnglishGeneration = Record<SpotTranslationField, string>

export const spotEnglishGenerationSchema = {
  type: 'object',
  additionalProperties: false,
  required: [...spotTranslationFields],
  properties: Object.fromEntries(spotTranslationFields.map((key) => [key, { type: 'string' }])),
} as const

export function assertCurrentSpotGenerationRequest(body: unknown, revision: string, source: SpotTranslationSourceFields) {
  if (!body || typeof body !== 'object') throw new Error('Invalid generation request')
  const request = body as { revision?: unknown; source?: unknown }
  if (request.revision !== revision) throw new Error('Revision conflict. Reload before generating.')
  if (!request.source || typeof request.source !== 'object') throw new Error('Source conflict. Reload before generating.')
  const requestedSource = request.source as Record<string, unknown>
  for (const key of spotTranslationFields) {
    if (requestedSource[key] !== source[key]) throw new Error('Source conflict. Reload before generating.')
  }
}

export function parseSpotEnglishGeneration(value: unknown, source: SpotTranslationSourceFields): SpotEnglishGeneration {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('AI returned an invalid translation result.')
  const output = value as Record<string, unknown>
  const keys = Object.keys(output).sort()
  if (keys.length !== spotTranslationFields.length || keys.some((key, index) => key !== [...spotTranslationFields].sort()[index])) {
    throw new Error('AI returned an invalid translation result.')
  }
  const result = {} as SpotEnglishGeneration
  for (const key of spotTranslationFields) {
    const text = output[key]
    if (typeof text !== 'string' || text.length > spotTranslationFieldLimit) throw new Error('AI returned an invalid translation result.')
    if (!source[key] && text) throw new Error(`AI returned content for an empty ${key} source.`)
    result[key] = text
  }
  return result
}

export function extractResponsesApiJson(response: unknown) {
  if (!response || typeof response !== 'object') throw new Error('AI returned an invalid response.')
  const outputText = (response as { output_text?: unknown }).output_text
  if (typeof outputText !== 'string') throw new Error('AI returned an invalid response.')
  try {
    return JSON.parse(outputText) as unknown
  } catch {
    throw new Error('AI returned malformed JSON.')
  }
}

export const spotContentEnglishGenerationSchema = {
  type: 'object',
  additionalProperties: false,
  required: [...spotContentEnglishFields],
  properties: Object.fromEntries(spotContentEnglishFields.map((key) => [key, { type: 'string' }])),
} as const

export type SpotContentEnglishGeneration = Record<SpotContentEnglishField, string>

export function assertCurrentSpotContentGenerationSource(body: unknown, source: SpotContentChineseSource) {
  if (!body || typeof body !== 'object') throw new Error('Invalid generation request')
  const requestedSource = (body as { source?: unknown }).source
  if (!requestedSource || typeof requestedSource !== 'object') throw new Error('Source conflict. Reload before generating.')
  for (const key of Object.keys(source) as Array<keyof SpotContentChineseSource>) {
    if ((requestedSource as Record<string, unknown>)[key] !== source[key]) throw new Error('Source conflict. Reload before generating.')
  }
}

export function parseSpotContentEnglishGeneration(value: unknown, source: SpotContentChineseSource): SpotContentEnglishGeneration {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('AI returned an invalid translation result.')
  const output = value as Record<string, unknown>
  const keys = Object.keys(output).sort()
  if (keys.length !== spotContentEnglishFields.length || keys.some((key, index) => key !== [...spotContentEnglishFields].sort()[index])) throw new Error('AI returned an invalid translation result.')
  const sourceForField: Record<SpotContentEnglishField, string> = {
    experience_en: source.experience_zh,
    seo_title_en: source.seo_title_zh,
    seo_description_en: source.seo_description_zh,
  }
  const result = {} as SpotContentEnglishGeneration
  for (const key of spotContentEnglishFields) {
    const text = output[key]
    if (typeof text !== 'string' || text.length > spotTranslationFieldLimit) throw new Error('AI returned an invalid translation result.')
    if (!sourceForField[key] && text) throw new Error(`AI returned content for an empty ${key} source.`)
    result[key] = text
  }
  return result
}
