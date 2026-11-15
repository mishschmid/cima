import { ref } from 'vue'
import { cleanTextForSpeech, splitIntoSentences, SentenceExtractor } from '~/utils/speech'
import { markLatency } from '~/utils/latency'

interface AudioItem {
  id: number
  sessionId: number
  text: string
  audio: HTMLAudioElement
  /** Resolves with the element once enough audio is buffered to start, or null on failure */
  ready: Promise<HTMLAudioElement | null>
}

function releaseAudio(audio: HTMLAudioElement) {
  audio.pause()
  audio.removeAttribute('src')
  // Cancels any in-flight download for this element
  audio.load()
}

export function useAudioPlayer() {
  const isPlaying = ref(false)
  const isSynthesizing = ref(false)
  const error = ref<string | null>(null)

  let currentAudio: HTMLAudioElement | null = null
  // Pausing doesn't fire `ended`, so stop() uses this to release the waiting queue
  let finishCurrent: (() => void) | null = null
  let currentSessionId = 0
  let isStreamActive = false
  let isProcessingQueue = false
  let nextItemId = 1
  let queue: AudioItem[] = []
  let wakeQueue: (() => void) | null = null

  function notifyQueue() {
    if (wakeQueue) {
      const fn = wakeQueue
      wakeQueue = null
      fn()
    }
  }

  function waitForQueueNotification(timeoutMs = 100): Promise<void> {
    return new Promise<void>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | null = null
      wakeQueue = () => {
        if (timer) clearTimeout(timer)
        resolve()
      }
      timer = setTimeout(() => {
        wakeQueue = null
        resolve()
      }, timeoutMs)
    })
  }

  // The element streams the GET endpoint itself, so playback can begin before the
  // sentence's audio has fully downloaded. Elements are created as soon as a sentence
  // is queued, so later sentences buffer while earlier ones play.
  function prepareAudio(text: string): Pick<AudioItem, 'audio' | 'ready'> {
    const audio = new Audio()
    audio.preload = 'auto'

    const ready = new Promise<HTMLAudioElement | null>((resolve) => {
      audio.oncanplay = () => {
        markLatency('first TTS audio playable')
        resolve(audio)
      }
      audio.onerror = () => {
        if (audio.getAttribute('src')) console.warn('Synthesis error for sentence:', text)
        resolve(null)
      }
    })

    audio.src = `/api/voice/synthesize?${new URLSearchParams({ text })}`
    return { audio, ready }
  }

  function enqueueSentence(sentence: string, sessionId: number) {
    if (sessionId !== currentSessionId || !sentence.trim()) return

    const clean = cleanTextForSpeech(sentence)
    if (!clean) return

    markLatency('first sentence queued for TTS')
    queue.push({
      id: nextItemId++,
      sessionId,
      text: clean,
      ...prepareAudio(clean),
    })

    notifyQueue()
    processQueue()
  }

  async function processQueue(): Promise<void> {
    if (isProcessingQueue) return
    isProcessingQueue = true

    const session = currentSessionId

    try {
      while (session === currentSessionId) {
        if (queue.length === 0) {
          if (!isStreamActive) {
            isPlaying.value = false
            isSynthesizing.value = false
            break
          }
          isSynthesizing.value = true
          await waitForQueueNotification()
          continue
        }

        const item = queue[0]
        if (!item) {
          continue
        }
        isSynthesizing.value = true

        const audio = await item.ready
        if (session !== currentSessionId) break

        if (!audio) {
          releaseAudio(item.audio)
          queue.shift()
          continue
        }

        isPlaying.value = true
        isSynthesizing.value = false

        await new Promise<void>((resolve) => {
          currentAudio = audio

          const cleanup = () => {
            audio.onplaying = null
            audio.onended = null
            audio.onerror = null
            if (currentAudio === audio) {
              currentAudio = null
            }
            finishCurrent = null
            resolve()
          }
          finishCurrent = cleanup

          audio.onplaying = () => markLatency('first audio playing')
          audio.onended = cleanup
          audio.onerror = () => {
            console.warn('Audio playback error')
            cleanup()
          }

          audio.play().catch((err) => {
            console.warn('Playback play() was rejected:', err)
            cleanup()
          })
        })

        releaseAudio(audio)
        if (session === currentSessionId && queue[0] === item) {
          queue.shift()
        }
      }
    } catch (err: any) {
      if (session === currentSessionId) {
        error.value = err?.message || 'Audio playback error'
      }
    } finally {
      isProcessingQueue = false
      if (session === currentSessionId && !isStreamActive && queue.length === 0) {
        isPlaying.value = false
        isSynthesizing.value = false
      }
    }
  }

  function stop() {
    currentSessionId++
    isStreamActive = false
    notifyQueue()

    if (currentAudio) {
      try {
        currentAudio.pause()
      } catch {}
    }
    finishCurrent?.()

    for (const item of queue) {
      releaseAudio(item.audio)
    }
    queue = []

    isPlaying.value = false
    isSynthesizing.value = false
  }

  async function speak(text: string): Promise<void> {
    const clean = cleanTextForSpeech(text)
    if (!clean) return

    stop()
    const sessionId = ++currentSessionId
    isStreamActive = false
    error.value = null

    const sentences = splitIntoSentences(clean)
    if (sentences.length === 0) return

    for (const s of sentences) {
      enqueueSentence(s, sessionId)
    }

    await processQueue()
  }

  function createSpeechStream() {
    stop()
    const sessionId = ++currentSessionId
    isStreamActive = true
    error.value = null
    const extractor = new SentenceExtractor()

    return {
      push(chunk: string) {
        if (sessionId !== currentSessionId) return
        const sentences = extractor.push(chunk)
        for (const s of sentences) {
          enqueueSentence(s, sessionId)
        }
      },
      finish() {
        if (sessionId !== currentSessionId) return
        const remaining = extractor.finish()
        for (const s of remaining) {
          enqueueSentence(s, sessionId)
        }
        isStreamActive = false
        notifyQueue()
        processQueue()
      },
      cancel() {
        if (sessionId === currentSessionId) {
          stop()
        }
      },
    }
  }

  return {
    isPlaying,
    isSynthesizing,
    error,
    speak,
    createSpeechStream,
    stop,
  }
}
