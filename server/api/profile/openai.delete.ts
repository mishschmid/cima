import { eq } from 'drizzle-orm'
import { db } from '../../database'
import { user } from '../../database/schema'
import { requireUser } from '../../utils/session'
import { clearOpenAiKeyCache } from '../../utils/aiKeys'

export default defineEventHandler(async (event) => {
  const authUser = await requireUser(event)
  await db
    .update(user)
    .set({
      openaiApiKey: null,
      updatedAt: new Date(),
    })
    .where(eq(user.id, authUser.id))
  clearOpenAiKeyCache(authUser.id)

  return { hasKey: false, maskedKey: null }
})
