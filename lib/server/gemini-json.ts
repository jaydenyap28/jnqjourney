const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite'
const FREE_TIER_FALLBACK_MODELS = ['gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'] as const

function toGeminiResponseSchema(schema: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(schema, (key, value) =>
      key === 'additionalProperties' || key === '$schema' ? undefined : value
    )
  ) as Record<string, unknown>
}

function isRetryableModelFailure(status: number, detail: string) {
  return (
    status === 404 ||
    status === 429 ||
    status === 503 ||
    /RESOURCE_EXHAUSTED|quota|rate.?limit|model.*not found|not supported/i.test(detail)
  )
}

export async function generateGeminiJson<T = unknown>({
  instructions,
  input,
  schema,
  temperature = 0.2,
  model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
}: {
  instructions: string
  input: string
  schema: Record<string, unknown>
  temperature?: number
  model?: string
}): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.')

  const models = Array.from(new Set([
    model,
    ...(process.env.GEMINI_FALLBACK_MODEL ? [process.env.GEMINI_FALLBACK_MODEL] : []),
    ...FREE_TIER_FALLBACK_MODELS,
  ].filter(Boolean)))

  let lastError = 'Gemini request failed.'

  for (const candidateModel of models) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(candidateModel)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: instructions }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: input }],
            },
          ],
          generationConfig: {
            temperature,
            responseMimeType: 'application/json',
            responseSchema: toGeminiResponseSchema(schema),
          },
        }),
      }
    )

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      lastError = `Gemini request failed (${response.status}) on ${candidateModel}${detail ? `: ${detail.slice(0, 300)}` : ''}`
      if (isRetryableModelFailure(response.status, detail) && candidateModel !== models.at(-1)) continue
      throw new Error(lastError)
    }

    const payload = (await response.json()) as any
    const text = Array.isArray(payload?.candidates?.[0]?.content?.parts)
      ? payload.candidates[0].content.parts
          .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
          .join('')
          .trim()
      : ''

    if (!text) {
      const reason = payload?.candidates?.[0]?.finishReason || payload?.promptFeedback?.blockReason || 'empty response'
      lastError = `Gemini returned no JSON content from ${candidateModel} (${reason}).`
      if (candidateModel !== models.at(-1)) continue
      throw new Error(lastError)
    }

    try {
      return JSON.parse(text) as T
    } catch {
      lastError = `Gemini returned invalid JSON from ${candidateModel}.`
      if (candidateModel !== models.at(-1)) continue
      throw new Error(lastError)
    }
  }

  throw new Error(lastError)
}

export const defaultGeminiModel = DEFAULT_GEMINI_MODEL
