import { describe, expect, it } from 'vitest'
import { cleanTextForSpeech, splitIntoSentences, SentenceExtractor } from '../../app/utils/speech'

describe('cleanTextForSpeech', () => {
  it('strips markdown formatting and urls', () => {
    const raw =
      '# Heading\nHello **world**! Visit [our site](https://example.com) or `console.log` snippet.\n```\nconst x = 1;\n```\n- Item 1'
    const cleaned = cleanTextForSpeech(raw)
    expect(cleaned).toBe('Heading Hello world! Visit our site or console.log snippet. Item 1')
  })

  it('handles empty text', () => {
    expect(cleanTextForSpeech('')).toBe('')
  })
})

describe('splitIntoSentences', () => {
  it('splits normal sentences accurately', () => {
    const text = 'Hello there! How are you today? I am doing great.'
    const result = splitIntoSentences(text)
    expect(result).toEqual(['Hello there!', 'How are you today?', 'I am doing great.'])
  })

  it('does not split on abbreviations or decimal numbers', () => {
    const text = 'Dr. Smith bought 2.5 kg of apples at 9 a.m. He was very satisfied.'
    const result = splitIntoSentences(text)
    expect(result).toEqual(['Dr. Smith bought 2.5 kg of apples at 9 a.m. He was very satisfied.'])
  })
})

describe('SentenceExtractor', () => {
  it('extracts sentences in a streaming fashion', () => {
    const extractor = new SentenceExtractor()

    const chunk1 = extractor.push('Hello')
    expect(chunk1).toEqual([])

    const chunk2 = extractor.push(' world. Next sentence')
    expect(chunk2).toEqual(['Hello world.'])

    const chunk3 = extractor.push(' is here! And final')
    expect(chunk3).toEqual(['Next sentence is here!'])

    const final = extractor.finish()
    expect(final).toEqual(['And final'])
  })

  it('does not split on decimals mid-stream', () => {
    const extractor = new SentenceExtractor()
    expect(extractor.push('The version is 1.')).toEqual([])
    expect(extractor.push('2.0 update. ')).toEqual(['The version is 1.2.0 update.'])
    expect(extractor.finish()).toEqual([])
  })
})
