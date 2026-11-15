import { getCurrentUserId } from '../../utils/currentUser'
import { streamSpeech } from '../../utils/tts'

export default defineEventHandler(async (event) => {
  const userId = await getCurrentUserId(event)
  const body = await readBody<{ text?: unknown; voice?: unknown }>(event)
  return streamSpeech(event, userId, body?.text, body?.voice)
})
