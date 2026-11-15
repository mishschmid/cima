<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useChat } from '~/composables/useChat'
import { useAudioRecorder } from '~/composables/useAudioRecorder'
import { useAudioPlayer } from '~/composables/useAudioPlayer'
import { useAuth } from '~/composables/useAuth'
import { useTheme } from '~/composables/useTheme'
import ChatMessage from '~/components/ChatMessage.vue'
import CostBadge from '~/components/CostBadge.vue'
import AppSidebar from '~/components/AppSidebar.vue'
import AmbientBackground from '~/components/AmbientBackground.vue'
import VoiceWaveform from '~/components/VoiceWaveform.vue'

const { user, signOut } = useAuth()
const { orangeStartScreen } = useTheme()
const costBadgeRef = ref<InstanceType<typeof CostBadge> | null>(null)

const {
  conversations,
  activeConversationId,
  messages,
  isStreaming,
  error: chatError,
  loadConversations,
  selectConversation,
  createConversation,
  sendMessage,
} = useChat()

const {
  isRecording,
  isTranscribing,
  error: recorderError,
  analyser,
  startRecording,
  stopRecording,
} = useAudioRecorder()

const {
  isPlaying,
  isSynthesizing,
  error: playerError,
  speak,
  stop: stopSpeaking,
} = useAudioPlayer()

const inputMessage = ref('')
const messagesContainer = ref<HTMLElement | null>(null)
const isSidebarOpen = ref(false)
const autoVoiceReply = ref(true)

const canSend = computed(() => {
  return isRecording.value || isTranscribing.value || inputMessage.value.trim().length > 0
})

const isBusy = computed(() => {
  return isStreaming.value || isTranscribing.value
})

const actionButtonTitle = computed(() => {
  if (isRecording.value) return 'Stop and send'
  if (canSend.value) return 'Send message'
  return 'Start voice input'
})

function handleComposerAction() {
  if (isBusy.value) return
  if (isRecording.value) {
    toggleVoiceRecording()
  } else if (inputMessage.value.trim().length > 0) {
    handleSend()
  } else {
    toggleVoiceRecording()
  }
}

const isHeroView = computed(() => {
  return orangeStartScreen.value && messages.value.length === 0
})

const greetingText = computed(() => {
  if (isRecording.value) return 'Listening\nto you…'
  const hour = new Date().getHours()
  const firstName = user.value?.name ? user.value.name.split(' ')[0] : 'there'
  if (hour < 12) return `Good morning,\n${firstName}.`
  if (hour < 18) return `Good afternoon,\n${firstName}.`
  return `Good evening,\n${firstName}.`
})

const activeConversationTitle = computed(() => {
  const current = conversations.value.find((c) => c.id === activeConversationId.value)
  return current?.title || messages.value[0]?.content || 'New conversation'
})

const recentConversations = computed(() => {
  return conversations.value
    .filter((c) => c.id !== activeConversationId.value && c.title)
    .slice(0, 2)
})

const formattedFullDate = computed(() => {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
})

onMounted(async () => {
  await loadConversations()
  costBadgeRef.value?.refresh()
  scrollToBottom()
})

watch(
  [() => messages.value.length, () => messages.value.map((m) => m.content).join('')],
  () => {
    scrollToBottom()
  }
)

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
    requestAnimationFrame(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
      }
    })
  })
}

async function handleSend() {
  const text = inputMessage.value.trim()
  if (!text || isStreaming.value) return
  inputMessage.value = ''
  stopSpeaking()
  scrollToBottom()
  const response = await sendMessage(text)
  costBadgeRef.value?.refresh()
  if (response && autoVoiceReply.value && isPlaying.value) {
    await speak(response)
  }
}

async function sendQuickTopic(topic: string) {
  if (isStreaming.value) return
  inputMessage.value = ''
  stopSpeaking()
  await sendMessage(`Tell me about my ${topic.toLowerCase()} lately.`)
  costBadgeRef.value?.refresh()
}

