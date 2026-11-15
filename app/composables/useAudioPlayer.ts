import { ref } from 'vue'
import { cleanTextForSpeech, splitIntoSentences, SentenceExtractor } from '~/utils/speech'

interface AudioItem {
  id: number
  sessionId: number
  text: string
  audioPromise: Promise<string | null>
  abortController: AbortController
}

export function useAudioPlayer() {
  const isPlaying = ref(false)
  const isSynthesizing = ref(false)
  const error = ref<string | null>(null)

  let currentAudio: HTMLAudioElement | null = null
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

  async function fetchAudio(
    text: string,
    sessionId: number,
    abortController: AbortController
  ): Promise<string | null> {
    try {
      const response = await fetch('/api/voice/synthesize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text }),
        signal: abortController.signal,
      })

      if (sessionId !== currentSessionId) return null

      if (!response.ok) {
        throw new Error(`Synthesis failed: ${response.statusText}`)
      }

      const blob = await response.blob()
      if (sessionId !== currentSessionId) return null

      return URL.createObjectURL(blob)
    } catch (err: any) {
      if (err?.name === 'AbortError' || sessionId !== currentSessionId) {
        return null
      }
      console.warn('Synthesis error for sentence:', text, err)
      return null
    }
  }

  function enqueueSentence(sentence: string, sessionId: number) {
    if (sessionId !== currentSessionId || !sentence.trim()) return

    const clean = cleanTextForSpeech(sentence)
    if (!clean) return

    const abortController = new AbortController()
    const audioPromise = fetchAudio(clean, sessionId, abortController)

    queue.push({
      id: nextItemId++,
      sessionId,
      text: clean,
      audioPromise,
      abortController,
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

        const objectUrl = await item.audioPromise
        if (session !== currentSessionId) {
          if (objectUrl) URL.revokeObjectURL(objectUrl)
          break
        }

        if (!objectUrl) {
          queue.shift()
          continue
        }

        isPlaying.value = true
        isSynthesizing.value = false

        await new Promise<void>((resolve) => {
          if (session !== currentSessionId) {
            URL.revokeObjectURL(objectUrl)
            resolve()
            return
          }

          const audio = new Audio(objectUrl)
          currentAudio = audio

          const cleanup = () => {
            audio.onended = null
            audio.onerror = null
            URL.revokeObjectURL(objectUrl)
            if (currentAudio === audio) {
              currentAudio = null
            }
            resolve()
          }

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
        currentAudio.currentTime = 0
      } catch {}
      currentAudio = null
    }

    for (const item of queue) {
      try {
        item.abortController.abort()
      } catch {}
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
