import OpenAI from 'openai'
import { eq } from 'drizzle-orm'
import { db } from '../database'
import { user } from '../database/schema'
import { decryptSecret } from './crypto'

export async function validateOpenAiKey(apiKey: string): Promise<void> {
  const client = new OpenAI({ apiKey })
  try {
    await client.models.list()
  } catch (err: any) {
    if (err instanceof OpenAI.AuthenticationError) {
      throw createError({
        statusCode: 400,
        statusMessage: `Invalid OpenAI API key: ${err.message}`,
      })
    }
    throw err
  }
}

// Short-lived cache so per-sentence TTS calls don't hit the DB and decrypt every time
const KEY_CACHE_TTL_MS = 5 * 60 * 1000
const keyCache = new Map<string, { key: string | null; expiresAt: number }>()

export function clearOpenAiKeyCache(userId: string): void {
  keyCache.delete(userId)
}

async function loadUserKey(userId: string): Promise<string | null> {
  const cached = keyCache.get(userId)
  if (cached && cached.expiresAt > Date.now()) return cached.key

  const [row] = await db
    .select({ openaiApiKey: user.openaiApiKey })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)

  const key = row?.openaiApiKey ? decryptSecret(row.openaiApiKey) : null
  keyCache.set(userId, { key, expiresAt: Date.now() + KEY_CACHE_TTL_MS })
  return key
}

export async function getOpenAiKeyForUser(userId: string): Promise<string> {
  if (userId) {
    const userKey = await loadUserKey(userId)
    if (userKey) {
      return userKey
    }
  }

  // Fallback to server environment key
  const serverKey = process.env.OPENAI_API_KEY || ''
  if (serverKey) {
    return serverKey
  }

  throw createError({
    statusCode: 400,
    statusMessage: 'No OpenAI API key found. Please add your API key in Settings.',
  })
}