async function toggleVoiceRecording() {
  stopSpeaking()
  if (isRecording.value) {
    const transcribedText = await stopRecording()
    if (transcribedText) {
      const response = await sendMessage(transcribedText)
      costBadgeRef.value?.refresh()
      if (response && autoVoiceReply.value) {
        await speak(response)
      }
    }
  } else {
    await startRecording()
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

function handleSelectConversation(id: string) {
  isSidebarOpen.value = false
  selectConversation(id)
}

function handleCreateConversation() {
  isSidebarOpen.value = false
  createConversation()
}
</script>

<template>
  <div class="cima-app-shell">
    <!-- Desktop Sidebar / Mobile Drawer -->
    <AppSidebar
      :conversations="conversations"
      :active-id="activeConversationId"
      :open="isSidebarOpen"
      :user="user"
      active-section="chats"
      @select="handleSelectConversation"
      @create="handleCreateConversation"
      @sign-out="signOut"
      @close="isSidebarOpen = false"
    />

    <!-- Mobile Drawer Overlay -->
    <div v-if="isSidebarOpen" class="mobile-backdrop" @click="isSidebarOpen = false" />

    <!-- Main Container Panel -->
    <div class="main-panel-wrap">
      <!-- VIEW A: Orange Hero Screen (D3) -->
      <main v-if="isHeroView" class="main-panel main-panel--hero">
        <AmbientBackground variant="hero" :listening="isRecording" />

        <!-- Unified Top Header (Hero) -->
        <header class="app-header app-header--hero">
          <div class="app-header__left">
            <button
              class="header-btn header-btn--hero header-btn--menu"
              title="Open navigation"
              @click="isSidebarOpen = true"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
            <NuxtLink to="/" class="app-header__brand app-header__brand--hero">
              cima<span class="brand-dot">.</span>
            </NuxtLink>
            <span class="app-header__divider app-header__divider--hero" />
            <span class="app-header__title app-header__title--hero">
              {{ formattedFullDate }}
            </span>
          </div>
          <div class="app-header__right">
            <CostBadge ref="costBadgeRef" variant="hero" />
          </div>
        </header>

        <!-- Hero Center Section -->
        <div class="hero-center">
          <h1 class="hero-greeting">{{ greetingText }}</h1>
          <p class="hero-subtitle">Ask about your runs, your meals, or whatever is on your mind.</p>

          <!-- Hero Composer -->
          <div class="hero-composer">
            <div
              v-if="isRecording"
              class="hero-waveform-wrap"
              title="Click to stop and send"
              @click="toggleVoiceRecording"
            >
              <VoiceWaveform :analyser="analyser" />
            </div>

            <input
              v-else
              v-model="inputMessage"
              class="hero-input"
              type="text"
              :placeholder="isTranscribing ? 'Transcribing audio…' : 'Ask Cima anything…'"
              :disabled="isTranscribing"
              @keydown="handleKeydown"
            />

            <button
              type="button"
              :class="[
                'hero-action-btn',
                {
                  'hero-action-btn--send': canSend,
                  'hero-action-btn--recording': isRecording,
                },
              ]"
              :disabled="isBusy"
              :title="actionButtonTitle"
              :aria-label="actionButtonTitle"
              @click="handleComposerAction"
            >
              <span class="action-btn__icon" aria-hidden="true">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </svg>
              </span>
              <span class="action-btn__text">Send</span>
            </button>
          </div>

          <!-- Quick Topic Chips -->
          <div class="hero-topics">
            <span class="hero-topic hero-topic--active" @click="sendQuickTopic('Runs')">Runs</span>
            <span class="hero-topic" @click="sendQuickTopic('Food')">Food</span>
            <span class="hero-topic" @click="sendQuickTopic('Sleep')">Sleep</span>
            <span class="hero-topic" @click="sendQuickTopic('Mood')">Mood</span>
            <span class="hero-topic" @click="sendQuickTopic('Plans')">Plans</span>
          </div>
        </div>

        <!-- Hero Bottom Cards (Continue Recent) -->
        <div v-if="recentConversations.length > 0" class="hero-continue-grid">
          <div
            v-for="c in recentConversations"
            :key="c.id"
            class="continue-card"
            @click="selectConversation(c.id)"
          >
            <div class="continue-card__avatar">c</div>
            <div class="continue-card__info">
              <span class="continue-card__meta">Continue · recent</span>
              <span class="continue-card__title">{{ c.title }}</span>
            </div>
            <div class="continue-card__icon">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="7" y1="17" x2="17" y2="7"></line>
                <polyline points="7 7 17 7 17 17"></polyline>
              </svg>
            </div>
          </div>
        </div>
      </main>

      <!-- VIEW B: Active Chat Stream (D1 / D2) -->
      <main v-else class="main-panel main-panel--chat">
        <AmbientBackground :listening="isRecording" />

        <!-- Unified Top Header (Chat) -->
        <header class="app-header">
          <div class="app-header__left">
            <button
              class="header-btn header-btn--menu"
              title="Open navigation"
              @click="isSidebarOpen = true"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
            <NuxtLink
              to="/"
              class="app-header__brand"
              title="New conversation"
              @click.prevent="handleCreateConversation"
            >
              cima<span class="brand-dot">.</span>
            </NuxtLink>
            <span class="app-header__divider" />
            <span class="app-header__title" :title="activeConversationTitle">
              {{ activeConversationTitle }}
            </span>
          </div>
          <div class="app-header__right">
            <CostBadge ref="costBadgeRef" variant="standard" />
            <button class="header-btn" title="New conversation" @click="handleCreateConversation">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
          </div>
        </header>

        <!-- Message Stream -->
        <div ref="messagesContainer" class="chat-messages-container">
          <div class="chat-messages-inner">
            <ChatMessage
              v-for="(msg, idx) in messages"
              :key="idx"
              :role="msg.role"
              :content="msg.content"
              :model="msg.model"
              :total-tokens="msg.totalTokens"
              :cost-usd="msg.costUsd"
              :thinking="isStreaming && idx === messages.length - 1 && msg.role === 'assistant'"
              :speaking="isPlaying && idx === messages.length - 1 && msg.role === 'assistant'"
              :animated="msg.animated"
              @stop-speaking="stopSpeaking"
            />
          </div>
        </div>

        <!-- Chat Composer -->
        <footer class="chat-composer-wrap">
          <div class="chat-composer">
            <div
              v-if="isRecording"
              class="composer-waveform-wrap"
              title="Click to stop and send"
              @click="toggleVoiceRecording"
            >
              <VoiceWaveform :analyser="analyser" />
            </div>

            <input
              v-else
              v-model="inputMessage"
              class="composer-input"
              type="text"
              :placeholder="isTranscribing ? 'Transcribing audio…' : 'Ask Cima anything…'"
              :disabled="isTranscribing"
              @keydown="handleKeydown"
            />

            <button
              type="button"
              :class="[
                'composer-action-btn',
                {
                  'composer-action-btn--send': canSend,
                  'composer-action-btn--recording': isRecording,
                },
              ]"
              :disabled="isBusy"
              :title="actionButtonTitle"
              :aria-label="actionButtonTitle"
              @click="handleComposerAction"
            >
              <span class="action-btn__icon" aria-hidden="true">
                <svg
                  width="19"
                  height="19"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </svg>
              </span>
              <span class="action-btn__text">Send</span>
            </button>
          </div>
        </footer>
      </main>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cima-app-shell {
  display: flex;
  height: 100vh;
  width: 100vw;
  padding: 12px;
  gap: 12px;
  box-sizing: border-box;
  background-color: var(--bg-page);
  color: var(--ink);
  overflow: hidden;

  @media (max-width: 900px) {
    padding: 0;
    gap: 0;
    flex-direction: column;
  }
}

