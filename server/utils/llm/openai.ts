import OpenAI from 'openai'
import type { ChatMessage, ChatOptions, LlmProvider } from './types'
import { CIMA_TOOLS, executeToolCall } from './tools'

export function toOpenAiMessages(
  messages: ChatMessage[]
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  return messages.map((m) => {
    if (m.role === 'system') {
      return { role: 'system', content: m.content }
    }
    if (m.role === 'assistant') {
      return { role: 'assistant', content: m.content }
    }
    return { role: 'user', content: m.content }
  })
}

export interface AccumulatedToolCall {
  id: string
  name: string
  arguments: string
}

type ToolCallDelta = OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall

export function accumulateToolCallDeltas(
  calls: AccumulatedToolCall[],
  deltas: ToolCallDelta[]
): void {
  for (const delta of deltas) {
    const call = (calls[delta.index] ??= { id: '', name: '', arguments: '' })
    if (delta.id) call.id = delta.id
    if (delta.function?.name) call.name += delta.function.name
    if (delta.function?.arguments) call.arguments += delta.function.arguments
  }
}

function addUsage(
  total: { promptTokens: number; completionTokens: number; totalTokens: number },
  usage: OpenAI.CompletionUsage
): void {
  total.promptTokens += usage.prompt_tokens
  total.completionTokens += usage.completion_tokens
  total.totalTokens += usage.total_tokens
}

export function createOpenAiProvider(apiKey: string, defaultModel = 'gpt-4o'): LlmProvider {
  if (!apiKey) {
    throw new Error('Missing API key for OpenAI')
  }

  const client = new OpenAI({ apiKey, fetch: globalThis.fetch })

  return {
    name: 'openai',

    async *streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<string> {
      const enableTools = options?.enableTools ?? true

      if (!enableTools) {
        const stream = await client.chat.completions.create({
          model: options?.model ?? defaultModel,
          messages: toOpenAiMessages(messages),
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens,
          stream: true,
          stream_options: { include_usage: true },
        })

        for await (const chunk of stream) {
          if (chunk.usage && options?.onUsage) {
            options.onUsage({
              promptTokens: chunk.usage.prompt_tokens,
              completionTokens: chunk.usage.completion_tokens,
              totalTokens: chunk.usage.total_tokens,
              model: options?.model ?? defaultModel,
            })
          }
          const text = chunk.choices[0]?.delta?.content
          if (text) {
            yield text
          }
        }
        return
      }

      const model = options?.model ?? defaultModel
      const activeMessages = toOpenAiMessages(messages)
      const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

      // Stream the tool-enabled call so plain answers reach the client token by token.
      // Tool call fragments are accumulated and only executed if the model requested any.
      const firstStream = await client.chat.completions.create({
        model,
        messages: activeMessages,
        tools: CIMA_TOOLS.map((t) => ({
          type: 'function' as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        })),
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens,
        stream: true,
        stream_options: { include_usage: true },
      })

      const toolCalls: AccumulatedToolCall[] = []
      let firstContent = ''

      for await (const chunk of firstStream) {
        if (chunk.usage) addUsage(usage, chunk.usage)
        const delta = chunk.choices[0]?.delta
        if (delta?.tool_calls) accumulateToolCallDeltas(toolCalls, delta.tool_calls)
        if (delta?.content) {
          firstContent += delta.content
          yield delta.content
        }
      }

      const requestedCalls = toolCalls.filter(Boolean)

      if (requestedCalls.length > 0) {
        activeMessages.push({
          role: 'assistant',
          content: firstContent || null,
          tool_calls: requestedCalls.map((c) => ({
            id: c.id,
            type: 'function' as const,
            function: { name: c.name, arguments: c.arguments },
          })),
        })

        const results = await Promise.all(
          requestedCalls.map(async (call) => {
            let parsedArgs = {}
            try {
              parsedArgs = JSON.parse(call.arguments || '{}')
            } catch {
              parsedArgs = {}
            }
            return { id: call.id, result: await executeToolCall(call.name, parsedArgs) }
          })
        )

        for (const { id, result } of results) {
          activeMessages.push({ role: 'tool', tool_call_id: id, content: result })
        }

        const secondStream = await client.chat.completions.create({
          model,
          messages: activeMessages,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens,
          stream: true,
          stream_options: { include_usage: true },
        })

        for await (const chunk of secondStream) {
          if (chunk.usage) addUsage(usage, chunk.usage)
          const text = chunk.choices[0]?.delta?.content
          if (text) {
            yield text
          }
        }
      }

      options?.onUsage?.({ ...usage, model })
    },

    async completeJson<T>(messages: ChatMessage[], options?: ChatOptions): Promise<T> {
      const response = await client.chat.completions.create({
        model: options?.model ?? defaultModel,
        messages: toOpenAiMessages(messages),
        temperature: options?.temperature ?? 0.1,
        max_tokens: options?.maxTokens,
        response_format: { type: 'json_object' },
      })

      const content = response.choices[0]?.message?.content
      if (!content) {
        throw new Error('OpenAI response did not contain content')
      }

      return JSON.parse(content) as T
    },
  }
}
