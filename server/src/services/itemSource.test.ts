import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./scraper', () => ({ scrapeUrl: vi.fn(), MAX_TRANSCRIPT_CHARS: 30_000 }))

import { loadSourceText, chunkText, NoSourceTextError } from './itemSource'
import { scrapeUrl } from './scraper'

const VIDEO = 'https://youtu.be/dQw4w9WgXcQ'
const scraped = (over: Record<string, unknown> = {}) =>
  ({ title: 'T', content: 'c', source: 'youtube', sourceUrl: VIDEO, ...over }) as never

beforeEach(() => vi.mocked(scrapeUrl).mockReset())

describe('loadSourceText', () => {
  it('fetches the transcript for a bare video link', async () => {
    vi.mocked(scrapeUrl).mockResolvedValue(scraped({ transcriptAvailable: true, transcript: 'hello world', channel: 'Chef' }))
    const out = await loadSourceText({ title: 'YouTube Video', content: VIDEO })
    expect(scrapeUrl).toHaveBeenCalledWith(expect.stringContaining('dQw4w9WgXcQ'))
    expect(out).toMatchObject({ text: 'hello world', basis: 'transcript', channel: 'Chef', truncated: false })
  })

  it('prefers source_url when the content has no link', async () => {
    vi.mocked(scrapeUrl).mockResolvedValue(scraped({ transcriptAvailable: true, transcript: 'x' }))
    await loadSourceText({ title: 'T', content: 'short', sourceUrl: VIDEO })
    expect(scrapeUrl).toHaveBeenCalled()
  })

  it('uses stored content (no fetch) when it already holds a real transcript or note', async () => {
    const content = 'word '.repeat(100) + VIDEO
    const out = await loadSourceText({ title: 'T', content })
    expect(scrapeUrl).not.toHaveBeenCalled()
    expect(out.basis).toBe('transcript')
    expect(out.text).toBe(content.trim())
  })

  it('uses stored content for a non-video item', async () => {
    const out = await loadSourceText({ title: 'T', content: 'Just a note about pasta.' })
    expect(scrapeUrl).not.toHaveBeenCalled()
    expect(out).toMatchObject({ basis: 'content', truncated: false })
  })

  it('throws NoSourceTextError when the video has no transcript', async () => {
    vi.mocked(scrapeUrl).mockResolvedValue(scraped({ transcriptAvailable: false, failure: 'captions disabled' }))
    await expect(loadSourceText({ title: 'T', content: VIDEO })).rejects.toThrow(NoSourceTextError)
    await expect(loadSourceText({ title: 'T', content: VIDEO })).rejects.toThrow(/captions disabled/)
  })

  it('throws NoSourceTextError for an empty item', async () => {
    await expect(loadSourceText({ title: 'T', content: '   ' })).rejects.toThrow(NoSourceTextError)
  })

  it('lets a Strict Local Mode error from the scraper propagate', async () => {
    vi.mocked(scrapeUrl).mockRejectedValueOnce(new Error('Strict Local Mode is enabled.'))
    const result = await loadSourceText({ title: 'T', content: VIDEO }).then(() => 'resolved', (e: Error) => e.message)
    expect(result).toMatch(/Strict Local Mode/)
  })

  it('flags truncation when stored content exceeds the cap', async () => {
    const out = await loadSourceText({ title: 'T', content: 'a '.repeat(20_000) })
    expect(out.truncated).toBe(true)
    expect(out.text.length).toBe(30_000)
  })
})

describe('chunkText', () => {
  it('returns one chunk for short text', () => {
    expect(chunkText('short', 100)).toEqual(['short'])
  })

  it('splits long text without losing content', () => {
    const text = Array.from({ length: 200 }, (_, i) => `Sentence number ${i}.`).join(' ')
    const chunks = chunkText(text, 500)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every(c => c.length <= 500)).toBe(true)
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(text)
  })
})