.mobile-backdrop {
  display: none;

  @media (max-width: 900px) {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 90;
  }
}

.main-panel-wrap {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.brand-dot {
  color: var(--orange);
}

.main-panel {
  flex: 1;
  min-width: 0;
  position: relative;
  border-radius: var(--radius-panel);
  overflow: hidden;
  display: flex;
  flex-direction: column;

  @media (max-width: 900px) {
    border-radius: 0;
  }

  &--hero {
    background: var(--orange);
    color: var(--on-orange);
    padding: 0;
    box-sizing: border-box;
  }

  &--chat {
    background: var(--bg-surface);
  }
}

/* Unified App Header */
.app-header {
  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  height: 52px;
  padding: 0 16px;
  border-bottom: 1px solid var(--line);
  background: var(--bg-surface);
  flex: none;

  @media (min-width: 901px) {
    padding: 0 24px;
    height: 54px;
  }

  &--hero {
    background: transparent;
    border-bottom: 1px solid rgba(17, 17, 17, 0.08);
  }

  &__left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex: 1;
  }

  &__brand {
    font-size: 24px;
    font-weight: 500;
    letter-spacing: -0.065em;
    line-height: 0.8;
    color: var(--ink);
    text-decoration: none;
    flex: none;

    @media (min-width: 901px) {
      display: none;
    }

    &--hero {
      color: #111111;

      .brand-dot {
        color: #ffffff;
      }
    }
  }

  &__divider {
    width: 1px;
    height: 14px;
    background: var(--line);
    flex: none;

    @media (min-width: 901px) {
      display: none;
    }

    &--hero {
      background: rgba(17, 17, 17, 0.18);
    }
  }

  &__title {
    font-size: 14px;
    font-weight: 500;
    letter-spacing: -0.015em;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;

    @media (min-width: 901px) {
      font-size: 15px;
    }

    &--hero {
      font-family: var(--font-mono);
      font-size: 11px;
      color: rgba(17, 17, 17, 0.65);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
  }

  &__right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
  }
}

