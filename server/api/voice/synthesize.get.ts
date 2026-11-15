import { getCurrentUserId } from '../../utils/currentUser'
import { streamSpeech } from '../../utils/tts'

// GET variant so an <audio> element can stream and start playing before the download finishes
export default defineEventHandler(async (event) => {
  const userId = await getCurrentUserId(event)
  const query = getQuery(event)
  return streamSpeech(event, userId, query.text, query.voice)
})
