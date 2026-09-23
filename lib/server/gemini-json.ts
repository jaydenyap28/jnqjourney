const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite'

function toGeminiResponseSchema(schema: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(schema, (key, value) =>
      key === 'additionalProperties' || key === '$schema' ? undefined : value
    )
  ) as Record<string, unknown>
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

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
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
    throw new Error(
      `Gemini request failed (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`
    )
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
    throw new Error(`Gemini returned no JSON content (${reason}).`)
  }

  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error('Gemini returned invalid JSON.')
  }
}

export const defaultGeminiModel = DEFAULT_GEMINI_MODEL