.header-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--bg-sunken);
  color: var(--ink);
  border: 0;
  display: grid;
  place-items: center;
  flex: none;
  cursor: pointer;
  transition:
    opacity 0.15s ease,
    background-color 0.15s ease;

  &:hover {
    opacity: 0.85;
  }

  &--menu {
    background: var(--btn-primary);
    color: var(--btn-primary-ink);

    @media (min-width: 901px) {
      display: none;
    }
  }

  &--hero {
    background: rgba(17, 17, 17, 0.1);
    color: #111111;

    &:hover {
      background: rgba(17, 17, 17, 0.18);
    }
  }
}

/* Hero Section Styles */
.hero-center {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 22px;
  padding: 24px 40px;

  @media (max-width: 768px) {
    padding: 16px 18px;
    gap: 16px;
  }
}

.hero-greeting {
  font-size: 104px;
  font-weight: 300;
  letter-spacing: -0.055em;
  line-height: 0.92;
  white-space: pre-line;
  color: var(--on-orange);

  @media (max-width: 1024px) {
    font-size: 64px;
  }

  @media (max-width: 600px) {
    font-size: 48px;
  }
}

.hero-subtitle {
  font-size: 20px;
  color: var(--on-orange-muted);
  max-width: 560px;
  line-height: 1.4;

  @media (max-width: 600px) {
    font-size: 16px;
  }
}

.hero-composer {
  max-width: 760px;
  width: 100%;
  background: rgba(17, 17, 17, 0.09);
  border-radius: var(--radius-pill);
  padding: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;

  .hero-waveform-wrap {
    flex: 1;
    min-width: 0;
    height: 52px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0 16px;
    color: var(--on-orange);
  }

  .hero-input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    outline: none;
    font-size: 18px;
    color: #111;
    padding: 0 14px 0 20px;

    &::placeholder {
      color: #111;
      opacity: 0.55;
    }

    &:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
  }

  .hero-action-btn {
    position: relative;
    height: 52px;
    width: 52px;
    min-width: 52px;
    border-radius: 26px;
    border: 0;
    outline: none;
    background: rgba(17, 17, 17, 0.1);
    color: #111;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex: none;
    overflow: hidden;
    padding: 0;
    transition:
      width 0.24s cubic-bezier(0.16, 1, 0.3, 1),
      background-color 0.2s ease,
      color 0.18s ease,
      box-shadow 0.2s ease,
      transform 0.12s ease;

    &:hover:not(:disabled) {
      background: rgba(17, 17, 17, 0.16);
    }

    &:active:not(:disabled) {
      transform: scale(0.97);
    }

    &--send {
      width: 86px;
      min-width: 86px;
      background: #111;
      color: #fff;

      &:hover:not(:disabled) {
        background: #222;
      }

      .action-btn__icon {
        opacity: 0;
        transform: scale(0.6);
        pointer-events: none;
      }

      .action-btn__text {
        opacity: 1;
        transform: scale(1);
        pointer-events: auto;
      }
    }

    &--recording {
      background: #111111 !important;
      color: #ffffff !important;
      box-shadow:
        0 0 0 2px var(--orange),
        0 0 0 4px #111111;
      animation: mic-pulse-hero 1.6s ease-out infinite;
    }

    &:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
  }
}

.hero-topics {
  display: flex;
  gap: 28px;
  font-size: 76px;
  font-weight: 400;
  letter-spacing: -0.045em;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  user-select: none;

  @media (max-width: 1024px) {
    font-size: 48px;
    gap: 16px;
  }

  @media (max-width: 600px) {
    font-size: 32px;
  }

  .hero-topic {
    color: rgba(17, 17, 17, 0.42);
    cursor: pointer;
    transition: color 0.15s ease;

    &:hover,
    &--active {
      color: #111;
    }
  }
}

