/**
 * Text and sentence utilities for text-to-speech pipelining.
 */

const COMMON_ABBREVIATIONS = new Set([
  'mr',
  'mrs',
  'ms',
  'dr',
  'prof',
  'sr',
  'jr',
  'vs',
  'etc',
  'eg',
  'ie',
  'am',
  'pm',
  'st',
])

/**
 * Strips markdown syntax, urls, and formatting from text so it sounds natural when spoken.
 */
export function cleanTextForSpeech(text: string): string {
  if (!text) return ''

  let cleaned = text
    // Strip code blocks
    .replace(/```[\s\S]*?```/g, '')
    // Strip inline code
    .replace(/`([^`]+)`/g, '$1')
    // Strip markdown links [label](url) -> label
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Strip bare URLs
    .replace(/https?:\/\/\S+/g, '')
    // Strip bold & italic markers
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    // Strip markdown headers (# Header)
    .replace(/^#{1,6}\s+/gm, '')
    // Strip list bullets and blockquotes at line starts
    .replace(/^[\s]*[-*+]\s+/gm, '')
    .replace(/^[\s]*\d+\.\s+/gm, '')
    .replace(/^>\s+/gm, '')
    // Replace multiple newlines or spaces with single spaces
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned
}

/**
 * Checks if a period at index `dotIndex` in `text` is likely an abbreviation or decimal.
 */
function isFalseSentenceEnd(text: string, dotIndex: number): boolean {
  // Check for decimals: digit before and digit after (e.g. 3.14)
  const prevChar = text[dotIndex - 1]
  const nextChar = text[dotIndex + 1]
  if (prevChar && /\d/.test(prevChar) && nextChar && /\d/.test(nextChar)) {
    return true
  }

  // Check for ellipsis: ..
  if (prevChar === '.' || nextChar === '.') {
    return true
  }

  // Extract the word preceding the dot (e.g. "Dr" in "Dr.")
  const beforeDot = text.slice(0, dotIndex)
  const matchWord = beforeDot.match(/([a-zA-Z]+)$/)
  if (matchWord && matchWord[1]) {
    const word = matchWord[1].toLowerCase()
    // If it's a known abbreviation or a single letter initial (like "J." in "J. Doe")
    if (COMMON_ABBREVIATIONS.has(word) || word.length === 1) {
      return true
    }
  }

  return false
}

/**
 * Splits a full text into speakable sentence chunks.
 */
export function splitIntoSentences(text: string): string[] {
  const cleaned = cleanTextForSpeech(text)
  if (!cleaned) return []

  const sentences: string[] = []
  let startIndex = 0

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i]

    // Sentence delimiters: . ? !
    if (char === '.' || char === '?' || char === '!') {
      if (char === '.' && isFalseSentenceEnd(cleaned, i)) {
        continue
      }

      // Check if delimiter is followed by whitespace or end of string
      const nextChar = cleaned[i + 1]
      if (!nextChar || /\s/.test(nextChar)) {
        const sentence = cleaned.slice(startIndex, i + 1).trim()
        if (sentence) {
          sentences.push(sentence)
        }
        startIndex = i + 1
        // Skip subsequent whitespace
        while (startIndex < cleaned.length) {
          const c = cleaned[startIndex]
          if (!c || !/\s/.test(c)) break
          startIndex++
        }
        i = startIndex - 1
      }
    } else if (i - startIndex > 120 && (char === ',' || char === ';' || char === ':')) {
      // Long clause boundary break for overly long sentences
      const nextChar = cleaned[i + 1]
      if (nextChar && /\s/.test(nextChar)) {
        const clause = cleaned.slice(startIndex, i + 1).trim()
        if (clause) {
          sentences.push(clause)
        }
        startIndex = i + 1
        while (startIndex < cleaned.length) {
          const c = cleaned[startIndex]
          if (!c || !/\s/.test(c)) break
          startIndex++
        }
        i = startIndex - 1
      }
    }
  }

  if (startIndex < cleaned.length) {
    const remainder = cleaned.slice(startIndex).trim()
    if (remainder) {
      sentences.push(remainder)
    }
  }

  return sentences
}

/**
 * Statefully extracts complete sentences from a stream of text chunks.
 */
export class SentenceExtractor {
  private buffer = ''
  private emittedAny = false

  /**
   * @param firstClauseMinLength The first chunk may break at a comma/semicolon/colon once it is
   * this long, so the first audio can start before the opening sentence is complete.
   */
  constructor(private readonly firstClauseMinLength = 30) {}

  /**
   * Pushes a new raw text chunk and returns any newly completed clean sentences.
   */
  push(chunk: string): string[] {
    this.buffer += chunk
    const extracted: string[] = []

    let searchStart = 0
    while (searchStart < this.buffer.length) {
      // Find candidate delimiters
      let delimIndex = -1
      for (let i = searchStart; i < this.buffer.length; i++) {
        const char = this.buffer[i]
        if (char === '.' || char === '?' || char === '!') {
          if (char === '.' && isFalseSentenceEnd(this.buffer, i)) {
            continue
          }
          // In a stream, ensure the delimiter is followed by whitespace so we know it's not still expanding
          const nextChar = this.buffer[i + 1]
          if (nextChar !== undefined && /\s/.test(nextChar)) {
            delimIndex = i
            break
          }
        } else if (
          i >= (this.emittedAny ? 100 : this.firstClauseMinLength) &&
          (char === ',' || char === ';' || char === ':')
        ) {
          const nextChar = this.buffer[i + 1]
          if (nextChar !== undefined && /\s/.test(nextChar)) {
            delimIndex = i
            break
          }
        }
      }

      if (delimIndex === -1) {
        break
      }

      const rawSentence = this.buffer.slice(0, delimIndex + 1)
      this.buffer = this.buffer.slice(delimIndex + 1).replace(/^\s+/, '')
      searchStart = 0

      const cleaned = cleanTextForSpeech(rawSentence)
      if (cleaned) {
        extracted.push(cleaned)
        this.emittedAny = true
      }
    }

    return extracted
  }

  /**
   * Flushes any remaining text in the buffer as the final sentence.
   */
  finish(): string[] {
    const remainder = cleanTextForSpeech(this.buffer)
    this.buffer = ''
    if (remainder) {
      return [remainder]
    }
    return []
  }

  /**
   * Resets the buffer without emitting anything.
   */
  reset(): void {
    this.buffer = ''
    this.emittedAny = false
  }
}
