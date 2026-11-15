import type { H3Event } from 'h3'
import { getOpenAiKeyForUser } from './aiKeys'

const MAX_TTS_CHARS = 4000

/**
 * Proxies OpenAI text-to-speech and streams the MP3 back to the client as it arrives.
 */
export async function streamSpeech(
  event: H3Event,
  userId: string,
  rawText: unknown,
  rawVoice?: unknown
) {
  const text = typeof rawText === 'string' ? rawText.trim() : ''
  if (!text) {
    throw createError({ statusCode: 400, statusMessage: 'Text content is required' })
  }

  const config = useRuntimeConfig()
  const apiKey = await getOpenAiKeyForUser(userId)
  const voice =
    typeof rawVoice === 'string' && rawVoice ? rawVoice : (config.openaiVoice as string) || 'marin'
  const model = (config.openaiTtsModel as string) || 'gpt-4o-mini-tts'
  // Only the gpt-*-tts models accept speaking instructions
  const instructions = model.startsWith('gpt-') ? (config.openaiTtsInstructions as string) : ''

  try {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        voice,
        input: text.slice(0, MAX_TTS_CHARS),
        response_format: 'mp3',
        ...(instructions ? { instructions } : {}),
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('TTS API error:', res.status, errText)
      throw createError({
        statusCode: res.status,
        statusMessage: `TTS error: ${errText}`,
      })
    }

    setHeader(event, 'content-type', 'audio/mpeg')
    setHeader(event, 'cache-control', 'no-store')

    if (res.body) {
      return sendStream(event, res.body)
    }

    return Buffer.from(await res.arrayBuffer())
  } catch (err: any) {
    console.error('Speech synthesis error:', err)
    throw createError({
      statusCode: err?.statusCode || 500,
      statusMessage: err?.statusMessage || err?.message || 'Failed to synthesize speech',
    })
  }
}