.hero-continue-grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
}

.continue-card {
  background: #ffffff;
  color: #111;
  border-radius: 26px;
  padding: 16px 16px 16px 20px;
  display: flex;
  align-items: center;
  gap: 14px;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  }

  &__avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: #111111;
    color: var(--orange);
    display: grid;
    place-items: center;
    font-size: 18px;
    font-weight: 600;
    flex: none;
  }

  &__info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  &__meta {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--ink-2);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  &__title {
    font-size: 18px;
    font-weight: 500;
    letter-spacing: -0.02em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__icon {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--bg-sunken);
    display: grid;
    place-items: center;
    flex: none;
  }
}

/* Chat View Styles */
.chat-messages-container {
  position: relative;
  z-index: 1;
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;

  @media (min-width: 901px) {
    padding: 20px 28px;
  }
}

.chat-messages-inner {
  max-width: 880px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.chat-composer-wrap {
  position: relative;
  z-index: 1;
  padding: 14px 28px 24px;

  @media (max-width: 600px) {
    padding: 8px 12px 18px;
  }
}

.chat-composer {
  max-width: 880px;
  margin: 0 auto;
  background: var(--bg-sunken);
  border-radius: var(--radius-pill);
  padding: 8px;
  display: flex;
  align-items: center;
  gap: 8px;

  .composer-waveform-wrap {
    flex: 1;
    min-width: 0;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0 16px;
    color: var(--ink);
  }

  .composer-input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    outline: none;
    font-size: 17px;
    color: var(--ink);
    padding: 0 12px 0 18px;

    &::placeholder {
      color: var(--ink-2);
    }

    &:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
  }

  .composer-action-btn {
    position: relative;
    height: 48px;
    width: 48px;
    min-width: 48px;
    border-radius: 24px;
    border: 0;
    outline: none;
    background: var(--bg-surface);
    color: var(--ink);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex: none;
    overflow: hidden;
    padding: 0;
    transition:
      width 0.24s cubic-bezier(0.16, 1, 0.3, 1),
      background-color 0.2s ease,
      color 0.18s ease,
      box-shadow 0.2s ease,
      transform 0.12s ease;

    &:hover:not(:disabled) {
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
    }

    &:active:not(:disabled) {
      transform: scale(0.97);
    }

    &--send {
      width: 80px;
      min-width: 80px;
      background: var(--btn-primary);
      color: var(--btn-primary-ink);

      &:hover:not(:disabled) {
        opacity: 0.92;
        box-shadow: none;
      }

      .action-btn__icon {
        opacity: 0;
        transform: scale(0.6);
        pointer-events: none;
      }

      .action-btn__text {
        opacity: 1;
        transform: scale(1);
        pointer-events: auto;
      }
    }

    &--recording {
      background: var(--btn-primary) !important;
      color: var(--btn-primary-ink) !important;
      box-shadow:
        0 0 0 2px var(--bg-surface),
        0 0 0 4px var(--orange);
      animation: mic-pulse 1.6s ease-out infinite;
    }

    &:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
  }
}

.action-btn__icon {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    opacity 0.18s ease,
    transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  opacity: 1;
  transform: scale(1);
}

.action-btn__text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 500;
  letter-spacing: -0.01em;
  white-space: nowrap;
  transition:
    opacity 0.18s ease,
    transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  opacity: 0;
  transform: scale(0.7);
  pointer-events: none;
}

@keyframes mic-pulse {
  0% {
    box-shadow:
      0 0 0 2px var(--bg-surface),
      0 0 0 3px rgba(255, 91, 53, 0.8);
  }
  50% {
    box-shadow:
      0 0 0 2px var(--bg-surface),
      0 0 0 6px rgba(255, 91, 53, 0.4);
  }
  100% {
    box-shadow:
      0 0 0 2px var(--bg-surface),
      0 0 0 3px rgba(255, 91, 53, 0.8);
  }
}

@keyframes mic-pulse-hero {
  0% {
    box-shadow:
      0 0 0 2px var(--orange),
      0 0 0 3px rgba(17, 17, 17, 0.8);
  }
  50% {
    box-shadow:
      0 0 0 2px var(--orange),
      0 0 0 6px rgba(17, 17, 17, 0.4);
  }
  100% {
    box-shadow:
      0 0 0 2px var(--orange),
      0 0 0 3px rgba(17, 17, 17, 0.8);
  }
}
</style>
