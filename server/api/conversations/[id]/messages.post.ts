import { and, desc, eq } from 'drizzle-orm'
import { db } from '../../../database'
import { conversations, messages } from '../../../database/schema'
import { getCurrentUserId } from '../../../utils/currentUser'
import { buildSystemPrompt } from '../../../utils/chat/prompt'
import { getLlm, type ChatMessage } from '../../../utils/llm'
import { calculateCost } from '../../../utils/llm/pricing'
import { searchRelevantFacts } from '../../../utils/memory/search'
import { extractFacts } from '../../../utils/memory/extract'

// Earlier messages sent to the model; a shorter history gets a faster first token
const HISTORY_LIMIT = 12

export default defineEventHandler(async (event) => {
  const requestStart = performance.now()
  const elapsed = () => Math.round(performance.now() - requestStart)
  const userId = await getCurrentUserId(event)
  const conversationId = getRouterParam(event, 'id')

  if (!conversationId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing conversation id' })
  }

  const body = await readBody<{ content?: unknown }>(event)
  const content = typeof body?.content === 'string' ? body.content.trim() : ''

  if (!content) {
    throw createError({ statusCode: 400, statusMessage: 'Message content cannot be empty' })
  }

  if (content.length > 8000) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Message exceeds maximum length of 8000 characters',
    })
  }

  // Independent lookups run in parallel. History is read before the new message is
  // inserted and the message is appended in memory, so it can't appear twice.
  const [[conversation], facts, history, llm] = await Promise.all([
    db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
      .limit(1),
    searchRelevantFacts(userId, content, 8),
    db
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId), eq(messages.userId, userId)))
      .orderBy(desc(messages.createdAt))
      .limit(HISTORY_LIMIT),
    getLlm('chat', userId),
  ])

  if (!conversation) {
    throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
  }

  await db.insert(messages).values({
    userId,
    conversationId,
    role: 'user',
    content,
  })

  const recentMessages = [
    ...history.reverse().map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    })),
    { role: 'user' as const, content },
  ]

  const systemPrompt = buildSystemPrompt(facts)
  const chatMessages: ChatMessage[] = [{ role: 'system', content: systemPrompt }, ...recentMessages]

  let recordedUsage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
    costUsd: number
    model: string
  } | null = null

  const prepMs = elapsed()
  const stream = llm.streamChat(chatMessages, {
    onUsage(u) {
      const cost = calculateCost(u.model, u.promptTokens, u.completionTokens)
      recordedUsage = {
        promptTokens: u.promptTokens,
        completionTokens: u.completionTokens,
        totalTokens: u.totalTokens,
        costUsd: cost,
        model: u.model,
      }
    },
  })

  // Set response headers for direct streaming
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setHeader(event, 'cache-control', 'no-cache, no-transform')

  const encoder = new TextEncoder()
  let fullAssistantReply = ''

  const readable = new ReadableStream({
    async start(controller) {
      try {
        let firstTokenMs: number | null = null
        for await (const chunk of stream) {
          if (firstTokenMs === null) firstTokenMs = elapsed()
          fullAssistantReply += chunk
          controller.enqueue(encoder.encode(chunk))
        }
        controller.close()

        if (import.meta.dev) {
          console.info(
            `[latency] chat prep ${prepMs}ms, first token ${firstTokenMs ?? '-'}ms, done ${elapsed()}ms`
          )
        }

        // Background persistence after stream completes
        try {
          await db.insert(messages).values({
            userId,
            conversationId,
            role: 'assistant',
            content: fullAssistantReply,
            model: recordedUsage?.model ?? llm.name,
            promptTokens: recordedUsage?.promptTokens ?? null,
            completionTokens: recordedUsage?.completionTokens ?? null,
            totalTokens: recordedUsage?.totalTokens ?? null,
            costUsd: recordedUsage ? String(recordedUsage.costUsd) : null,
          })

          const updateValues: { updatedAt: Date; title?: string } = {
            updatedAt: new Date(),
          }

          if (!conversation.title) {
            updateValues.title = content.slice(0, 60)
          }

          await db
            .update(conversations)
            .set(updateValues)
            .where(eq(conversations.id, conversationId))

          // Trigger fact extraction non-blockingly
          extractFacts(userId, conversationId).catch((err: unknown) => {
            console.error('Fact extraction failed:', err)
          })
        } catch (persistErr) {
          console.error('Failed to persist assistant message:', persistErr)
        }
      } catch (streamErr) {
        controller.error(streamErr)
      }
    },
  })

  return sendStream(event, readable)
})
