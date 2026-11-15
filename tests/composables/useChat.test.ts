import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useChat } from '~/composables/useChat'

describe('useChat', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('immediately adds the user message and assistant placeholder with animated: true synchronously on send', async () => {
    // Mock global fetch for streaming messages endpoint
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('Hello back!'))
        controller.close()
      },
    })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        body: stream,
      })
    )

    // Mock $fetch for conversations creation and message refreshes
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/conversations') {
        return Promise.resolve({
          id: 'conv-123',
          userId: 'user-1',
          title: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      }
      if (url.includes('/messages')) {
        return Promise.resolve([
          { role: 'user', content: 'Hello Cima' },
          { role: 'assistant', content: 'Hello back!' },
        ])
      }
      return Promise.resolve([])
    })
    vi.stubGlobal('$fetch', fetchMock)

    const { messages, sendMessage, isStreaming } = useChat()

    expect(messages.value).toHaveLength(0)

    // Call sendMessage without awaiting it immediately
    const sendPromise = sendMessage('Hello Cima')

    // Synchronously / immediately:
    // User message and assistant placeholder are already in messages with animated: true
    expect(messages.value).toHaveLength(2)
    expect(messages.value[0]).toMatchObject({
      role: 'user',
      content: 'Hello Cima',
      animated: true,
    })
    expect(messages.value[1]).toMatchObject({
      role: 'assistant',
      content: '',
      animated: true,
    })
    expect(isStreaming.value).toBe(true)

    // Await completion
    await sendPromise

    expect(isStreaming.value).toBe(false)
  })
})
