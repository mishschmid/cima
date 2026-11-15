import { describe, expect, it } from 'vitest'
import { accumulateToolCallDeltas, toOpenAiMessages } from '../../../server/utils/llm/openai'
import type { AccumulatedToolCall } from '../../../server/utils/llm/openai'
import type { ChatMessage } from '../../../server/utils/llm/types'

describe('openai message mapping', () => {
  it('maps all roles accurately to OpenAI parameters', () => {
    const input: ChatMessage[] = [
      { role: 'system', content: 'System instruction' },
      { role: 'user', content: 'User query' },
      { role: 'assistant', content: 'Assistant reply' },
    ]

    const result = toOpenAiMessages(input)

    expect(result).toEqual([
      { role: 'system', content: 'System instruction' },
      { role: 'user', content: 'User query' },
      { role: 'assistant', content: 'Assistant reply' },
    ])
  })
})

describe('accumulateToolCallDeltas', () => {
  it('merges streamed tool call fragments by index', () => {
    const calls: AccumulatedToolCall[] = []

    accumulateToolCallDeltas(calls, [
      { index: 0, id: 'call_a', function: { name: 'get_recent', arguments: '{"da' } },
    ])
    accumulateToolCallDeltas(calls, [
      { index: 0, function: { arguments: 'ys":7}' } },
      { index: 1, id: 'call_b', function: { name: 'get_plan', arguments: '{}' } },
    ])

    expect(calls).toEqual([
      { id: 'call_a', name: 'get_recent', arguments: '{"days":7}' },
      { id: 'call_b', name: 'get_plan', arguments: '{}' },
    ])
  })
})
