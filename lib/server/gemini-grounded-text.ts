export async function generateGeminiGroundedText({
  instructions,
  input,
  temperature = 0.15,
  models = [
    process.env.GEMINI_GROUNDED_MODEL || 'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
  ],
}: {
  instructions: string
  input: string
  temperature?: number
  models?: string[]
}): Promise<{ text: string; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.')

  const uniqueModels = Array.from(new Set(models.filter(Boolean)))
  let lastError = ''

  for (const model of uniqueModels) {
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
          tools: [{ google_search: {} }],
          generationConfig: {
            temperature,
          },
        }),
      }
    )

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      lastError = `Gemini grounded request failed (${response.status})${detail ? `: ${detail.slice(0, 400)}` : ''}`
      if ([400, 403, 404, 429].includes(response.status)) continue
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
      lastError = `Gemini grounded response was empty (${reason}).`
      continue
    }

    return { text, model }
  }

  throw new Error(lastError || 'Gemini grounded generation failed.')
}
