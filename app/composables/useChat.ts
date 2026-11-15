import { ref } from 'vue'

export interface ConversationItem {
  id: string
  userId: string
  title: string | null
  createdAt: string
  updatedAt: string
}

export interface MessageItem {
  id?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  model?: string | null
  promptTokens?: number | null
  completionTokens?: number | null
  totalTokens?: number | null
  costUsd?: string | number | null
  createdAt?: string
  animated?: boolean
}

export function useChat() {
  const conversations = ref<ConversationItem[]>([])
  const activeConversationId = ref<string | null>(null)
  const messages = ref<MessageItem[]>([])
  const isStreaming = ref(false)
  const error = ref<string | null>(null)

  async function loadConversations() {
    error.value = null
    try {
      const data = await $fetch<ConversationItem[]>('/api/conversations')
      conversations.value = data
      const first = data[0]
      if (first && !activeConversationId.value) {
        await selectConversation(first.id)
      }
    } catch (e: any) {
      error.value = e?.statusMessage || 'Failed to load conversations'
    }
  }

  async function selectConversation(id: string) {
    if (isStreaming.value) return
    activeConversationId.value = id
    error.value = null
    try {
      const msgs = await $fetch<MessageItem[]>(`/api/conversations/${id}/messages`)
      messages.value = msgs
    } catch (e: any) {
      error.value = e?.statusMessage || 'Failed to load messages'
    }
  }

  async function createConversation(): Promise<string | null> {
    if (isStreaming.value) return null
    error.value = null
    try {
      const created = await $fetch<ConversationItem>('/api/conversations', {
        method: 'POST',
      })
      conversations.value.unshift(created)
      activeConversationId.value = created.id
      messages.value = []
      return created.id
    } catch (e: any) {
      error.value = e?.statusMessage || 'Failed to create conversation'
      return null
    }
  }

  async function sendMessage(
    content: string,
    options?: { onChunk?: (chunk: string) => void }
  ): Promise<string | null> {
    const trimmed = content.trim()
    if (!trimmed || isStreaming.value) return null

    error.value = null

    // Optimistically add user message and assistant placeholder immediately without any delay
    const userMsg: MessageItem = {
      role: 'user',
      content: trimmed,
      animated: true,
    }

    const assistantMsg: MessageItem = {
      role: 'assistant',
      content: '',
      animated: true,
    }

    messages.value.push(userMsg, assistantMsg)
    const assistantMsgIndex = messages.value.length - 1
    isStreaming.value = true

    let convId = activeConversationId.value
    if (!convId) {
      try {
        const created = await $fetch<ConversationItem>('/api/conversations', {
          method: 'POST',
        })
        conversations.value.unshift(created)
        activeConversationId.value = created.id
        convId = created.id
      } catch (e: any) {
        error.value = e?.statusMessage || e?.message || 'Failed to create conversation'
        messages.value = messages.value.filter((m) => m !== userMsg && m !== assistantMsg)
        isStreaming.value = false
        return null
      }
    }

    try {
      const response = await fetch(`/api/conversations/${convId}/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ content: trimmed }),
      })

      if (!response.ok || !response.body) {
        throw new Error(`Failed to send message: ${response.statusText}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value, { stream: true })
        const target = messages.value[assistantMsgIndex]
        if (target) {
          target.content += text
        }
        if (text && options?.onChunk) {
          options.onChunk(text)
        }
      }

      const finalAssistantContent = messages.value[assistantMsgIndex]?.content || null

      // Refresh messages list in background to pick up usage tokens and cost without blocking speech
      $fetch<MessageItem[]>(`/api/conversations/${convId}/messages`)
        .then((updatedMsgs) => {
          messages.value = updatedMsgs
        })
        .catch(() => {})

      // Refresh conversations list in background to pick up updated title & order
      $fetch<ConversationItem[]>('/api/conversations')
        .then((updatedList) => {
          conversations.value = updatedList
        })
        .catch(() => {})

      return finalAssistantContent
    } catch (e: any) {
      error.value = e?.message || 'Error while receiving response'
      const target = messages.value[assistantMsgIndex]
      if (target && !target.content) {
        messages.value.splice(assistantMsgIndex, 1)
      }
      return null
    } finally {
      isStreaming.value = false
    }
  }

  return {
    conversations,
    activeConversationId,
    messages,
    isStreaming,
    error,
    loadConversations,
    selectConversation,
    createConversation,
    sendMessage,
  }
}
