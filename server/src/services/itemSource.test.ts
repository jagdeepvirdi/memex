import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./scraper', () => ({ scrapeUrl: vi.fn(), MAX_TRANSCRIPT_CHARS: 30_000 }))
const mockFetchVideoDetails = vi.fn()
vi.mock('./youtubeApi', () => ({ fetchVideoDetails: (...a: unknown[]) => mockFetchVideoDetails(...a) }))

import { loadSourceText, chunkText, NoSourceTextError } from './itemSource'
import { scrapeUrl } from './scraper'

const VIDEO = 'https://youtu.be/dQw4w9WgXcQ'
const scraped = (over: Record<string, unknown> = {}) =>
  ({ title: 'T', content: 'c', source: 'youtube', sourceUrl: VIDEO, ...over }) as never

beforeEach(() => {
  vi.mocked(scrapeUrl).mockReset()
  mockFetchVideoDetails.mockReset()
  mockFetchVideoDetails.mockResolvedValue(null)
})

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

describe('loadSourceText — video description (YouTube API key configured)', () => {
  const LONG_DESC = 'Ingredients: 2 cups flour, 1 tsp salt, 1 cup water. Method: mix and bake for 30 minutes. Serves 4.'

  it('passes the description along with a fetched transcript', async () => {
    vi.mocked(scrapeUrl).mockResolvedValue(scraped({ transcriptAvailable: true, transcript: 'spoken words', description: LONG_DESC }))
    const out = await loadSourceText({ title: 'T', content: VIDEO })
    expect(out).toMatchObject({ text: 'spoken words', basis: 'transcript', description: LONG_DESC })
  })

  it('falls back to the description when captions are unavailable', async () => {
    vi.mocked(scrapeUrl).mockResolvedValue(scraped({ transcriptAvailable: false, failure: 'captions disabled', description: LONG_DESC, channel: 'Chef' }))
    const out = await loadSourceText({ title: 'T', content: VIDEO })
    expect(out).toMatchObject({ text: LONG_DESC, basis: 'description', description: LONG_DESC, channel: 'Chef', truncated: false })
  })

  it('does not treat a one-line description as enough to work from', async () => {
    vi.mocked(scrapeUrl).mockResolvedValue(scraped({ transcriptAvailable: false, failure: 'captions disabled', description: 'Subscribe!' }))
    await expect(loadSourceText({ title: 'T', content: VIDEO })).rejects.toThrow(NoSourceTextError)
  })

  it('looks the description up for a saved video that already holds its transcript', async () => {
    mockFetchVideoDetails.mockResolvedValue({ description: LONG_DESC })
    const content = 'word '.repeat(100) + VIDEO
    const out = await loadSourceText({ title: 'T', content })
    expect(mockFetchVideoDetails).toHaveBeenCalledWith('dQw4w9WgXcQ')
    expect(scrapeUrl).not.toHaveBeenCalled()
    expect(out).toMatchObject({ basis: 'transcript', description: LONG_DESC })
  })

  it('does not look anything up for a non-video item', async () => {
    const out = await loadSourceText({ title: 'T', content: 'Just a note about pasta.' })
    expect(mockFetchVideoDetails).not.toHaveBeenCalled()
    expect(out.description).toBeUndefined()
  })

  it('has no description when no key is configured (the lookup returns null)', async () => {
    const content = 'word '.repeat(100) + VIDEO
    expect((await loadSourceText({ title: 'T', content })).description).toBeUndefined()
  })
})
