import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./classifier.js', () => ({ classify: vi.fn() }))

import { classify } from './classifier.js'
import { excerptTranscript, buildYoutubeClassifierText, summarizeAndClassify } from './summarizer'
import type { ScrapedContent } from './scraper'

const result = { type: 'link', title: 'T', categories: ['Food'], tags: [], summary: 'S', structured: { videoKind: 'recipe' }, confidence: 80 }

const yt = (over: Partial<ScrapedContent> = {}): ScrapedContent => ({
  title: 'Great Pasta', content: 'boil water', source: 'youtube', sourceUrl: 'https://youtu.be/dQw4w9WgXcQ',
  videoId: 'dQw4w9WgXcQ', channel: 'Chef Joe', transcript: 'boil water', transcriptAvailable: true, transcriptTruncated: false, ...over,
})

beforeEach(() => {
  vi.mocked(classify).mockReset()
  vi.mocked(classify).mockResolvedValue(result as never)
})

describe('excerptTranscript', () => {
  it('returns short transcripts unchanged', () => {
    expect(excerptTranscript('short')).toBe('short')
  })

  it('keeps head, middle and tail of a long transcript within a bounded size', () => {
    const long = 'A'.repeat(4000) + 'M'.repeat(20000) + 'Z'.repeat(1000)
    const out = excerptTranscript(long)
    expect(out.length).toBeLessThan(6100)
    expect(out.startsWith('AAAA')).toBe(true)
    expect(out.endsWith('ZZZZ')).toBe(true)
    expect(out).toContain('MMMM')
    expect(out).toContain('[…]')
  })
})

describe('buildYoutubeClassifierText', () => {
  it('includes title, channel and transcript', () => {
    const text = buildYoutubeClassifierText(yt())
    expect(text).toContain('Title: Great Pasta')
    expect(text).toContain('Channel: Chef Joe')
    expect(text).toContain('boil water')
  })

  it('says so when the transcript is unavailable and does not leak placeholder content', () => {
    const text = buildYoutubeClassifierText(yt({ transcript: undefined, transcriptAvailable: false, content: 'x\nTranscript unavailable.' }))
    expect(text).toContain('Transcript unavailable.')
    expect(text).toContain('Channel: Chef Joe')
  })

  it('marks abridged long videos', () => {
    expect(buildYoutubeClassifierText(yt({ transcript: 'x'.repeat(40000), transcriptTruncated: true }))).toContain('abridged')
  })
})

describe('summarizeAndClassify', () => {
  it('passes a video hint and the video prompt text for YouTube', async () => {
    const preview = await summarizeAndClassify(yt())
    const [text, hints] = vi.mocked(classify).mock.calls[0]
    expect(text).toContain('Channel: Chef Joe')
    expect(hints).toMatchObject({ sourceUrl: 'https://youtu.be/dQw4w9WgXcQ', video: { videoId: 'dQw4w9WgXcQ', channel: 'Chef Joe', transcriptAvailable: true } })
    expect(preview).toMatchObject({ source: 'youtube', sourceUrl: 'https://youtu.be/dQw4w9WgXcQ', content: 'boil water' })
  })

  it('passes transcriptAvailable=false when the transcript is missing', async () => {
    await summarizeAndClassify(yt({ transcript: undefined, transcriptAvailable: false }))
    expect(vi.mocked(classify).mock.calls[0][1]).toMatchObject({ video: { transcriptAvailable: false } })
  })

  it('does not send a video hint for ordinary URLs', async () => {
    await summarizeAndClassify({ title: 'Page', content: 'Body', source: 'url', sourceUrl: 'https://example.com' })
    const [text, hints] = vi.mocked(classify).mock.calls[0]
    expect(text).toBe('Title: Page\n\nContent: Body')
    expect(hints).not.toHaveProperty('video')
  })
})
